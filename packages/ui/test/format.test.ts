import { stripAnsiEscapes } from "../src/lib/format";

export default function runFormatTests(): void {
  stripsTracingSubscriberAnsiCodesFromStderrLines();
  preservesPlainTextUntouched();
  stripsMultipleAdjacentSgrSequences();
  stripsCsiCursorAndScreenControls();
  handlesEmptyAndUndefinedSafely();
}

function stripsTracingSubscriberAnsiCodesFromStderrLines(): void {
  /*
   * Reproduces the exact stderr leak captured in `Screen Recording 2026-05-21
   * at 07.57.04` right-bottom toast: a `tracing-subscriber` ERROR-level line
   * from `codex_core::tools::router` complaining about a SpawnAgent fork.
   * After stripping the only thing left should be the legible message.
   */
  const ESC = "";
  const raw = `${ESC}[2m2026-05-21T01:33:03.307942Z${ESC}[0m `
    + `${ESC}[31mERROR${ESC}[0m `
    + `${ESC}[2mcodex_core::tools::router${ESC}[0m${ESC}[2m:${ESC}[0m `
    + `${ESC}[3merror${ESC}[0m${ESC}[2m=${ESC}[0m`
    + `Full-history forked agents inherit the parent agent type, model, `
    + `and reasoning effort; omit agent_type, model, and reasoning_effort, `
    + `or spawn without a full-history fork.`;

  const expected = "2026-05-21T01:33:03.307942Z ERROR codex_core::tools::router: error="
    + "Full-history forked agents inherit the parent agent type, model, "
    + "and reasoning effort; omit agent_type, model, and reasoning_effort, "
    + "or spawn without a full-history fork.";

  assertEqual(
    stripAnsiEscapes(raw),
    expected,
    "tracing-subscriber SGR escapes should be removed without dropping payload text",
  );
}

function preservesPlainTextUntouched(): void {
  const value = "no escapes here — just a plain message";
  assertEqual(
    stripAnsiEscapes(value),
    value,
    "lines without escapes should be returned unchanged",
  );
}

function stripsMultipleAdjacentSgrSequences(): void {
  const ESC = "";
  // Adjacent SGR codes like `\x1b[1;31mfoo\x1b[0m` (bold red foo, then reset).
  const raw = `${ESC}[1;31mfoo${ESC}[0m${ESC}[33mbar${ESC}[0m`;
  assertEqual(
    stripAnsiEscapes(raw),
    "foobar",
    "consecutive SGR sequences should all be stripped",
  );
}

function stripsCsiCursorAndScreenControls(): void {
  const ESC = "";
  // Cursor up + clear screen + erase line — common non-SGR CSI sequences
  // tracing-subscriber may emit alongside colors when targeting a real TTY.
  const raw = `${ESC}[2J${ESC}[H${ESC}[2KHello`;
  assertEqual(
    stripAnsiEscapes(raw),
    "Hello",
    "non-SGR CSI sequences (clear screen, cursor home, erase line) should be stripped",
  );
}

function handlesEmptyAndUndefinedSafely(): void {
  assertEqual(stripAnsiEscapes(""), "", "empty input should be returned as-is");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
