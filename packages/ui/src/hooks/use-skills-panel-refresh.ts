import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectSkillManagementEntries,
  type CommandPanelKind,
  type CommandPanelState,
} from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";
import { loadRecommendedSkillPluginDetails } from "../state/settings-panel-loader";

export function useSkillsPanelRefresh({
  activeSettingsPanel,
  client,
  commandPanelPanel,
  ensureConnected,
  setCommandPanel,
  setSettingsPanelState,
  skillsChangedNonce,
  workspace,
}: {
  activeSettingsPanel: SettingsPanelId | null;
  client: CodexJsonRpcClient;
  commandPanelPanel: CommandPanelKind | null | undefined;
  ensureConnected: () => Promise<boolean>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setSettingsPanelState: Dispatch<SetStateAction<CommandPanelState | null>>;
  skillsChangedNonce: number;
  workspace: string;
}) {
  const skillsChangedHandledRef = useRef(0);

  useEffect(() => {
    const commandSkillsOpen = commandPanelPanel === "skills";
    const settingsSkillsOpen = activeSettingsPanel === "skills";
    if (skillsChangedNonce === 0 || (!commandSkillsOpen && !settingsSkillsOpen)) return;
    if (skillsChangedHandledRef.current === skillsChangedNonce) return;
    skillsChangedHandledRef.current = skillsChangedNonce;
    let disposed = false;
    setCommandPanel((current) => current?.panel === "skills"
      ? {
          ...current,
          status: "loading",
          message: "Skills changed on disk. Refreshing...",
        }
      : current);
    setSettingsPanelState((current) => settingsSkillsOpen && current?.panel === "skills"
      ? {
          ...current,
          status: "loading",
          message: "Skills changed on disk. Refreshing...",
        }
      : current);

    async function refreshSkillsPanel() {
      if (!(await ensureConnected())) {
        if (disposed) return;
        setCommandPanel((current) => current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => settingsSkillsOpen && current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        return;
      }
      try {
        const skills = await client.request<unknown>("skills/list", {
          cwds: workspace.trim() ? [workspace.trim()] : [],
          forceReload: true,
        }, 120_000);
        const recommendedSkills = settingsSkillsOpen
          ? await loadRecommendedSkillPluginDetails(client, workspace)
          : [];
        if (disposed) return;
        setCommandPanel((current) => current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "ready",
              title: current.title,
              message: "Skills changed on disk. Refreshed skills from app-server.",
              entries: projectCommandPanelEntries({ skills }),
            })
          : current);
        setSettingsPanelState((current) => settingsSkillsOpen && current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "ready",
              title: current.title,
              message: "Skills changed on disk. Refreshed skills from app-server.",
              entries: projectSkillManagementEntries(skills, { recommendedSkills, workspace }),
            })
          : current);
      } catch (error) {
        if (disposed) return;
        setCommandPanel((current) => current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => settingsSkillsOpen && current?.panel === "skills"
          ? createCommandPanelState("skills", {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
      }
    }

    void refreshSkillsPanel();
    return () => {
      disposed = true;
    };
  }, [
    activeSettingsPanel,
    client,
    commandPanelPanel,
    ensureConnected,
    setCommandPanel,
    setSettingsPanelState,
    skillsChangedNonce,
    workspace,
  ]);
}
