use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

use crate::command_error::HostCommandError;
use crate::AppState;

pub(crate) const GLOBAL_STATE_CHANGED_EVENT_NAME: &str = "forge://global-state-changed";
const QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY: &str = "queued-follow-ups";
const QUEUED_FOLLOW_UP_SEND_LOCK_TTL_MS: u128 = 120_000;
const QUEUED_FOLLOW_UP_RECENT_SENT_TTL_MS: u128 = 300_000;

#[derive(Default)]
pub(crate) struct GlobalStateStore {
    values: HashMap<String, Value>,
    queued_follow_up_send_locks: HashMap<QueuedFollowUpSendLockKey, QueuedFollowUpSendLock>,
    recently_sent_queued_follow_ups: HashMap<QueuedFollowUpSentMessageKey, u128>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct QueuedFollowUpSendLockKey {
    conversation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct QueuedFollowUpSendLock {
    lock_id: String,
    acquired_at_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct QueuedFollowUpSentMessageKey {
    conversation_id: String,
    message_id: String,
}

#[derive(Serialize)]
pub(crate) struct HostGlobalStateReadResponse {
    value: Value,
}

#[derive(Serialize)]
pub(crate) struct HostGlobalStateWriteResponse {
    success: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GlobalStateChangedEvent {
    key: String,
    value: Value,
}

#[derive(Serialize)]
pub(crate) struct QueuedFollowUpSendLockAcquireResponse {
    acquired: bool,
}

#[derive(Serialize)]
pub(crate) struct QueuedFollowUpSendLockReleaseResponse {
    released: bool,
}

#[tauri::command]
pub(crate) fn host_read_global_state(
    state: State<'_, AppState>,
    key: String,
) -> Result<HostGlobalStateReadResponse, HostCommandError> {
    let key = validate_global_state_key(&key)?;
    let store = state
        .global_state
        .lock()
        .map_err(|_| HostCommandError::process_failed("global state lock poisoned"))?;
    Ok(HostGlobalStateReadResponse {
        value: store.values.get(key).cloned().unwrap_or(Value::Null),
    })
}

#[tauri::command]
pub(crate) fn host_write_global_state(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<HostGlobalStateWriteResponse, HostCommandError> {
    let key = validate_global_state_key(&key)?.to_string();
    {
        let mut store = state
            .global_state
            .lock()
            .map_err(|_| HostCommandError::process_failed("global state lock poisoned"))?;
        store.values.insert(key.clone(), value.clone());
    }
    app.emit(
        GLOBAL_STATE_CHANGED_EVENT_NAME,
        GlobalStateChangedEvent { key, value },
    )
    .map_err(|error| {
        HostCommandError::process_failed(format!("failed to emit global state change: {error}"))
    })?;
    Ok(HostGlobalStateWriteResponse { success: true })
}

#[tauri::command]
pub(crate) fn host_write_queued_follow_ups_for_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    previous_ids: Vec<String>,
    queue: Vec<Value>,
) -> Result<HostGlobalStateWriteResponse, HostCommandError> {
    let thread_id = validate_non_empty("threadId", &thread_id)?.to_string();
    let previous_ids = previous_ids
        .into_iter()
        .filter_map(|id| {
            let trimmed = id.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
        .collect::<HashSet<_>>();
    let value = {
        let mut store = state
            .global_state
            .lock()
            .map_err(|_| HostCommandError::process_failed("global state lock poisoned"))?;
        merge_queued_follow_up_thread(&mut store, &thread_id, previous_ids, queue)
    };
    app.emit(
        GLOBAL_STATE_CHANGED_EVENT_NAME,
        GlobalStateChangedEvent {
            key: QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY.to_string(),
            value,
        },
    )
    .map_err(|error| {
        HostCommandError::process_failed(format!("failed to emit global state change: {error}"))
    })?;
    Ok(HostGlobalStateWriteResponse { success: true })
}

#[tauri::command]
pub(crate) fn host_acquire_queued_follow_up_send_lock(
    state: State<'_, AppState>,
    conversation_id: String,
    message_id: String,
    lock_id: String,
) -> Result<QueuedFollowUpSendLockAcquireResponse, HostCommandError> {
    let key = queued_follow_up_send_lock_key(&conversation_id, &message_id)?;
    let message_key = queued_follow_up_sent_message_key(&conversation_id, &message_id)?;
    let lock_id = validate_non_empty("lockId", &lock_id)?.to_string();
    let now_ms = current_time_ms();
    let mut store = state
        .global_state
        .lock()
        .map_err(|_| HostCommandError::process_failed("global state lock poisoned"))?;
    prune_queued_follow_up_lock_state(&mut store, now_ms);
    if store
        .recently_sent_queued_follow_ups
        .contains_key(&message_key)
    {
        return Ok(QueuedFollowUpSendLockAcquireResponse { acquired: false });
    }
    match store.queued_follow_up_send_locks.get(&key) {
        Some(existing)
            if existing.lock_id != lock_id
                && !queued_follow_up_send_lock_expired(existing, now_ms) =>
        {
            Ok(QueuedFollowUpSendLockAcquireResponse { acquired: false })
        }
        _ => {
            store.queued_follow_up_send_locks.insert(
                key,
                QueuedFollowUpSendLock {
                    lock_id,
                    acquired_at_ms: now_ms,
                },
            );
            Ok(QueuedFollowUpSendLockAcquireResponse { acquired: true })
        }
    }
}

#[tauri::command]
pub(crate) fn host_release_queued_follow_up_send_lock(
    state: State<'_, AppState>,
    conversation_id: String,
    message_id: String,
    lock_id: String,
    sent: bool,
) -> Result<QueuedFollowUpSendLockReleaseResponse, HostCommandError> {
    let key = queued_follow_up_send_lock_key(&conversation_id, &message_id)?;
    let message_key = queued_follow_up_sent_message_key(&conversation_id, &message_id)?;
    let lock_id = validate_non_empty("lockId", &lock_id)?;
    let now_ms = current_time_ms();
    let mut store = state
        .global_state
        .lock()
        .map_err(|_| HostCommandError::process_failed("global state lock poisoned"))?;
    prune_queued_follow_up_lock_state(&mut store, now_ms);
    let released = match store.queued_follow_up_send_locks.get(&key) {
        Some(existing) if existing.lock_id == lock_id => {
            store.queued_follow_up_send_locks.remove(&key);
            true
        }
        _ => false,
    };
    if released && sent {
        store
            .recently_sent_queued_follow_ups
            .insert(message_key, now_ms);
    }
    Ok(QueuedFollowUpSendLockReleaseResponse { released })
}

fn validate_global_state_key(key: &str) -> Result<&str, HostCommandError> {
    validate_non_empty("global state key", key)
}

fn queued_follow_up_send_lock_key(
    conversation_id: &str,
    message_id: &str,
) -> Result<QueuedFollowUpSendLockKey, HostCommandError> {
    let _ = validate_non_empty("messageId", message_id)?;
    Ok(QueuedFollowUpSendLockKey {
        conversation_id: validate_non_empty("conversationId", conversation_id)?.to_string(),
    })
}

fn queued_follow_up_sent_message_key(
    conversation_id: &str,
    message_id: &str,
) -> Result<QueuedFollowUpSentMessageKey, HostCommandError> {
    Ok(QueuedFollowUpSentMessageKey {
        conversation_id: validate_non_empty("conversationId", conversation_id)?.to_string(),
        message_id: validate_non_empty("messageId", message_id)?.to_string(),
    })
}

fn merge_queued_follow_up_thread(
    store: &mut GlobalStateStore,
    thread_id: &str,
    previous_ids: HashSet<String>,
    queue: Vec<Value>,
) -> Value {
    let mut state = store
        .values
        .get(QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);
    let current_queue = state
        .get(thread_id)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let next_ids = queue
        .iter()
        .filter_map(queued_follow_up_id)
        .collect::<HashSet<_>>();
    let mut merged_queue = queue;
    for item in current_queue {
        let Some(id) = queued_follow_up_id(&item) else {
            continue;
        };
        if previous_ids.contains(&id) || next_ids.contains(&id) {
            continue;
        }
        merged_queue.push(item);
    }
    if merged_queue.is_empty() {
        state.remove(thread_id);
    } else {
        state.insert(thread_id.to_string(), Value::Array(merged_queue));
    }
    let value = Value::Object(state);
    store.values.insert(
        QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY.to_string(),
        value.clone(),
    );
    value
}

fn queued_follow_up_id(value: &Value) -> Option<String> {
    value
        .as_object()
        .and_then(|record| record.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToString::to_string)
}

fn current_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn queued_follow_up_send_lock_expired(lock: &QueuedFollowUpSendLock, now_ms: u128) -> bool {
    now_ms.saturating_sub(lock.acquired_at_ms) > QUEUED_FOLLOW_UP_SEND_LOCK_TTL_MS
}

fn prune_queued_follow_up_lock_state(store: &mut GlobalStateStore, now_ms: u128) {
    store
        .queued_follow_up_send_locks
        .retain(|_, lock| !queued_follow_up_send_lock_expired(lock, now_ms));
    store
        .recently_sent_queued_follow_ups
        .retain(|_, sent_at_ms| {
            now_ms.saturating_sub(*sent_at_ms) <= QUEUED_FOLLOW_UP_RECENT_SENT_TTL_MS
        });
}

fn validate_non_empty<'a>(label: &str, value: &'a str) -> Result<&'a str, HostCommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostCommandError::invalid_input(format!("{label} is empty")));
    }
    Ok(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn global_state_store_reads_null_for_missing_keys() {
        let store = GlobalStateStore::default();
        assert_eq!(store.values.get("queued-follow-ups"), None);
    }

    #[test]
    fn queued_follow_up_locks_are_single_flight_per_conversation() {
        let mut store = GlobalStateStore::default();
        let key = queued_follow_up_send_lock_key("thread-1", "message-1").unwrap();
        let same_thread_other_message =
            queued_follow_up_send_lock_key("thread-1", "message-2").unwrap();
        let other_thread = queued_follow_up_send_lock_key("thread-2", "message-1").unwrap();
        assert_eq!(key, same_thread_other_message);
        assert_ne!(key, other_thread);
        assert_eq!(
            store.queued_follow_up_send_locks.insert(
                key.clone(),
                QueuedFollowUpSendLock {
                    lock_id: "lock-a".to_string(),
                    acquired_at_ms: 1_000,
                },
            ),
            None
        );
        assert_eq!(
            store
                .queued_follow_up_send_locks
                .get(&key)
                .map(|lock| lock.lock_id.as_str()),
            Some("lock-a")
        );
        assert_ne!(
            store
                .queued_follow_up_send_locks
                .get(&key)
                .map(|lock| lock.lock_id.as_str()),
            Some("lock-b")
        );
    }

    #[test]
    fn queued_follow_up_thread_merge_preserves_concurrent_messages() {
        let mut store = GlobalStateStore::default();
        store.values.insert(
            QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY.to_string(),
            json!({
                "thread-1": [{ "id": "existing" }, { "id": "concurrent" }],
                "thread-2": [{ "id": "other" }],
            }),
        );
        let next = merge_queued_follow_up_thread(
            &mut store,
            "thread-1",
            HashSet::from(["existing".to_string()]),
            vec![json!({ "id": "existing" }), json!({ "id": "new" })],
        );
        assert_eq!(
            next,
            json!({
                "thread-1": [{ "id": "existing" }, { "id": "new" }, { "id": "concurrent" }],
                "thread-2": [{ "id": "other" }],
            })
        );
    }

    #[test]
    fn queued_follow_up_thread_merge_deletes_previous_ids_but_keeps_newer_unknowns() {
        let mut store = GlobalStateStore::default();
        store.values.insert(
            QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY.to_string(),
            json!({
                "thread-1": [{ "id": "remove" }, { "id": "keep" }, { "id": "concurrent" }],
            }),
        );
        let next = merge_queued_follow_up_thread(
            &mut store,
            "thread-1",
            HashSet::from(["remove".to_string(), "keep".to_string()]),
            vec![json!({ "id": "keep" })],
        );
        assert_eq!(
            next,
            json!({
                "thread-1": [{ "id": "keep" }, { "id": "concurrent" }],
            })
        );
    }

    #[test]
    fn queued_follow_up_lock_state_prunes_expired_locks_and_sent_markers() {
        let mut store = GlobalStateStore::default();
        let lock_key = queued_follow_up_send_lock_key("thread-1", "message-1").unwrap();
        let sent_key = queued_follow_up_sent_message_key("thread-1", "message-1").unwrap();
        store.queued_follow_up_send_locks.insert(
            lock_key.clone(),
            QueuedFollowUpSendLock {
                lock_id: "lock-a".to_string(),
                acquired_at_ms: 1_000,
            },
        );
        store
            .recently_sent_queued_follow_ups
            .insert(sent_key.clone(), 1_000);
        prune_queued_follow_up_lock_state(
            &mut store,
            1_000 + QUEUED_FOLLOW_UP_SEND_LOCK_TTL_MS + 1,
        );
        assert!(!store.queued_follow_up_send_locks.contains_key(&lock_key));
        assert!(store
            .recently_sent_queued_follow_ups
            .contains_key(&sent_key));
        prune_queued_follow_up_lock_state(
            &mut store,
            1_000 + QUEUED_FOLLOW_UP_RECENT_SENT_TTL_MS + 1,
        );
        assert!(!store
            .recently_sent_queued_follow_ups
            .contains_key(&sent_key));
    }

    #[test]
    fn empty_lock_parts_are_invalid() {
        assert!(queued_follow_up_send_lock_key("", "message-1").is_err());
        assert!(queued_follow_up_send_lock_key("thread-1", "").is_err());
        assert!(validate_global_state_key(" ").is_err());
    }
}
