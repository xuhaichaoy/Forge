import { useEffect, useState, type DragEvent } from "react";
import { Archive, FileText, Link2, Loader2, SearchCheck, Upload, UsersRound, X } from "lucide-react";

export function KbLibraryUploadPanel({
  activeLibraryLabel,
  categoryLabel,
  canUpload,
  uploading,
  urlIngesting,
  urlValue,
  onChooseFiles,
  onUploadFiles,
  onUrlChange,
  onSubmitUrl,
  onClose,
}: {
  activeLibraryLabel: string;
  categoryLabel: string;
  canUpload: boolean;
  uploading: boolean;
  urlIngesting: boolean;
  urlValue: string;
  onChooseFiles: () => void;
  onUploadFiles: (files: FileList) => void;
  onUrlChange: (value: string) => void;
  onSubmitUrl: () => void;
  onClose: () => void;
}) {
  const [webLinkOpen, setWebLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const uploadDisabled = !canUpload || uploading;
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (uploadDisabled) return;
    event.preventDefault();
    setDragging(true);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (uploadDisabled) return;
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) onUploadFiles(event.dataTransfer.files);
  };

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
            onDrop={handleDrop}
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

          <ol className="hc-kb-upload-flow" aria-label="上传后的处理流程">
            <li>
              <span><Archive size={14} strokeWidth={2.1} aria-hidden="true" /></span>
              <strong>保存原件</strong>
              <em>保留来源文件</em>
            </li>
            <li>
              <span><FileText size={14} strokeWidth={2.1} aria-hidden="true" /></span>
              <strong>读取内容</strong>
              <em>正文和表格入库</em>
            </li>
            <li>
              <span><UsersRound size={14} strokeWidth={2.1} aria-hidden="true" /></span>
              <strong>提取档案</strong>
              <em>讲师、课程、客户等</em>
            </li>
            <li>
              <span><SearchCheck size={14} strokeWidth={2.1} aria-hidden="true" /></span>
              <strong>可检索</strong>
              <em>带来源证据匹配</em>
            </li>
          </ol>

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
