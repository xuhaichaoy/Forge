import type { ReactNode } from "react";
import type { ConversationRenderUnit } from "../state/render-groups";
import type { FileReference } from "./file-reference-types";

export type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;
export type UserMarkdownRenderer = (
  text: string,
  openFileReference?: (reference: FileReference) => void,
) => ReactNode;
