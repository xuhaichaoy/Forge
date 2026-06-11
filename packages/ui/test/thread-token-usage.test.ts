import {
  completedTokenSpeedPatch,
  liveTokenSpeedRuntimePatch,
  startedTokenSpeedPatch,
  tokenUsageRuntimePatch,
} from "../src/state/thread-token-usage";

export default function runThreadTokenUsageTests(): void {
  projectsDesktopLastTurnTokenUsage();
  updatesLiveTokenSpeedWithDeterministicTime();
  finalizesTokenSpeedFromLatestTokenUsage();
}

function projectsDesktopLastTurnTokenUsage(): void {
  const patch = tokenUsageRuntimePatch(
    {
      total: {
        totalTokens: 1234,
        inputTokens: 1000,
        outputTokens: 234,
      },
      last: {
        totalTokens: 200,
        inputTokens: 150,
        outputTokens: 50,
      },
      modelContextWindow: 128000,
    },
    { tokenSpeedTracker: null },
    "turn-1",
  );

  assertDeepEqual(
    patch?.tokenUsage,
    { usedTokens: 200, contextWindow: 128000 },
    "token usage should project Desktop last-turn totalTokens and modelContextWindow",
  );
}

function updatesLiveTokenSpeedWithDeterministicTime(): void {
  const started = startedTokenSpeedPatch("turn-1", 1_000);
  const first = liveTokenSpeedRuntimePatch(started, "turn-1", "abcd", 1_050);
  assertApproxEqual(
    first?.tokenSpeed?.tokensPerSecond,
    20,
    "first live token speed publish should use sample-window delta",
  );

  const quietPatch = liveTokenSpeedRuntimePatch(
    { ...started, ...first },
    "turn-1",
    "abcd",
    1_090,
  );
  assertEqual(
    quietPatch?.tokenSpeed,
    undefined,
    "live token speed should update tracker without publishing inside the throttle interval",
  );

  const published = liveTokenSpeedRuntimePatch(
    { ...started, ...first, tokenSpeedTracker: quietPatch?.tokenSpeedTracker ?? first?.tokenSpeedTracker },
    "turn-1",
    "abcd",
    1_160,
  );
  assertApproxEqual(
    published?.tokenSpeed?.tokensPerSecond,
    18.75,
    "live token speed should publish again after the throttle interval",
  );
}

function finalizesTokenSpeedFromLatestTokenUsage(): void {
  const started = startedTokenSpeedPatch("turn-1", 2_000);
  const tracker = {
    ...started.tokenSpeedTracker!,
    latestTokenUsage: {
      last: {
        outputTokens: 10,
        reasoningOutputTokens: 2,
      },
    },
  };

  const patch = completedTokenSpeedPatch(
    { ...started, tokenSpeedTracker: tracker },
    "turn-1",
    { durationMs: 3_000 },
  );

  assertApproxEqual(
    patch.tokenSpeed?.tokensPerSecond,
    4,
    "completed token speed should use final output plus reasoning tokens over turn duration",
  );
  assertEqual(
    patch.tokenSpeedTracker?.completedDurationMs,
    3_000,
    "completed token speed should preserve measured duration on the tracker",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertApproxEqual(actual: number | undefined, expected: number, message: string): void {
  if (actual === undefined || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${message}: expected ${expected}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
