use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use crate::HostError;

const INSTALLATION_ID_FILENAME: &str = "installation_id";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInstallationState {
    pub installation_id: String,
    pub first_launch: bool,
    pub installation_id_path: String,
}

pub(crate) fn read_or_init_installation_state_at(
    codex_home: &Path,
) -> Result<HostInstallationState, HostError> {
    fs::create_dir_all(codex_home).map_err(|error| HostError::Installation(error.to_string()))?;
    let path = codex_home.join(INSTALLATION_ID_FILENAME);
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(unix)]
    {
        options.mode(0o644);
    }

    let mut file = options
        .open(&path)
        .map_err(|error| HostError::Installation(error.to_string()))?;

    #[cfg(unix)]
    {
        let metadata = file
            .metadata()
            .map_err(|error| HostError::Installation(error.to_string()))?;
        let current_mode = metadata.permissions().mode() & 0o777;
        if current_mode != 0o644 {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o644);
            file.set_permissions(permissions)
                .map_err(|error| HostError::Installation(error.to_string()))?;
        }
    }

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|error| HostError::Installation(error.to_string()))?;
    if let Some(existing) = canonical_installation_uuid(contents.trim()) {
        return Ok(HostInstallationState {
            installation_id: existing,
            first_launch: false,
            installation_id_path: path.to_string_lossy().to_string(),
        });
    }

    let installation_id = new_installation_uuid();
    file.set_len(0)
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.seek(SeekFrom::Start(0))
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.write_all(installation_id.as_bytes())
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.flush()
        .map_err(|error| HostError::Installation(error.to_string()))?;
    file.sync_all()
        .map_err(|error| HostError::Installation(error.to_string()))?;

    Ok(HostInstallationState {
        installation_id,
        first_launch: true,
        installation_id_path: path.to_string_lossy().to_string(),
    })
}

fn canonical_installation_uuid(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() != 36 {
        return None;
    }
    for (index, ch) in trimmed.chars().enumerate() {
        let is_hyphen = matches!(index, 8 | 13 | 18 | 23);
        if is_hyphen {
            if ch != '-' {
                return None;
            }
        } else if !ch.is_ascii_hexdigit() {
            return None;
        }
    }
    Some(trimmed.to_ascii_lowercase())
}

fn new_installation_uuid() -> String {
    let mut bytes = [0_u8; 16];
    if fill_random_bytes(&mut bytes).is_err() {
        fill_fallback_bytes(&mut bytes);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
    )
}

fn fill_random_bytes(bytes: &mut [u8]) -> std::io::Result<()> {
    let mut file = fs::File::open("/dev/urandom")?;
    file.read_exact(bytes)
}

fn fill_fallback_bytes(bytes: &mut [u8]) {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos() as u64)
        .unwrap_or_default();
    let mut state = nanos ^ ((std::process::id() as u64) << 32) ^ (bytes.as_ptr() as usize as u64);
    for byte in bytes {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        *byte = (state & 0xff) as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn read_or_init_installation_id_generates_and_reuses_uuid() {
        let dir = env::temp_dir().join(format!(
            "forge-host-installation-id-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        let _ = fs::remove_dir_all(&dir);

        let generated = read_or_init_installation_state_at(&dir).unwrap();
        assert!(generated.first_launch);
        assert!(canonical_installation_uuid(&generated.installation_id).is_some());
        assert_eq!(
            fs::read_to_string(dir.join(INSTALLATION_ID_FILENAME)).unwrap(),
            generated.installation_id
        );

        let reused = read_or_init_installation_state_at(&dir).unwrap();
        assert!(!reused.first_launch);
        assert_eq!(reused.installation_id, generated.installation_id);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_or_init_installation_id_canonicalizes_or_rewrites() {
        let dir = env::temp_dir().join(format!(
            "forge-host-installation-id-rewrite-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(INSTALLATION_ID_FILENAME),
            "AAAAAAAA-0000-4000-8000-000000000000\n",
        )
        .unwrap();
        let existing = read_or_init_installation_state_at(&dir).unwrap();
        assert!(!existing.first_launch);
        assert_eq!(
            existing.installation_id,
            "aaaaaaaa-0000-4000-8000-000000000000"
        );

        fs::write(dir.join(INSTALLATION_ID_FILENAME), "not-a-uuid").unwrap();
        let rewritten = read_or_init_installation_state_at(&dir).unwrap();
        assert!(rewritten.first_launch);
        assert!(canonical_installation_uuid(&rewritten.installation_id).is_some());
        assert_eq!(
            fs::read_to_string(dir.join(INSTALLATION_ID_FILENAME)).unwrap(),
            rewritten.installation_id
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
