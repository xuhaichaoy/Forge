export type PromptEditorEventName = "submit" | "change" | "pasted-files" | "pasted-images" | "pasted-text";
export type PromptEditorEventPayload = File[] | string;
export type PromptEditorEventListener = (() => void) | ((files: File[]) => void) | ((text: string) => void);

export class PromptEditorEmitter {
  private readonly listeners = new Map<PromptEditorEventName, Set<PromptEditorEventListener>>();

  emit(name: PromptEditorEventName, payload?: PromptEditorEventPayload): boolean {
    const listeners = this.listeners.get(name);
    if (!listeners || listeners.size === 0) return false;
    listeners.forEach((listener) => {
      if (payload !== undefined) (listener as (payload: PromptEditorEventPayload) => void)(payload);
      else (listener as () => void)();
    });
    return true;
  }

  addListener(name: PromptEditorEventName, listener: PromptEditorEventListener): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeListener(name: PromptEditorEventName, listener: PromptEditorEventListener): void {
    this.listeners.get(name)?.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }
}
