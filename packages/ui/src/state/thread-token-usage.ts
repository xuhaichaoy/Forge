// codex: composer-*.js `/status` panel reads `usedTokens` / `contextWindow`
// from the `thread/tokenUsage/updated` notification (ThreadTokenUsage).
// `usedTokens` mirrors Desktop's "tokens used" counter (last-turn input +
// output) and `contextWindow` is `modelContextWindow` (null until the server has
// model metadata).
export interface ThreadTokenUsageSnapshot {
  usedTokens: number;
  contextWindow: number | null;
}

export interface ThreadTokenSpeedSnapshot {
  tokensPerSecond: number;
  turnId: string | null;
}

interface ThreadTokenSpeedSample {
  outputTokens: number;
  timeMs: number;
}

export interface ThreadTokenSpeedTracker {
  completedDurationMs: number | null;
  estimatedOutputBytes: number;
  estimatedOutputTokens: number;
  lastLiveSpeedPublishedAtMs: number | null;
  latestTokenUsage: Record<string, unknown> | null;
  samples: ThreadTokenSpeedSample[];
  startedAtMs: number;
  turnId: string;
}

interface TokenRuntimeSlice {
  tokenUsage?: ThreadTokenUsageSnapshot | null;
  tokenSpeed?: ThreadTokenSpeedSnapshot | null;
  tokenSpeedTracker?: ThreadTokenSpeedTracker | null;
}

interface TurnTokenSpeedSource {
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

const TOKEN_SPEED_SAMPLE_WINDOW_MS = 2_000;
const TOKEN_SPEED_PUBLISH_INTERVAL_MS = 100;
const TOKEN_SPEED_BYTES_PER_TOKEN = 4;

export function tokenUsageRuntimePatch(
  tokenUsage: Record<string, unknown>,
  runtime: TokenRuntimeSlice,
  turnId: string | null,
): Pick<TokenRuntimeSlice, "tokenUsage" | "tokenSpeedTracker"> | null {
  const usedTokens = pickTokenTotal(tokenUsage);
  if (usedTokens === null) return null;
  const contextWindowRaw = tokenUsage.modelContextWindow;
  const contextWindow = typeof contextWindowRaw === "number" && Number.isFinite(contextWindowRaw)
    ? contextWindowRaw
    : null;
  const tokenSpeedTracker = runtime.tokenSpeedTracker?.turnId === turnId
    ? { ...runtime.tokenSpeedTracker, latestTokenUsage: tokenUsage }
    : runtime.tokenSpeedTracker ?? null;
  return {
    tokenUsage: { usedTokens, contextWindow },
    tokenSpeedTracker,
  };
}

export function startedTokenSpeedPatch(
  turnId: string,
  now: number = Date.now(),
): Pick<TokenRuntimeSlice, "tokenSpeed" | "tokenSpeedTracker"> {
  const tracker = newTokenSpeedTracker(turnId, now);
  return {
    tokenSpeed: { tokensPerSecond: 0, turnId },
    tokenSpeedTracker: tracker,
  };
}

export function liveTokenSpeedRuntimePatch(
  runtime: TokenRuntimeSlice,
  turnId: string,
  delta: string,
  now: number = Date.now(),
): Partial<Pick<TokenRuntimeSlice, "tokenSpeed" | "tokenSpeedTracker">> | null {
  const bytes = tokenSpeedDeltaBytes(delta);
  if (bytes === 0) return null;

  const tracker = runtime.tokenSpeedTracker?.turnId === turnId
    ? { ...runtime.tokenSpeedTracker }
    : newTokenSpeedTracker(turnId, now);

  tracker.estimatedOutputBytes += bytes;
  tracker.estimatedOutputTokens = tracker.estimatedOutputBytes / TOKEN_SPEED_BYTES_PER_TOKEN;
  tracker.samples = [...tracker.samples, { outputTokens: tracker.estimatedOutputTokens, timeMs: now }];
  while (
    tracker.samples.length > 1
    && (tracker.samples[1]?.timeMs ?? 0) < now - TOKEN_SPEED_SAMPLE_WINDOW_MS
  ) {
    tracker.samples.shift();
  }

  const shouldPublish = tracker.lastLiveSpeedPublishedAtMs == null
    || now - tracker.lastLiveSpeedPublishedAtMs >= TOKEN_SPEED_PUBLISH_INTERVAL_MS;
  if (!shouldPublish) {
    return { tokenSpeedTracker: tracker };
  }

  tracker.lastLiveSpeedPublishedAtMs = now;
  const first = tracker.samples[0];
  const last = tracker.samples[tracker.samples.length - 1];
  const elapsedMs = first && last ? last.timeMs - first.timeMs : 0;
  const tokensPerSecond = elapsedMs > 0 && first && last
    ? (last.outputTokens - first.outputTokens) / (elapsedMs / 1_000)
    : fallbackTokenSpeed(tracker, now);

  return {
    tokenSpeed: { tokensPerSecond: finiteTokenSpeed(tokensPerSecond), turnId },
    tokenSpeedTracker: tracker,
  };
}

export function completedTokenSpeedPatch(
  runtime: TokenRuntimeSlice,
  turnId: string,
  turn: TurnTokenSpeedSource | undefined,
): Partial<Pick<TokenRuntimeSlice, "tokenSpeed" | "tokenSpeedTracker">> {
  const tracker = runtime.tokenSpeedTracker;
  if (!tracker || tracker.turnId !== turnId) return {};
  const durationMs = turnDurationMs(turn);
  const nextTracker = { ...tracker, completedDurationMs: durationMs };
  if (!nextTracker.latestTokenUsage || durationMs == null || durationMs <= 0) {
    return { tokenSpeedTracker: nextTracker };
  }
  const outputTokens = tokenUsageOutputTokens(nextTracker.latestTokenUsage);
  if (outputTokens == null) return { tokenSpeedTracker: nextTracker };
  return {
    tokenSpeed: { tokensPerSecond: finiteTokenSpeed(outputTokens / (durationMs / 1_000)), turnId },
    tokenSpeedTracker: nextTracker,
  };
}

function pickTokenTotal(tokenUsage: Record<string, unknown>): number | null {
  // The Desktop bundle's token-usage-info selector reads
  // `tokenUsage.last.totalTokens` for context usage. Fall back to the
  // cumulative shape only for older app-server payloads that do not include
  // `last`.
  const last = recordParam(tokenUsage.last);
  if (last) {
    const lastTotal = numberField(last, "totalTokens");
    if (lastTotal !== null) return lastTotal;
  }
  const total = recordParam(tokenUsage.total);
  if (total) {
    const totalTokens = numberField(total, "totalTokens");
    if (totalTokens !== null) return totalTokens;
    const input = numberField(total, "inputTokens");
    const output = numberField(total, "outputTokens");
    if (input !== null || output !== null) {
      return (input ?? 0) + (output ?? 0);
    }
  }
  return numberField(tokenUsage, "usedTokens");
}

function newTokenSpeedTracker(turnId: string, now: number): ThreadTokenSpeedTracker {
  return {
    completedDurationMs: null,
    estimatedOutputBytes: 0,
    estimatedOutputTokens: 0,
    lastLiveSpeedPublishedAtMs: null,
    latestTokenUsage: null,
    samples: [{ outputTokens: 0, timeMs: now }],
    startedAtMs: now,
    turnId,
  };
}

function tokenSpeedDeltaBytes(delta: string): number {
  try {
    return new TextEncoder().encode(delta).length;
  } catch {
    return delta.length;
  }
}

function fallbackTokenSpeed(tracker: ThreadTokenSpeedTracker, now: number): number {
  const elapsedMs = now - tracker.startedAtMs;
  return elapsedMs > 0 ? tracker.estimatedOutputTokens / (elapsedMs / 1_000) : 0;
}

function finiteTokenSpeed(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function turnDurationMs(turn: TurnTokenSpeedSource | undefined): number | null {
  if (!turn) return null;
  if (typeof turn.durationMs === "number" && Number.isFinite(turn.durationMs) && turn.durationMs >= 0) {
    return turn.durationMs;
  }
  if (
    typeof turn.startedAt === "number"
    && Number.isFinite(turn.startedAt)
    && typeof turn.completedAt === "number"
    && Number.isFinite(turn.completedAt)
    && turn.completedAt >= turn.startedAt
  ) {
    return (turn.completedAt - turn.startedAt) * 1_000;
  }
  return null;
}

function tokenUsageOutputTokens(tokenUsage: Record<string, unknown>): number | null {
  const last = recordParam(tokenUsage.last);
  if (!last) return null;
  const output = numberField(last, "outputTokens") ?? 0;
  const reasoning = numberField(last, "reasoningOutputTokens") ?? 0;
  return output + reasoning;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
