import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CodexJsonRpcClient } from "../src/lib/codex-json-rpc-client";
import { useFollowUpQueueMode } from "../src/hooks/use-follow-up-queue-mode";
import type { ThreadWorkflowDispatch } from "../src/state/thread-workflow";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

type HookSnapshot = ReturnType<typeof useFollowUpQueueMode>;

interface RequestCall {
  method: string;
  params: unknown;
  timeoutMs?: number;
}

export default async function runFollowUpQueueModeDomTests(): Promise<void> {
  await waitsForConnectionBeforeConfigRead();
  await migratesLegacyInterruptMode();
  await rollsBackFailedQueueModeWrite();
}

async function waitsForConnectionBeforeConfigRead(): Promise<void> {
  const client = new FakeConfigClient();
  client.enqueueResponse({ config: { followUpQueueMode: "steer" } });
  const mounted = mountHarness({ client, connected: false });
  try {
    await flushAsync();
    assertEqual(client.calls.length, 0, "disconnected hook should not read config");
    assertEqual(mounted.snapshot?.followUpQueueingEnabled, true, "default queue mode should be enabled before config read");

    mounted.render(true);
    await flushAsync();

    assertDeepEqual(
      client.calls.map((call) => [call.method, call.params]),
      [["config/read", { includeLayers: false }]],
      "connected hook should read the Desktop root config once",
    );
    assertEqual(mounted.snapshot?.followUpQueueingEnabled, false, "steer config should disable queueing");
  } finally {
    mounted.cleanup();
  }
}

async function migratesLegacyInterruptMode(): Promise<void> {
  const client = new FakeConfigClient();
  client.enqueueResponse({ config: { followUpQueueMode: "interrupt" } });
  client.enqueueResponse(userConfigReadTarget("target-1"));
  client.enqueueResponse({});
  const mounted = mountHarness({ client, connected: true });
  try {
    await flushAsync();

    assertEqual(mounted.snapshot?.followUpQueueingEnabled, false, "legacy interrupt should behave like steer");
    assertDeepEqual(
      client.calls.map((call) => [call.method, call.params]),
      [
        ["config/read", { includeLayers: false }],
        ["config/read", { includeLayers: true, cwd: null }],
        ["config/batchWrite", {
          edits: [{ keyPath: "followUpQueueMode", value: "steer", mergeStrategy: "replace" }],
          filePath: "/Users/me/.codex/config.toml",
          expectedVersion: "target-1",
          reloadUserConfig: true,
        }],
      ],
      "legacy interrupt should be normalized and written back to the Desktop config key",
    );
  } finally {
    mounted.cleanup();
  }
}

async function rollsBackFailedQueueModeWrite(): Promise<void> {
  const client = new FakeConfigClient();
  client.enqueueResponse({ config: {} });
  const logs: unknown[] = [];
  const mounted = mountHarness({
    client,
    connected: true,
    dispatch: (action) => {
      logs.push(action);
    },
  });
  try {
    await flushAsync();
    assertEqual(mounted.snapshot?.followUpQueueingEnabled, true, "missing config should start in queue mode");

    client.enqueueResponse(userConfigReadTarget("target-2"));
    client.enqueueReject(new Error("write denied"));
    act(() => {
      mounted.snapshot?.setFollowUpQueueingEnabled(false);
    });
    assertEqual(mounted.snapshot?.followUpQueueingEnabled, false, "toggle should optimistically switch to steer");

    await flushAsync();

    assertEqual(mounted.snapshot?.followUpQueueingEnabled, true, "failed write should roll back to queue mode");
    assertEqual(logs.length, 1, "failed write should dispatch one warning log");
    assertDeepEqual(
      client.calls.slice(1).map((call) => [call.method, call.params]),
      [
        ["config/read", { includeLayers: true, cwd: null }],
        ["config/batchWrite", {
          edits: [{ keyPath: "followUpQueueMode", value: "steer", mergeStrategy: "replace" }],
          filePath: "/Users/me/.codex/config.toml",
          expectedVersion: "target-2",
          reloadUserConfig: true,
        }],
      ],
      "toggle should write the root followUpQueueMode key through versioned config/batchWrite",
    );
  } finally {
    mounted.cleanup();
  }
}

function mountHarness({
  client,
  connected,
  dispatch = () => undefined,
  ensureConnected = async () => true,
}: {
  client: FakeConfigClient;
  connected: boolean;
  dispatch?: ThreadWorkflowDispatch;
  ensureConnected?: () => Promise<boolean>;
}): {
  env: DomTestEnv;
  root: Root;
  snapshot: HookSnapshot | null;
  render: (nextConnected: boolean) => void;
  cleanup: () => void;
} {
  const env = setupDomTestEnv();
  const host = env.document.createElement("div");
  env.document.body.appendChild(host);
  const root = createRoot(host);
  const mounted = {
    env,
    root,
    snapshot: null as HookSnapshot | null,
    render: (nextConnected: boolean) => {
      act(() => {
        root.render(createElement(Harness, {
          client: client as unknown as CodexJsonRpcClient,
          connected: nextConnected,
          dispatch,
          ensureConnected,
          onSnapshot: (snapshot: HookSnapshot) => {
            mounted.snapshot = snapshot;
          },
        }));
      });
    },
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
  mounted.render(connected);
  return mounted;
}

function Harness({
  client,
  connected,
  dispatch,
  ensureConnected,
  onSnapshot,
}: {
  client: CodexJsonRpcClient;
  connected: boolean;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  onSnapshot: (snapshot: HookSnapshot) => void;
}) {
  const snapshot = useFollowUpQueueMode({ client, connected, dispatch, ensureConnected });
  useEffect(() => {
    onSnapshot(snapshot);
  });
  return null;
}

class FakeConfigClient {
  readonly calls: RequestCall[] = [];
  private readonly handlers: Array<(method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>> = [];

  enqueueResponse(value: unknown): void {
    this.handlers.push(async () => value);
  }

  enqueueReject(error: Error): void {
    this.handlers.push(async () => {
      throw error;
    });
  }

  async request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    this.calls.push({ method, params, timeoutMs });
    const handler = this.handlers.shift();
    if (!handler) throw new Error(`unexpected request: ${method}`);
    return await handler(method, params, timeoutMs) as T;
  }
}

function userConfigReadTarget(version: string): unknown {
  return {
    origins: {},
    layers: [{
      name: { type: "user", file: "/Users/me/.codex/config.toml" },
      version,
    }],
  };
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
