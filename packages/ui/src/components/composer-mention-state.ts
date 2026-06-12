import type {
  ComposerMentionOption,
  ComposerMentionTrigger,
} from "../state/composer-workflow";

export type MentionPickerStatus = "closed" | "idle" | "loading" | "ready" | "error";

export interface MentionPickerState {
  status: MentionPickerStatus;
  trigger: ComposerMentionTrigger | null;
  query: string;
  options: ComposerMentionOption[];
  activeIndex: number;
  error: string | null;
}

export const CLOSED_MENTION_PICKER_STATE: MentionPickerState = {
  status: "closed",
  trigger: null,
  query: "",
  options: [],
  activeIndex: 0,
  error: null,
};
