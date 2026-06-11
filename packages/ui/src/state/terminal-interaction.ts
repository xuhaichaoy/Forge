import type { AccumulatedThreadItem } from "./render-groups";

export function parseTerminalInteractionInput(
  inputBuffer: string,
  stdin: string,
): { commands: string[]; inputBuffer: string } {
  let buffer = inputBuffer;
  const commands: string[] = [];
  for (const char of stdin) {
    if (char === "\r" || char === "\n") {
      const command = buffer.trim();
      if (command) commands.push(command);
      buffer = "";
    } else if (char === "\u0003") {
      buffer = "";
    } else if (char === "\b" || char === "\u007f") {
      buffer = buffer.slice(0, -1);
    } else {
      buffer += char;
    }
  }
  return { commands, inputBuffer: buffer };
}

export function terminalInputBuffersWithInput(
  current: Record<string, string> | undefined,
  key: string,
  inputBuffer: string,
): Record<string, string> | undefined {
  const buffers = current ?? {};
  if (inputBuffer) {
    if (buffers[key] === inputBuffer) return current;
    return {
      ...buffers,
      [key]: inputBuffer,
    };
  }
  if (!(key in buffers)) return current;
  const next = { ...buffers };
  delete next[key];
  return next;
}

export function appendTerminalCommandActions(
  items: AccumulatedThreadItem[],
  itemId: string,
  commands: string[],
): { found: boolean; items: AccumulatedThreadItem[] } {
  if (commands.length === 0) return { found: false, items };
  let found = false;
  const nextItems = items.map((item) => {
    if (item.id !== itemId || (item.type !== "commandExecution" && item.type !== "exec")) return item;
    found = true;
    const record = item as Record<string, unknown>;
    const commandActions = Array.isArray(record.commandActions)
      ? record.commandActions.slice()
      : [];
    return {
      ...item,
      commandActions: [
        ...commandActions,
        ...commands.map((command) => ({ type: "unknown", command })),
      ],
    };
  });
  return { found, items: found ? nextItems : items };
}
