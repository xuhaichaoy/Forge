import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link2, Loader2, Upload, X } from "lucide-react";
import {
  isTauriRuntime,
  listenNativeFileDropEvents,
  readFileBytesBase64,
  readFileMetadata,
} from "../lib/tauri-host";
import { type LibraryUploadRun } from "./kb-library-model";
import { KbLibraryUploadProgress } from "./kb-library-upload-progress";

// 与 host_read_file_bytes_base64 的 clamp 上限对齐（src-tauri/src/main.rs:692）。
// 超过此大小该命令直接报错（不是截断），这里显式传上限以放宽默认 16MiB 限制，
// 并在拖入超大文件时给出明确提示。
const TAURI_DROP_MAX_BYTES = 64 * 1024 * 1024;

export function KbLibraryUploadPanel({
  activeLibraryLabel,
  categoryLabel,
  canUpload,
  uploading,
  urlIngesting,
  urlValue,
  uploadRuns,
  onChooseFiles,
  onUploadFiles,
  onUrlChange,
  onSubmitUrl,
  onClearRuns,
  onOpenPending,
  onOpenTasks,
  onClose,
}: {
  activeLibraryLabel: string;
  categoryLabel: string;
  canUpload: boolean;
  uploading: boolean;
  urlIngesting: boolean;
  urlValue: string;
  uploadRuns: LibraryUploadRun[];
  onChooseFiles: () => void;
  onUploadFiles: (files: File[]) => void;
  onUrlChange: (value: string) => void;
  onSubmitUrl: () => void;
  onClearRuns: () => void;
  onOpenPending: (pendingIds: number[]) => void;
  onOpenTasks: () => void;
  onClose: () => void;
}) {
  const [webLinkOpen, setWebLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);

  const uploadDisabled = !canUpload || uploading;
  // 原生拖放监听只注册一次，但回调里要读到最新的禁用态与最新的 onUploadFiles
  // （view 层的 handleUploadFiles 是依赖会变的 useCallback），用 ref 透传避免闭包捕获旧值。
  const uploadDisabledRef = useRef(uploadDisabled);
  const onUploadFilesRef = useRef(onUploadFiles);
  useEffect(() => {
    uploadDisabledRef.current = uploadDisabled;
  }, [uploadDisabled]);
  useEffect(() => {
    onUploadFilesRef.current = onUploadFiles;
  }, [onUploadFiles]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /*
   * Tauri 的 `dragDropEnabled` 会把 OS 文件拖放截走，HTML5 的 onDrop 收不到
   * 文件（dataTransfer.files 为空）。因此在 Tauri 运行时改用原生
   * onDragDropEvent（复用 composer.tsx 的同款封装 listenNativeFileDropEvents）。
   * 原生事件给的是「文件路径」而非 File 对象——通过 readFileBytesBase64 +
   * readFileMetadata 把路径读成字节，再构造 File 喂给上游的
   * uploadYuxiKnowledgeFile。非 Tauri（web 预览）环境监听返回 null，仍走下方
   * HTML5 onDrop fallback。
   */
  useEffect(() => {
    if (!isTauriRuntime()) return undefined;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void listenNativeFileDropEvents((event) => {
      if (event.type === "leave") {
        setDragging(false);
        return;
      }
      const insideDropzone = event.position
        ? isNativeDropInsideElement(dropzoneRef.current, event.position)
        : false;
      if (event.type === "enter" || event.type === "over") {
        setDragging(insideDropzone && !uploadDisabledRef.current);
        return;
      }
      if (event.type === "drop") {
        setDragging(false);
        if (uploadDisabledRef.current) return;
        if (event.paths.length === 0) return;
        if (!insideDropzone) return;
        void acceptDroppedPaths(event.paths);
      }
    }).then((next) => {
      if (cancelled) next?.();
      else unlisten = next;
    }).catch(() => {
      // 监听失败时静默回退到 HTML5 onDrop（web 预览仍可用）。
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // 监听只注册一次；回调通过 onUploadFilesRef/uploadDisabledRef 读最新值，故空依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptDroppedPaths(paths: string[]) {
    setDropError(null);
    const files: File[] = [];
    const failures: string[] = [];
    for (const path of paths) {
      try {
        files.push(await readPathAsFile(path));
      } catch (err) {
        const name = basename(path);
        const reason = err instanceof Error ? err.message : String(err);
        failures.push(`${name}（${reason}）`);
      }
    }
    if (failures.length > 0) {
      setDropError(`部分文件无法读取：${failures.join("；")}`);
    }
    if (files.length > 0) onUploadFilesRef.current(files);
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (uploadDisabled) return;
    event.preventDefault();
    setDragging(true);
  };
  // 非 Tauri（web 预览）fallback：HTML5 拖放此时能拿到真实 File 对象。
  const handleHtml5Drop = (event: DragEvent<HTMLDivElement>) => {
    if (isTauriRuntime()) {
      // Tauri 下原生事件已接管；阻止默认避免浏览器打开文件。
      event.preventDefault();
      setDragging(false);
      return;
    }
    if (uploadDisabled) return;
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) onUploadFiles(dropped);
  };

  const hasRuns = uploadRuns.length > 0;

  return (
    <div
      className="hc-kb-upload-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="hc-kb-upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hc-kb-upload-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="hc-kb-upload-dialog-head">
          <div className="hc-kb-upload-dialog-title">
            <strong id="hc-kb-upload-dialog-title">上传资料</strong>
            <span>{activeLibraryLabel}</span>
          </div>
          <button
            type="button"
            className="hc-kb-upload-dialog-close"
            onClick={onClose}
            aria-label="关闭上传窗口"
          >
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="hc-kb-upload-dialog-body">
          <div
            ref={dropzoneRef}
            className="hc-kb-upload-dropzone"
            data-dragging={dragging ? "true" : undefined}
            data-disabled={uploadDisabled ? "true" : undefined}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              setDragging(false);
            }}
            onDrop={handleHtml5Drop}
          >
            <div className="hc-kb-upload-dropzone-icon">
              {uploading ? (
                <Loader2 size={20} strokeWidth={2.1} aria-hidden="true" />
              ) : (
                <Upload size={20} strokeWidth={2.1} aria-hidden="true" />
              )}
            </div>
            <div className="hc-kb-upload-dropzone-copy">
              <strong>{uploading ? "正在上传资料" : "把资料放到当前知识库"}</strong>
              <span>{categoryLabel || "支持 Word、PDF、PPT、Excel、Markdown、TXT"}</span>
            </div>
            <button
              type="button"
              className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
              onClick={onChooseFiles}
              disabled={uploadDisabled}
            >
              {uploading ? (
                <Loader2 size={13} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Upload size={13} strokeWidth={2.2} aria-hidden="true" />
              )}
              {uploading ? "上传中" : "选择文件"}
            </button>
          </div>

          {dropError && (
            <div className="hc-kb-inline-alert" data-tone="danger">{dropError}</div>
          )}

          {hasRuns && (
            <KbLibraryUploadProgress
              uploadRuns={uploadRuns}
              onClearRuns={onClearRuns}
              onOpenPending={onOpenPending}
              onOpenTasks={onOpenTasks}
              onClose={onClose}
            />
          )}

          <div className="hc-kb-upload-secondary">
            <button
              type="button"
              className="hc-kb-upload-secondary-toggle"
              onClick={() => setWebLinkOpen((open) => !open)}
              disabled={!canUpload || urlIngesting}
              aria-expanded={webLinkOpen}
            >
              <Link2 size={13} strokeWidth={2.2} aria-hidden="true" />
              添加网页资料
            </button>
          </div>
          {webLinkOpen && (
            <form
              className="hc-kb-url-ingest-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitUrl();
              }}
            >
              <input
                type="url"
                value={urlValue}
                placeholder="粘贴公开网页链接，例如课程介绍页、客户案例页"
                onChange={(event) => onUrlChange(event.target.value)}
                disabled={!canUpload || urlIngesting}
                aria-label="网页资料链接"
              />
              <button
                type="submit"
                className="hc-kb-topbar-btn"
                disabled={!canUpload || urlIngesting || !urlValue.trim()}
              >
                {urlIngesting ? (
                  <Loader2 size={13} strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <Link2 size={13} strokeWidth={2.2} aria-hidden="true" />
                )}
                添加
              </button>
            </form>
          )}
          {!canUpload && (
            <div className="hc-kb-upload-dialog-note">请先在左侧选择一个知识库。</div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * 把 Tauri 原生拖放给的文件路径读成可上传的 File 对象：
 *   readFileBytesBase64(path) → base64 字节 → Uint8Array → File。
 * mimeType/文件名分别来自 readFileMetadata 与路径 basename。
 * 超过 host_read_file_bytes_base64 的大小上限时该命令会抛错，向上传递。
 */
async function readPathAsFile(path: string): Promise<File> {
  const [base64, metadata] = await Promise.all([
    readFileBytesBase64(path, TAURI_DROP_MAX_BYTES),
    readFileMetadata(path).catch(() => null),
  ]);
  const bytes = decodeBase64ToBytes(base64);
  const type = metadata?.mimeType ?? "";
  // File 第一个参数接受 BlobPart[]。直接传底层 ArrayBuffer，绕过 TS 5.x 把
  // Uint8Array 收窄成 Uint8Array<ArrayBufferLike> 后与 BlobPart 不匹配的误报
  //（decodeBase64ToBytes 新建的 Uint8Array offset 为 0，buffer 即完整内容）。
  return new File([bytes.buffer as ArrayBuffer], basename(path), type ? { type } : undefined);
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function basename(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned || "未命名文件";
}

/*
 * 复用 composer.tsx 的原生拖放命中检测逻辑：Tauri 2.x 把位置标注为
 * PhysicalPosition，但 macOS 下实为 CSS 像素（不能再除 devicePixelRatio），
 * Windows 下才需要按 DPR 还原。此处与 composer 保持一致以免命中失败。
 */
function isNativeDropInsideElement(
  element: HTMLElement | null,
  position: { x: number; y: number },
): boolean {
  if (!element || typeof window === "undefined") return false;
  const scale = isMacOSPlatform() ? 1 : (window.devicePixelRatio || 1);
  const rect = element.getBoundingClientRect();
  const x = position.x / scale;
  const y = position.y / scale;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  if (platform.startsWith("Mac")) return true;
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua);
}
