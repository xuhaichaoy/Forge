import type { ComponentProps } from "react";

import type { McpServerFormAction, McpToolFormAction } from "../hooks/use-command-panel-actions";
import { McpFollowUpDialog, type McpFollowUpDialogRequest } from "./mcp-follow-up-dialog";
import { McpServerConfigForm } from "./mcp-server-config-form";
import { McpToolCallForm } from "./mcp-tool-call-form";

/*
 * The three MCP overlays (tool-call form, server-config form, follow-up
 * dialog) grouped into one presentational component, extracted from
 * HiCodexApp's overlay layer. All callbacks are built by the body and passed
 * in — the component itself has no side effects.
 */
export function McpDialogs({
  toolForm,
  onToolFormClose,
  onToolFormSubmit,
  serverForm,
  onServerFormClose,
  onServerFormSubmit,
  followUpDialog,
  onFollowUpClose,
  onFollowUpSend,
}: {
  toolForm: McpToolFormAction | null;
  onToolFormClose: () => void;
  onToolFormSubmit: ComponentProps<typeof McpToolCallForm>["onSubmit"];
  serverForm: McpServerFormAction | null;
  onServerFormClose: () => void;
  onServerFormSubmit: ComponentProps<typeof McpServerConfigForm>["onSubmit"];
  followUpDialog: McpFollowUpDialogRequest | null;
  onFollowUpClose: () => void;
  onFollowUpSend: ComponentProps<typeof McpFollowUpDialog>["onSend"];
}) {
  return (
    <>
      {toolForm && (
        <McpToolCallForm action={toolForm} onClose={onToolFormClose} onSubmit={onToolFormSubmit} />
      )}
      {serverForm && (
        <McpServerConfigForm action={serverForm} onClose={onServerFormClose} onSubmit={onServerFormSubmit} />
      )}
      {followUpDialog && (
        <McpFollowUpDialog
          request={{ prompt: followUpDialog.prompt, source: followUpDialog.source }}
          onClose={onFollowUpClose}
          onSend={onFollowUpSend}
        />
      )}
    </>
  );
}
