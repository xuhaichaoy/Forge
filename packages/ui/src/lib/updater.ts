/*
 * Tauri 2 自动更新封装。
 *
 * 流程：
 *   1. release build 通过 Tauri config 注入真实 endpoint + 公钥；dev build 默认未配置
 *   2. app 启动后调 checkForUpdates() 静默问一次 endpoint
 *   3. 如果服务端返回新版（且签名合法），返回的 Update 对象给 UI 用
 *   4. UI 弹一个小按钮；用户点击调 applyUpdate(update)
 *   5. Tauri 下载 .app.tar.gz + 用 release config 编进 app 的公钥校验 .sig
 *   6. 校验通过 → 替换 /Applications/HiCodex.app → relaunch
 *
 * 在非 Tauri 环境（浏览器开发模式）下静默 no-op，避免引入运行时错误。
 */
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateCheckResult =
  | { state: "noUpdate" }
  | { state: "available"; update: Update }
  | { state: "unavailable"; reason: string };

let inTauri: boolean | null = null;
function isInsideTauri(): boolean {
  if (inTauri !== null) return inTauri;
  // Tauri 2 把全局挂在 `window.__TAURI_INTERNALS__` / 旧版用 `window.__TAURI__`
  inTauri = typeof window !== "undefined" && (
    "__TAURI_INTERNALS__" in window || "__TAURI__" in window
  );
  return inTauri;
}

/** 主动问一次有没有新版。不下载、不弹窗。 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!isInsideTauri()) {
    return { state: "unavailable", reason: "not running inside Tauri" };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update === null) return { state: "noUpdate" };
    return { state: "available", update };
  } catch (err) {
    const reason = normalizeUpdaterErrorReason(err);
    return { state: "unavailable", reason };
  }
}

function normalizeUpdaterErrorReason(err: unknown): string {
  const reason = err instanceof Error ? err.message : String(err);
  if (/does not have any endpoints set/i.test(reason)) {
    return "auto-update is not configured for this build";
  }
  return reason;
}

/** 下载 → 验签 → 装 → 重启。失败抛错给上层 UI。 */
export async function applyUpdate(
  update: Update,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
): Promise<void> {
  let loaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      loaded += event.data.chunkLength;
      onProgress?.(loaded, total);
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** 把 Update 简化成 UI 用的快照（避免组件直接持有 plugin 实例） */
export interface UpdateSummary {
  version: string;
  currentVersion: string;
  notes: string;
  pubDate: string | null;
}

export function summarizeUpdate(update: Update): UpdateSummary {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? "",
    pubDate: update.date ?? null,
  };
}
