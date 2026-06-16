import {
  notifyTeamServiceUnauthorized,
  subscribeTeamServiceUnauthorized,
} from "../src/lib/team-service-session";
import { YuxiApiError, yuxiRequest } from "../src/lib/yuxi-request";

export default async function runTeamServiceSessionTests(): Promise<void> {
  fanOutNotifiesEverySubscriber();
  unsubscribeStopsDelivery();
  oneThrowingListenerDoesNotBlockOthers();
  await yuxiRequestUnauthorizedFiresSignalAndThrows();
  await yuxiRequestForbiddenDoesNotFireSignal();
}

function fanOutNotifiesEverySubscriber(): void {
  let a = 0;
  let b = 0;
  const unsubA = subscribeTeamServiceUnauthorized(() => { a += 1; });
  const unsubB = subscribeTeamServiceUnauthorized(() => { b += 1; });
  try {
    notifyTeamServiceUnauthorized();
    assertEqual(a, 1, "first subscriber should fire");
    assertEqual(b, 1, "second subscriber should fire");
  } finally {
    unsubA();
    unsubB();
  }
}

function unsubscribeStopsDelivery(): void {
  let count = 0;
  const unsub = subscribeTeamServiceUnauthorized(() => { count += 1; });
  notifyTeamServiceUnauthorized();
  unsub();
  notifyTeamServiceUnauthorized();
  assertEqual(count, 1, "listener should stop receiving after unsubscribe");
}

function oneThrowingListenerDoesNotBlockOthers(): void {
  let reached = 0;
  const unsubThrow = subscribeTeamServiceUnauthorized(() => { throw new Error("boom"); });
  const unsubOk = subscribeTeamServiceUnauthorized(() => { reached += 1; });
  try {
    // notify must swallow the throw and still reach the later listener.
    notifyTeamServiceUnauthorized();
    assertEqual(reached, 1, "a throwing listener must not stop later listeners");
  } finally {
    unsubThrow();
    unsubOk();
  }
}

async function yuxiRequestUnauthorizedFiresSignalAndThrows(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let notified = 0;
  const unsub = subscribeTeamServiceUnauthorized(() => { notified += 1; });
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    let caught: unknown = null;
    try {
      await yuxiRequest("/api/knowledge/databases");
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof YuxiApiError, "yuxiRequest should still throw YuxiApiError on 401");
    assertEqual((caught as YuxiApiError).status, 401, "thrown error should carry the 401 status");
    assertEqual(notified, 1, "a 401 should fire the unauthorized signal exactly once");
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
}

async function yuxiRequestForbiddenDoesNotFireSignal(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let notified = 0;
  const unsub = subscribeTeamServiceUnauthorized(() => { notified += 1; });
  globalThis.fetch = (async () =>
    new Response("forbidden", { status: 403 })) as typeof fetch;
  try {
    let threw = false;
    try {
      await yuxiRequest("/api/knowledge/databases");
    } catch {
      threw = true;
    }
    assert(threw, "yuxiRequest should still throw on 403");
    assertEqual(notified, 0, "403 is a permission error on a valid session and must not fire the signal");
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}
