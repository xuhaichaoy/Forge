/*
 * Pure type leaf for the storage shape shared between state/image-generation-tool
 * and lib/tauri-host. Extracted so tauri-host's type-only back edge no longer
 * closes a cycle with image-generation-tool's value imports of tauri-host /
 * app-settings. state/image-generation-tool re-exports this name in place, so
 * existing import paths (appearance, worktrees, i18n, …) keep working unchanged.
 */
export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
