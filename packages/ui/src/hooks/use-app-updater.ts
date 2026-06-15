import { useCallback, useEffect, useRef, useState } from "react";

import { applyUpdate, checkForUpdates } from "../lib/updater";

export interface AppUpdateBadge {
  version: string;
  progress: number | null;
  error: string | null;
}

/*
 * Tauri auto-update check + apply, lifted verbatim out of ForgeApp so the
 * root component no longer owns the badge state/ref/timers. Behaviour is
 * unchanged: a check runs once 5s after mount (so it doesn't compete with the
 * initial connect/listThreads burst) and then every 6 hours; failures are
 * silently swallowed (placeholder endpoint, offline, DNS, …) so the badge
 * simply doesn't appear; runUpdate downloads/installs the pending update while
 * streaming progress into the badge.
 */
export function useAppUpdater(): { updateBadge: AppUpdateBadge | null; runUpdate: () => Promise<void> } {
  const [updateBadge, setUpdateBadge] = useState<AppUpdateBadge | null>(null);
  const pendingUpdateRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const doCheck = async () => {
      const result = await checkForUpdates();
      if (cancelled) return;
      if (result.state === "available") {
        pendingUpdateRef.current = result.update;
        setUpdateBadge({
          version: result.update.version,
          progress: null,
          error: null,
        });
      }
    };
    const initialTimer = window.setTimeout(() => { void doCheck(); }, 5_000);
    const periodicTimer = window.setInterval(() => { void doCheck(); }, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, []);

  const runUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current as { downloadAndInstall?: unknown } | null;
    if (!update) return;
    setUpdateBadge((current) => (current ? { ...current, progress: 0, error: null } : current));
    try {
      await applyUpdate(update as Parameters<typeof applyUpdate>[0], (loaded, total) => {
        const fraction = total > 0 ? Math.min(loaded / total, 1) : 0;
        setUpdateBadge((current) => (current ? { ...current, progress: fraction } : current));
      });
      // 走到这里说明 relaunch() 已经触发；进程要重启，UI 状态不再相关。
    } catch (err) {
      setUpdateBadge((current) => (current ? {
        ...current,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      } : current));
    }
  }, []);

  return { updateBadge, runUpdate };
}
