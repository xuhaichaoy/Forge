import {
  Boxes,
  Braces,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  LogIn,
  Loader2,
  Play,
  Plug,
  Power,
  PowerOff,
  RefreshCw,
  Server,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  CommandPanelEntry,
  CommandPanelEntryAction,
  CommandPanelState,
} from "../state/command-panel";
import {
  managementPanelSections,
  managementPanelSummary,
  type ManagementPanelKind,
} from "../state/mcp-skills-management";
import { useForgeIntl } from "./i18n-provider";

export interface McpSkillsManagementPanelProps {
  kind: ManagementPanelKind;
  panelState: CommandPanelState | null;
  onReload?: () => void;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}

export function McpSkillsManagementPanel({
  kind,
  panelState,
  onReload,
  onSelectEntry,
  onSelectAction,
}: McpSkillsManagementPanelProps) {
  const { formatMessage } = useForgeIntl();
  if (!panelState) {
    // Forge-only fallback (no Codex equivalent): no settings section is selected yet.
    return (
      <div className="hc-settings-empty">
        {formatMessage({ id: "hc.management.selectSection", defaultMessage: "Select a settings section." })}
      </div>
    );
  }

  const summary = managementPanelSummary(kind, panelState.entries);
  const sections = managementPanelSections(kind, panelState.entries);
  return (
    <div className="hc-management-panel" data-management-kind={kind}>
      {panelState.message && (
        <div className="hc-command-panel-message" data-status={panelState.status}>
          {panelState.status === "loading" && <Loader2 className="hc-spin" size={14} />}
          <span>{panelState.message}</span>
        </div>
      )}

      <div className="hc-management-summary-bar">
        <div className="hc-management-summary" aria-label={`${managementKindLabel(kind)} summary`}>
          {summary.map((item) => (
            <div className="hc-management-summary-item" data-tone={item.tone ?? "default"} key={item.id}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        {onReload && (
          <button
            className="hc-command-secondary-action"
            type="button"
            onClick={onReload}
            disabled={panelState.status === "loading"}
          >
            {panelState.status === "loading" ? <Loader2 className="hc-spin" size={13} /> : <RefreshCw size={13} />}
            {/* CODEX-REF: Codex uses "Refresh" for every settings refresh action
              * (skills.page.refreshSkills = "Refresh", ZH 刷新). Match the
              * settings header's sibling "Refresh" button (model-settings-panel)
              * instead of the prior "Reload" wording. */}
            <span>{formatMessage({ id: "skills.page.refreshSkills", defaultMessage: "Refresh" })}</span>
          </button>
        )}
      </div>

      {sections.length > 0 ? (
        <div className="hc-management-sections">
          {sections.map((section) => (
            <section className="hc-management-section" key={section.id}>
              <header>
                <div>
                  {kind === "mcp" ? <Server size={14} /> : kind === "plugins" ? <Plug size={14} /> : <Boxes size={14} />}
                  <strong>{section.title}</strong>
                </div>
                {section.meta && <span>{section.meta}</span>}
              </header>
              <div className="hc-management-entry-list">
                {section.entries.map((entry) => (
                  <ManagementEntryRow
                    entry={entry}
                    key={entry.id}
                    onSelectAction={onSelectAction}
                    onSelectEntry={onSelectEntry}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        panelState.status !== "loading" && !panelState.message && (
          <div className="hc-settings-empty">
            {/* Codex empty states:
              *   mcp     -> settings.mcp.empty           = "No MCP servers connected" (ZH 未连接 MCP 服务器)
              *   plugins -> skills.appsPage.empty.plugins = "No plugins found"        (ZH 未找到插件)
              *   skills  -> skills.page.empty            = "No skills found"          (ZH 找不到技能) */}
            {kind === "mcp"
              ? formatMessage({ id: "settings.mcp.empty", defaultMessage: "No MCP servers connected" })
              : kind === "plugins"
                ? formatMessage({ id: "skills.appsPage.empty.plugins", defaultMessage: "No plugins found" })
                : formatMessage({ id: "skills.page.empty", defaultMessage: "No skills found" })}
          </div>
        )
      )}
    </div>
  );
}

function managementKindLabel(kind: ManagementPanelKind): string {
  if (kind === "mcp") return "MCP";
  if (kind === "plugins") return "Plugins";
  return "Skills";
}

function ManagementEntryRow({
  entry,
  onSelectEntry,
  onSelectAction,
}: {
  entry: CommandPanelEntry;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  const actionable = Boolean(entry.action && !entry.disabled && onSelectEntry);
  const row = (
    <>
      <div className="hc-management-entry-main">
        <div className="hc-management-entry-icon">{entryIcon(entry)}</div>
        <div className="hc-management-entry-copy">
          <div>
            <strong>{entry.title}</strong>
            {entry.status && <span className="hc-command-status">{entry.status}</span>}
          </div>
          {entry.meta && <p>{entry.meta}</p>}
        </div>
      </div>
      <div className="hc-management-entry-actions">
        {entry.action && !entry.disabled && (
          <span className="hc-management-entry-primary">{primaryActionLabel(entry)}</span>
        )}
        {entry.secondaryActions?.map((secondary) => (
          <button
            aria-label={secondary.title ?? secondary.label}
            className="hc-command-secondary-action"
            data-tone={secondary.tone ?? "default"}
            key={secondary.id}
            title={secondary.title}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectAction?.(secondary.action, entry);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {secondaryActionIcon(secondary.action)}
            <span>{secondary.label}</span>
          </button>
        ))}
      </div>
      {entry.details && entry.details.length > 0 && (
        <ul className="hc-management-entry-details">
          {entry.details.slice(0, 5).map((detail, index) => (
            <li key={`${entry.id}:detail:${index}`}>{detail}</li>
          ))}
        </ul>
      )}
    </>
  );

  if (!actionable) {
    return (
      <article
        className="hc-management-entry"
        data-actionable="false"
        data-disabled={entry.disabled ? "true" : "false"}
      >
        {row}
      </article>
    );
  }

  return (
    <article
      className="hc-management-entry"
      data-actionable="true"
      data-disabled="false"
      role="button"
      tabIndex={0}
      onClick={() => onSelectEntry?.(entry)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectEntry?.(entry);
      }}
    >
      {row}
    </article>
  );
}

function entryIcon(entry: CommandPanelEntry) {
  switch (entry.kind) {
    case "mcpServer":
      return <Server size={14} />;
    case "mcpTool":
      return <Wrench size={14} />;
    case "mcpResource":
      return <Database size={14} />;
    case "mcpResourceTemplate":
      return <Braces size={14} />;
    case "skill":
      return entry.status === "error" ? <FileText size={14} /> : <Boxes size={14} />;
    case "plugin":
      return <Plug size={14} />;
    default:
      return <CheckCircle2 size={14} />;
  }
}

function primaryActionLabel(entry: CommandPanelEntry): string {
  switch (entry.action?.type) {
    case "callMcpTool":
      return "Call";
    case "openMcpToolForm":
      return "Configure";
    case "readMcpResource":
      return "Read";
    case "openMcpServerForm":
      return "Configure";
    case "attachSkill":
      return "Insert prompt";
    case "attachPlugin":
      return "Insert mention";
    case "checkoutPluginShare":
      return "Checkout";
    case "installPlugin":
      return "Install";
    case "uninstallPlugin":
      return "Uninstall";
    default:
      return "Open";
  }
}

function secondaryActionIcon(action: CommandPanelEntryAction) {
  if (action.type === "writeSkillConfig") {
    return action.enabled ? <Power size={13} /> : <PowerOff size={13} />;
  }
  if (action.type === "readSkillFile") {
    return <FileText size={13} />;
  }
  if (action.type === "reloadMcpServers") {
    return <RefreshCw size={13} />;
  }
  if (action.type === "loginMcpServer") {
    return <LogIn size={13} />;
  }
  if (action.type === "openMcpServerForm") {
    return <Edit3 size={13} />;
  }
  if (action.type === "removeMcpServer") {
    return <Trash2 size={13} />;
  }
  if (action.type === "writeAppConfig" || action.type === "writePluginConfig") {
    return action.enabled ? <Power size={13} /> : <PowerOff size={13} />;
  }
  if (action.type === "installPlugin") {
    return <Download size={13} />;
  }
  if (action.type === "checkoutPluginShare") {
    return <Download size={13} />;
  }
  if (action.type === "uninstallPlugin") {
    return <Trash2 size={13} />;
  }
  if (action.type === "openExternalUrl") {
    return <ExternalLink size={13} />;
  }
  if (action.type === "openComputerUseSetup") {
    return <ExternalLink size={13} />;
  }
  if (action.type === "repairComputerUseBundle") {
    return <Wrench size={13} />;
  }
  return <Play size={13} />;
}
