import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import {
  createCommandPanelState,
  isAppBackedPanelState,
  projectCommandPanelEntries,
  projectPluginEntries,
  type CommandPanelKind,
  type CommandPanelState,
} from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { McpServerStartupStatus } from "../state/mcp-skills-management";
import { loadAllApps } from "../state/app-list";
import { appRegistryEntriesFromResponse, type AppRegistryEntry } from "../state/render-groups";
import { loadMcpManagementEntries } from "../state/settings-panel-loader";

export function useAppBackedPanelRefresh({
  activeSettingsPanel,
  activeThreadId,
  appListMessage,
  appListNonce,
  commandPanelPanel,
  ensureConnected,
  mcpServerStartupStatuses,
  mcpStatusMessage,
  mcpStatusNonce,
  setAppRegistry,
  setCommandPanel,
  setSettingsPanelState,
  workspace,
}: {
  activeSettingsPanel: SettingsPanelId | null;
  activeThreadId: string | null;
  appListMessage: string;
  appListNonce: number;
  commandPanelPanel: CommandPanelKind | null | undefined;
  ensureConnected: () => Promise<boolean>;
  mcpServerStartupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined;
  mcpStatusMessage: string;
  mcpStatusNonce: number;
  setAppRegistry: Dispatch<SetStateAction<AppRegistryEntry[]>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setSettingsPanelState: Dispatch<SetStateAction<CommandPanelState | null>>;
  workspace: string;
}) {
  const { client } = useServices();
  const appListChangedHandledRef = useRef(0);
  const mcpStartupStatusPanelHandledRef = useRef(0);

  useEffect(() => {
    const commandAppsOpen = commandPanelPanel === "apps";
    const commandPluginsOpen = commandPanelPanel === "plugins";
    const settingsAppsOpen = activeSettingsPanel === "apps";
    const settingsPluginsOpen = activeSettingsPanel === "plugins";
    const hasOpenAppBackedPanel = commandAppsOpen || commandPluginsOpen || settingsAppsOpen || settingsPluginsOpen;
    if (appListNonce === 0 || !hasOpenAppBackedPanel) return;
    if (appListChangedHandledRef.current === appListNonce) return;
    appListChangedHandledRef.current = appListNonce;
    const refreshMessage = appListMessage;
    let disposed = false;
    setCommandPanel((current) => isAppBackedPanelState(current)
      ? {
          ...current,
          status: "loading",
          message: `${refreshMessage} Refreshing Apps and Plugins...`,
        }
      : current);
    setSettingsPanelState((current) => isAppBackedPanelState(current)
      ? {
          ...current,
          status: "loading",
          message: `${refreshMessage} Refreshing Apps and Plugins...`,
        }
      : current);

    async function refreshAppBackedPanels() {
      if (!(await ensureConnected())) {
        if (disposed) return;
        setCommandPanel((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        return;
      }
      try {
        const apps = await loadAllApps(client, { forceRefetch: true, threadId: activeThreadId });
        setAppRegistry(appRegistryEntriesFromResponse(apps));
        const pluginsNeeded = commandPluginsOpen || settingsPluginsOpen;
        const plugins = pluginsNeeded
          ? await client.request<unknown>("plugin/list", {
              cwds: workspace.trim() ? [workspace.trim()] : null,
            }, 120_000)
          : null;
        if (disposed) return;
        setCommandPanel((current) => {
          if (current?.panel === "apps") {
            return createCommandPanelState("apps", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Apps from app-server.`,
              entries: projectCommandPanelEntries({ apps }),
            });
          }
          if (current?.panel === "plugins" && plugins !== null) {
            return createCommandPanelState("plugins", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Plugins from app-server.`,
              entries: projectPluginEntries(plugins, { apps }),
            });
          }
          return current;
        });
        setSettingsPanelState((current) => {
          if (current?.panel === "apps") {
            return createCommandPanelState("apps", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Apps from app-server.`,
              entries: projectCommandPanelEntries({ apps }),
            });
          }
          if (current?.panel === "plugins" && plugins !== null) {
            return createCommandPanelState("plugins", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Plugins from app-server.`,
              entries: projectPluginEntries(plugins, { apps }),
            });
          }
          return current;
        });
      } catch (error) {
        if (disposed) return;
        setCommandPanel((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
      }
    }

    void refreshAppBackedPanels();
    return () => {
      disposed = true;
    };
  }, [
    activeSettingsPanel,
    activeThreadId,
    appListMessage,
    appListNonce,
    client,
    commandPanelPanel,
    ensureConnected,
    setAppRegistry,
    setCommandPanel,
    setSettingsPanelState,
    workspace,
  ]);

  useEffect(() => {
    if (mcpStatusNonce === 0 || activeSettingsPanel !== "mcp") return;
    if (mcpStartupStatusPanelHandledRef.current === mcpStatusNonce) return;
    mcpStartupStatusPanelHandledRef.current = mcpStatusNonce;
    let disposed = false;
    const refreshMessage = mcpStatusMessage;
    setSettingsPanelState((current) => current?.panel === "mcp"
      ? { ...current, status: "loading", message: `${refreshMessage} Refreshing...` }
      : current);

    async function refreshOpenMcpPanel() {
      if (!(await ensureConnected())) {
        if (!disposed) {
          setSettingsPanelState((current) => current?.panel === "mcp"
            ? { ...current, status: "error", error: "Runtime is offline." }
            : current);
        }
        return;
      }
      try {
        const entries = await loadMcpManagementEntries({
          client,
          forceReload: false,
          startupStatuses: mcpServerStartupStatuses,
          workspace,
        });
        if (disposed) return;
        setSettingsPanelState((current) => current?.panel === "mcp"
          ? {
              ...current,
              status: "ready",
              message: `${refreshMessage} Refreshed MCP status.`,
              entries,
            }
          : current);
      } catch (error) {
        if (!disposed) {
          setSettingsPanelState((current) => current?.panel === "mcp"
            ? {
                ...current,
                status: "error",
                error: formatError(error),
              }
            : current);
        }
      }
    }

    void refreshOpenMcpPanel();
    return () => {
      disposed = true;
    };
  }, [
    activeSettingsPanel,
    client,
    ensureConnected,
    mcpServerStartupStatuses,
    mcpStatusMessage,
    mcpStatusNonce,
    setSettingsPanelState,
    // `workspace` intentionally omitted (HEAD semantics): the refresh uses the
    // workspace captured when the nonce fired. Re-running on workspace change
    // cancels the in-flight load and the nonce guard then refuses to restart
    // it, pinning the panel on "Refreshing..." until the next nonce.
  ]);
}
