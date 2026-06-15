import {
  AppWindow,
  AtSign,
  Bot,
  PlugZap,
} from "lucide-react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";
import { fileIconFor } from "../lib/file-icon";
import type { UserMessageContentPart } from "../state/render-groups";
import { ContextMenu } from "./context-menu";
import { FileCitationMenuContext, fileReferenceContextMenuItems } from "./file-citation-menu";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl } from "./i18n-provider";

export function UserMessageChipView({
  part,
  onOpenFileReference,
  variant = "inline",
}: {
  part: Extract<UserMessageContentPart, { kind: "chip" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  variant?: "inline" | "attachment";
}) {
  const menuActions = useContext(FileCitationMenuContext);
  const { formatMessage } = useForgeIntl();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { icon, label, prefix } = chipVisual(part);
  const displayLabel = `${prefix}${label}`;
  const style = part.brandColor && part.chipKind !== "skill" ? { color: part.brandColor } : undefined;
  const className = `hc-user-chip hc-user-chip-${part.chipKind}${variant === "attachment" ? " hc-user-attachment-pill" : ""}`;

  if (part.chipKind === "skill") {
    return (
      <span className={className} title={part.path || label}>
        <span className="hc-user-chip-skill-icon-slot">{icon}</span>
        <span className="hc-user-chip-skill-label">{displayLabel}</span>
      </span>
    );
  }

  const isInteractive = (part.chipKind === "mention" || part.chipKind === "file") && Boolean(part.path) && Boolean(onOpenFileReference);
  if (isInteractive) {
    const reference = { path: part.path, lineStart: 1 };
    const items = fileReferenceContextMenuItems({ reference, onOpenFileReference, menuActions, formatMessage });
    return (
      <>
        <button
          className={`${className} hc-user-chip-button`}
          title={part.path}
          type="button"
          style={style}
          onClick={() => onOpenFileReference?.(reference)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {icon}
          <span>{displayLabel}</span>
        </button>
        {menu != null && <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      </>
    );
  }
  return (
    <span className={className} title={part.path || label} style={style}>
      {icon}
      <span>{displayLabel}</span>
    </span>
  );
}

function chipVisual(
  part: Extract<UserMessageContentPart, { kind: "chip" }>,
): { icon: ReactNode; label: string; prefix: string } {
  const label = part.displayName ?? part.label;

  const iconImg = part.iconSmall
    ? <img alt="" className="hc-user-chip-icon-img" src={part.iconSmall} />
    : null;

  switch (part.chipKind) {
    case "file":
      return {
        icon: iconImg ?? fileIconFor({ path: part.path || part.label, size: 13 }),
        label,
        prefix: "",
      };
    case "skill":
      return { icon: iconImg ?? <SkillMentionIcon />, label, prefix: "" };
    case "app":
      return { icon: iconImg ?? <AppWindow size={13} />, label, prefix: "$" };
    case "plugin":
      return { icon: iconImg ?? <PlugZap size={13} />, label, prefix: "@" };
    case "agent":
      return { icon: iconImg ?? <Bot size={13} />, label, prefix: "@" };
    case "mention":
    default:
      return { icon: iconImg ?? <AtSign size={13} />, label, prefix: "@" };
  }
}

function SkillMentionIcon() {
  return (
    <svg
      aria-hidden="true"
      className="hc-user-chip-skill-icon"
      fill="none"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.1 1.8 15.1 4.9c.55.34.9.96.9 1.62v6.86c0 .68-.36 1.31-.94 1.66l-5.17 3.18c-.61.37-1.38.35-1.97-.06l-3.12-2.13A1.9 1.9 0 0 1 4 14.46V6.58c0-.67.35-1.29.92-1.64l4.02-2.48c.35-.22.78-.46 1.16-.66Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M4.9 6.15 8.6 8.65l6.46-3.74M8.6 8.65v8.66M15.1 8.15l-5.06 3.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}
