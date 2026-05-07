import { ExternalLink, FileText, X } from "lucide-react";
import type { FileReferenceSelection } from "../state/file-references";
import {
  fileReferenceDisplayPath,
  fileReferenceLineLabel,
} from "../state/file-references";

export interface FileReferencePanelProps {
  reference: FileReferenceSelection;
  onClose: () => void;
  onOpenExternal: (reference: FileReferenceSelection) => void;
}

export function FileReferencePanel({
  reference,
  onClose,
  onOpenExternal,
}: FileReferencePanelProps) {
  return (
    <section className="hc-file-reference-panel" aria-label="File reference preview">
      <div className="hc-file-reference-header">
        <div className="hc-file-reference-heading">
          <FileText size={15} />
          <span>File reference</span>
        </div>
        <button
          aria-label="Close file reference preview"
          className="hc-file-reference-icon-button"
          title="Close preview"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="hc-file-reference-body">
        <div className="hc-file-reference-path" title={reference.path}>
          {fileReferenceDisplayPath(reference.path)}
        </div>
        <div className="hc-file-reference-lines">{fileReferenceLineLabel(reference)}</div>
      </div>

      <button
        className="hc-file-reference-open-button"
        type="button"
        onClick={() => onOpenExternal(reference)}
      >
        <ExternalLink size={14} />
        <span>Open external</span>
      </button>
    </section>
  );
}
