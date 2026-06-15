import { useCallback, useRef, useState, type ReactNode } from "react";
import { useForgeIntl } from "./i18n-provider";

/**
 * 应用内确认对话框（Promise 风格）。
 *
 * 背景：Tauri WebView 不实现同步阻塞的 `window.confirm`（直接返回 false），
 * 之前 5 处删除/清理操作用 `globalThis.confirm` 在桌面端全部静默失效——
 * 点击无弹窗、无请求、无反馈。统一替换为本 hook。
 *
 * 用法：
 *   const { confirmDialog, confirmDialogNode } = useConfirmDialog();
 *   ...
 *   if (!(await confirmDialog(`确定删除「${name}」吗？`))) return;
 *   ...
 *   return <>{...}{confirmDialogNode}</>;
 */
export function useConfirmDialog(): {
  confirmDialog: (message: string) => Promise<boolean>;
  confirmDialogNode: ReactNode;
} {
  const { formatMessage } = useForgeIntl();
  const [message, setMessage] = useState<string | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmDialog = useCallback(
    (msg: string) =>
      new Promise<boolean>((resolve) => {
        // 已有未决确认时，先取消旧的（视为放弃），避免悬挂的 Promise
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setMessage(msg);
      }),
    [],
  );

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setMessage(null);
  }, []);

  const confirmDialogNode =
    message === null ? null : (
      <div
        className="hc-settings-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close(false);
        }}
      >
        <div className="hc-thread-dialog-panel hc-kb-dialog" role="alertdialog" aria-modal="true" aria-label={formatMessage({ id: "hc.confirmDialog.title", defaultMessage: "Confirm action" })}>
          <header>
            <div>{formatMessage({ id: "hc.confirmDialog.title", defaultMessage: "Confirm action" })}</div>
          </header>
          <div className="hc-thread-dialog-body">
            <p>{message}</p>
          </div>
          <footer>
            <button type="button" className="hc-kb-topbar-btn" onClick={() => close(false)} autoFocus>
              {formatMessage({ id: "common.cancel", defaultMessage: "Cancel" })}
            </button>
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" onClick={() => close(true)}>
              {formatMessage({ id: "codex.cloudTaskRow.confirmArchiveTask", defaultMessage: "Confirm" })}
            </button>
          </footer>
        </div>
      </div>
    );

  return { confirmDialog, confirmDialogNode };
}
