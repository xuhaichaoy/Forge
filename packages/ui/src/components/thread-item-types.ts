import type { ConversationRenderUnit } from "../state/render-groups";

export type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;
