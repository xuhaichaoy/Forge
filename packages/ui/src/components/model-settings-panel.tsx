import {
  AppWindow,
  Boxes,
  CheckCircle2,
  FlaskConical,
  ImageIcon,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import type { ModelConfig } from "@hicodex/codex-protocol";
import {
  modelSlugsForConfig,
  modelSlugsWithPrimary,
  parseModelSlugsInput,
} from "../model/model-settings";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";
import { IMAGE_GENERATION_SIZE_OPTIONS, type ImageGenerationSettings } from "../state/image-generation-tool";
import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../state/settings-panel-workflow";
import { CommandPanelEntryList } from "./command-panel";
import { McpSkillsManagementPanel } from "./mcp-skills-management-panel";

export interface SettingsPanelProps {
  activePanel: SettingsPanelId;
  modelDraft: ModelConfig;
  setModelDraft: (model: ModelConfig) => void;
  imageGenerationDraft: ImageGenerationSettings;
  setImageGenerationDraft: (settings: ImageGenerationSettings) => void;
  models: ModelConfig[];
  panelState: CommandPanelState | null;
  onClose: () => void;
  onSaveModel: () => void;
  onSaveImageGeneration: () => void;
  onRefreshPanel: () => void;
  onSelectPanel: (panel: SettingsPanelId) => void;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}

export function SettingsPanel({
  activePanel,
  modelDraft,
  setModelDraft,
  imageGenerationDraft,
  setImageGenerationDraft,
  models,
  panelState,
  onClose,
  onSaveModel,
  onSaveImageGeneration,
  onRefreshPanel,
  onSelectPanel,
  onSelectEntry,
  onSelectAction,
}: SettingsPanelProps) {
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === activePanel) ?? SETTINGS_SECTIONS[0];
  const refreshable = isRefreshableSettingsPanel(activePanel);
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-settings-panel hc-settings-center"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><Settings size={17} /> Settings</div>
          <button className="hc-icon-button" type="button" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="hc-settings-shell">
          <nav className="hc-settings-nav" aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                aria-current={section.id === activePanel ? "page" : undefined}
                className="hc-settings-nav-item"
                key={section.id}
                type="button"
                onClick={() => onSelectPanel(section.id)}
              >
                {settingsSectionIcon(section.icon)}
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="hc-settings-content">
            <div className="hc-settings-content-header">
              <div>
                {settingsSectionIcon(activeSection.icon)}
                <span>
                  <strong>{activeSection.title}</strong>
                  <small>{activeSection.description}</small>
                </span>
              </div>
              {refreshable && (
                <button
                  className="hc-command-secondary-action"
                  type="button"
                  onClick={onRefreshPanel}
                  disabled={panelState?.status === "loading"}
                >
                  {panelState?.status === "loading" ? <Loader2 className="hc-spin" size={13} /> : <RefreshCw size={13} />}
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {activePanel === "models" ? (
              <ModelSettingsForm
                modelDraft={modelDraft}
                models={models}
                setModelDraft={setModelDraft}
                onSave={onSaveModel}
              />
            ) : activePanel === "images" ? (
              <ImageGenerationSettingsForm
                imageGenerationDraft={imageGenerationDraft}
                panelState={panelState}
                setImageGenerationDraft={setImageGenerationDraft}
                onSave={onSaveImageGeneration}
              />
            ) : activePanel === "mcp" || activePanel === "skills" ? (
              <McpSkillsManagementPanel
                kind={activePanel}
                panelState={panelState}
                onReload={onRefreshPanel}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            ) : (
              <SettingsCommandContent
                panelState={panelState}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsCommandContent({
  panelState,
  onSelectEntry,
  onSelectAction,
}: {
  panelState: CommandPanelState | null;
  onSelectEntry?: (entry: CommandPanelEntry) => void;
  onSelectAction?: (action: CommandPanelEntryAction, entry: CommandPanelEntry) => void;
}) {
  if (!panelState) {
    return <div className="hc-settings-empty">Select a settings section.</div>;
  }
  return (
    <div className="hc-settings-command-content">
      {panelState.message && (
        <div className="hc-command-panel-message" data-status={panelState.status}>
          {panelState.status === "loading" && <Loader2 className="hc-spin" size={14} />}
          <span>{panelState.message}</span>
        </div>
      )}
      <CommandPanelEntryList
        entries={panelState.entries}
        onSelectAction={onSelectAction}
        onSelectEntry={onSelectEntry}
      />
      {panelState.entries.length === 0 && panelState.status !== "loading" && !panelState.message && (
        <div className="hc-settings-empty">No settings entries.</div>
      )}
    </div>
  );
}

function ModelSettingsForm({
  modelDraft,
  setModelDraft,
  models,
  onSave,
}: {
  modelDraft: ModelConfig;
  setModelDraft: (model: ModelConfig) => void;
  models: ModelConfig[];
  onSave: () => void;
}) {
  const configuredModels = modelSlugsForConfig(modelDraft);
  const configuredModelsText = configuredModels.join("\n");
  const setPrimaryModel = (model: string) => {
    setModelDraft({
      ...modelDraft,
      model,
      models: modelSlugsWithPrimary(model, modelDraft.models ?? []),
    });
  };
  const setAvailableModels = (value: string) => {
    const nextModels = parseModelSlugsInput(value);
    setModelDraft({
      ...modelDraft,
      model: modelDraft.model.trim() || nextModels[0] || "",
      models: nextModels,
    });
  };
  return (
    <>
      <div className="hc-settings-grid">
        <label>Name<input value={modelDraft.name} onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })} /></label>
        <label>Protocol<select value={modelDraft.protocol} onChange={(event) => setModelDraft({ ...modelDraft, protocol: event.target.value as ModelConfig["protocol"] })}><option value="openai">OpenAI compatible</option><option value="anthropic">Anthropic</option></select></label>
        <label>Base URL<input value={modelDraft.baseUrl} onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value })} /></label>
        <label>API Key<input type="password" value={modelDraft.apiKey} onChange={(event) => setModelDraft({ ...modelDraft, apiKey: event.target.value })} /></label>
        <label>Default model<input value={modelDraft.model} onChange={(event) => setPrimaryModel(event.target.value)} /></label>
        <label className="hc-settings-grid-wide">API models<textarea rows={4} value={configuredModelsText} onChange={(event) => setAvailableModels(event.target.value)} /></label>
        <label>Temperature<input type="number" step="0.1" value={modelDraft.temperature} onChange={(event) => setModelDraft({ ...modelDraft, temperature: Number(event.target.value) })} /></label>
        <label><input type="checkbox" checked={modelDraft.supportsImageInput !== false} onChange={(event) => setModelDraft({ ...modelDraft, supportsImageInput: event.target.checked })} /> Image input</label>
      </div>
      <div className="hc-settings-footer">
        <div className="hc-muted">{configuredModels.length} API model(s) in this provider · {models.length} runtime model profile(s)</div>
        <button className="hc-button hc-button-primary" onClick={onSave} type="button"><KeyRound size={15} /> Save and apply</button>
      </div>
    </>
  );
}

function ImageGenerationSettingsForm({
  imageGenerationDraft,
  panelState,
  setImageGenerationDraft,
  onSave,
}: {
  imageGenerationDraft: ImageGenerationSettings;
  panelState: CommandPanelState | null;
  setImageGenerationDraft: (settings: ImageGenerationSettings) => void;
  onSave: () => void;
}) {
  return (
    <>
      {panelState && <SettingsCommandContent panelState={panelState} />}
      <div className="hc-settings-grid">
        <label>Base URL<input placeholder="Reuse model base URL" value={imageGenerationDraft.baseUrl} onChange={(event) => setImageGenerationDraft({ ...imageGenerationDraft, baseUrl: event.target.value })} /></label>
        <label>API Key<input placeholder="Reuse model API key" type="password" value={imageGenerationDraft.apiKey} onChange={(event) => setImageGenerationDraft({ ...imageGenerationDraft, apiKey: event.target.value })} /></label>
        <label>Image model<input placeholder="Backend default" value={imageGenerationDraft.model} onChange={(event) => setImageGenerationDraft({ ...imageGenerationDraft, model: event.target.value })} /></label>
        <label>Default size<select value={imageGenerationDraft.size} onChange={(event) => setImageGenerationDraft({ ...imageGenerationDraft, size: event.target.value as ImageGenerationSettings["size"] })}>{IMAGE_GENERATION_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>
      <div className="hc-settings-footer">
        <div className="hc-muted">Blank fields reuse the active model profile.</div>
        <button className="hc-button hc-button-primary" onClick={onSave} type="button"><ImageIcon size={15} /> Save image endpoint</button>
      </div>
    </>
  );
}

function settingsSectionIcon(icon: (typeof SETTINGS_SECTIONS)[number]["icon"]) {
  switch (icon) {
    case "models":
      return <KeyRound size={15} />;
    case "images":
      return <ImageIcon size={15} />;
    case "permissions":
      return <ShieldCheck size={15} />;
    case "mcp":
      return <Server size={15} />;
    case "skills":
      return <Boxes size={15} />;
    case "hooks":
      return <Wrench size={15} />;
    case "apps":
      return <AppWindow size={15} />;
    case "plugins":
      return <Plug size={15} />;
    case "experimental":
      return <FlaskConical size={15} />;
    default:
      return <CheckCircle2 size={15} />;
  }
}

export { SETTINGS_SECTIONS, isRefreshableSettingsPanel };
