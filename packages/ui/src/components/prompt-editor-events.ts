export type PromptEditorEventName = "submit" | "change" | "pasted-files" | "pasted-images";
export type PromptEditorEventListener = (() => void) | ((files: File[]) => void);

export class PromptEditorEmitter {
  private readonly listeners = new Map<PromptEditorEventName, Set<PromptEditorEventListener>>();

  emit(name: PromptEditorEventName, payload?: File[]): void {
    this.listeners.get(name)?.forEach((listener) => {
      if (payload) (listener as (files: File[]) => void)(payload);
      else (listener as () => void)();
    });
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
