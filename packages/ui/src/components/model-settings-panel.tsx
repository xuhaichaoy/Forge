import {
  AppWindow,
  Archive,
  Boxes,
  Camera,
  CheckCircle2,
  Cog,
  Container,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe,
  ImageIcon,
  Keyboard,
  KeyRound,
  Loader2,
  MonitorPlay,
  MousePointer2,
  Plug,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Smile,
  Sun,
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
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_GROUP_HEADINGS,
  isDesktopBackedLocalSettingsPanel,
  isRefreshableSettingsPanel,
  type SettingsSectionGroup,
} from "../state/settings-panel-workflow";
import { AppearanceSettingsPanel } from "./appearance-settings-panel";
import { CommandPanelEntryList } from "./command-panel";
import { KeyboardShortcutsSettingsPanel } from "./keyboard-shortcuts-settings-panel";
import { McpSkillsManagementPanel } from "./mcp-skills-management-panel";
import type { KeymapOverrides } from "../state/keymap-overrides";
import type { ReducedMotionMode, UiAppearancePreferences } from "../state/appearance";
import type { UiThemeMode, UiThemeSnapshot } from "../state/theme";
import { useState } from "react";

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
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js — inline keyboard
   * shortcuts editor needs direct setter/state access (vs going through the
   * action dispatch pipeline) so capture latency stays sub-16ms.
   */
  keymapOverrides?: KeymapOverrides;
  onSetKeyboardShortcut?: (commandId: string, accelerator: string | null) => void;
  onResetKeyboardShortcut?: (commandId: string) => void;
  /*
   * CODEX-REF: appearance-settings-*.js — inline appearance editor.
   * Same rationale as keyboard-shortcuts: Codex renders a column of bespoke
   * controls (segmented toggle + number input + segmented toggle) that
   * doesn't map onto a flat CommandPanelEntry list.
   */
  uiTheme?: UiThemeSnapshot;
  uiAppearance?: UiAppearancePreferences;
  onSetUiTheme?: (mode: UiThemeMode) => void;
  onSetCodeFontSize?: (size: number) => void;
  onSetReducedMotion?: (mode: ReducedMotionMode) => void;
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
  keymapOverrides,
  onSetKeyboardShortcut,
  onResetKeyboardShortcut,
  uiTheme,
  uiAppearance,
  onSetUiTheme,
  onSetCodeFontSize,
  onSetReducedMotion,
}: SettingsPanelProps) {
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === activePanel) ?? SETTINGS_SECTIONS[0];
  const refreshable = isRefreshableSettingsPanel(activePanel);
  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-settings-panel hc-settings-center"
        role="dialog"
        data-state="open"
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
          {/*
           * CODEX-REF: Grouped nav mirrors Codex Desktop's settings-page
           * group renderer (settings-page-*.js):
           * `_e.map(e => <Group heading={e.heading}>{e.slugs.map(...)}</Group>)`.
           * Codex emits one `<L>` wrapper per group with the heading rendered
           * by `<a {...e.heading}/>` only when present (HiCodex-only group
           * skips its heading per SETTINGS_SECTION_GROUP_HEADINGS.hicodex = null).
           */}
          <nav className="hc-settings-nav" aria-label="Settings sections">
            {(["app", "host"] as const).map((group: SettingsSectionGroup) => {
              const heading = SETTINGS_SECTION_GROUP_HEADINGS[group];
              const sections = SETTINGS_SECTIONS.filter((section) => section.group === group);
              if (sections.length === 0) return null;
              return (
                <div className="hc-settings-nav-group" data-group={group} key={group}>
                  {heading ? <div className="hc-settings-nav-group-heading">{heading}</div> : null}
                  {sections.map((section) => (
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
                        {/*
                         * CODEX-REF: Codex Desktop renders no subtitle/description
                         * per section — settings-shared-*.js returns null for
                         * every slug except mcp-settings.
                         */}
                        {section.description ? <small>{section.description}</small> : null}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="hc-settings-content">
            <div className="hc-settings-content-header">
              <div>
                {settingsSectionIcon(activeSection.icon)}
                <span>
                  <strong>{activeSection.title}</strong>
                  {activeSection.description ? <small>{activeSection.description}</small> : null}
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
            ) : activePanel === "mcp" || activePanel === "skills" || activePanel === "plugins" ? (
              <McpSkillsManagementPanel
                kind={activePanel}
                panelState={panelState}
                onReload={onRefreshPanel}
                onSelectAction={onSelectAction}
                onSelectEntry={onSelectEntry}
              />
            ) : activePanel === "appearance" ? (
              /*
               * CODEX-REF: appearance-settings-*.js — bespoke inline
               * appearance editor. Replaces the prior CommandPanelEntry-based
               * implementation so the number input (Code font size, §4) and
               * segmented toggles (Theme §1, Reduce motion §8) can render
               * faithfully.
               */
              <AppearanceSettingsPanel
                uiTheme={uiTheme ?? { mode: "system", resolved: "light" }}
                uiAppearance={uiAppearance ?? { codeFontSize: 12, reducedMotion: "system" }}
                onSetUiTheme={onSetUiTheme ?? (() => undefined)}
                onSetCodeFontSize={onSetCodeFontSize ?? (() => undefined)}
                onSetReducedMotion={onSetReducedMotion ?? (() => undefined)}
              />
            ) : activePanel === "keyboard-shortcuts" ? (
              /*
               * CODEX-REF: keyboard-shortcuts-settings-*.js — bespoke
               * inline editor. Bypasses the SettingsCommandContent /
               * CommandPanelEntryList pipeline because Codex's row layout is
               * a 3-column table with capture-mode column swap, which
               * doesn't map onto a flat CommandPanelEntry list.
               */
              <KeyboardShortcutsSettingsPanel
                keymapOverrides={keymapOverrides ?? {}}
                onSetShortcut={onSetKeyboardShortcut ?? (() => undefined)}
                onResetShortcut={onResetKeyboardShortcut ?? (() => undefined)}
              />
            ) : isDesktopBackedLocalSettingsPanel(activePanel) ? (
              <DesktopBackedSettingsContent
                panelState={panelState}
                section={activeSection}
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
        showSections={false}
      />
      {panelState.entries.length === 0 && panelState.status !== "loading" && !panelState.message && (
        <div className="hc-settings-empty">No settings entries.</div>
      )}
    </div>
  );
}

function DesktopBackedSettingsContent({
  panelState,
  section,
}: {
  panelState: CommandPanelState | null;
  section: (typeof SETTINGS_SECTIONS)[number];
}) {
  const entry = panelState?.entries[0] ?? null;
  const evidence = entry?.details ?? [];
  return (
    <div className="hc-settings-route-placeholder">
      <div className="hc-settings-route-placeholder-main">
        <div className="hc-settings-route-placeholder-icon" aria-hidden="true">
          {settingsSectionIcon(section.icon)}
        </div>
        <div className="hc-settings-route-placeholder-copy">
          <div>
            <h2>{section.title}</h2>
            <span>{entry?.status ?? "Desktop route"}</span>
          </div>
          <p>
            This Codex Desktop settings page is tracked for parity, but its host bridge is not wired in HiCodex yet.
          </p>
        </div>
      </div>

      <dl className="hc-settings-route-meta">
        <div>
          <dt>Route</dt>
          <dd>{entry?.meta ?? section.id}</dd>
        </div>
      </dl>

      {evidence.length > 0 && (
        <details className="hc-settings-route-evidence">
          <summary>Source evidence</summary>
          <ul>
            {evidence.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
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
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
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
  const defaultModelSelectable = configuredModels.length > 0;
  const defaultModelInList = defaultModelSelectable && configuredModels.includes(modelDraft.model);
  return (
    <>
      <div className="hc-model-form">
        <fieldset className="hc-model-fieldset">
          <legend className="hc-model-fieldset-legend">连接</legend>
          <p className="hc-model-fieldset-help">配置接入方式和访问凭证。</p>
          <div className="hc-model-fieldset-grid">
            <label className="hc-model-field">
              <span className="hc-model-field-label">名称</span>
              <input
                value={modelDraft.name}
                onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })}
                placeholder="例如 OpenAI 网关"
              />
              <span className="hc-model-field-hint">仅在本地展示,方便区分多个网关。</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">接口协议</span>
              <select
                value={modelDraft.protocol}
                onChange={(event) => setModelDraft({ ...modelDraft, protocol: event.target.value as ModelConfig["protocol"] })}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <span className="hc-model-field-hint">按你的服务端协议选择。</span>
            </label>
            <label className="hc-model-field hc-model-field-wide">
              <span className="hc-model-field-label">服务地址</span>
              <input
                value={modelDraft.baseUrl}
                onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value })}
                placeholder="https://api.example.com/v1"
              />
              <span className="hc-model-field-hint">API 根地址,通常以 /v1 结尾。</span>
            </label>
            <label className="hc-model-field hc-model-field-wide">
              <span className="hc-model-field-label">API Key</span>
              <span className="hc-model-field-input-row">
                <input
                  className="hc-model-field-input-grow"
                  type={apiKeyVisible ? "text" : "password"}
                  value={modelDraft.apiKey}
                  onChange={(event) => setModelDraft({ ...modelDraft, apiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="hc-model-field-input-action"
                  onClick={() => setApiKeyVisible((value) => !value)}
                  aria-label={apiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
                  title={apiKeyVisible ? "隐藏" : "显示"}
                >
                  {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
              <span className="hc-model-field-hint">仅保存在本机,不会上传到任何外部服务。</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="hc-model-fieldset">
          <legend className="hc-model-fieldset-legend">模型</legend>
          <p className="hc-model-fieldset-help">指定可用的模型,以及默认使用哪一个。</p>
          <div className="hc-model-fieldset-grid">
            <label className="hc-model-field hc-model-field-wide">
              <span className="hc-model-field-label">可用模型</span>
              <textarea
                rows={3}
                value={configuredModelsText}
                onChange={(event) => setAvailableModels(event.target.value)}
                placeholder={"每行一个模型名,例如\ngpt-4o\ngpt-4o-mini"}
              />
              <span className="hc-model-field-hint">每行一个,模型名按你接入的服务命名,例如 gpt-4o。</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">默认模型</span>
              {defaultModelSelectable ? (
                <select
                  value={defaultModelInList ? modelDraft.model : ""}
                  onChange={(event) => setPrimaryModel(event.target.value)}
                >
                  {!defaultModelInList && <option value="" disabled>选择默认模型</option>}
                  {configuredModels.map((slug) => (
                    <option key={slug} value={slug}>{slug}</option>
                  ))}
                </select>
              ) : (
                <input value={modelDraft.model} onChange={(event) => setPrimaryModel(event.target.value)} disabled placeholder="先在上方添加可用模型" />
              )}
              <span className="hc-model-field-hint">新会话默认使用这一个,可在对话中临时切换。</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">采样温度</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={modelDraft.temperature}
                onChange={(event) => setModelDraft({ ...modelDraft, temperature: Number(event.target.value) })}
              />
              <span className="hc-model-field-hint">0 最稳定,2 最发散,日常用 0.2 ~ 0.7。</span>
            </label>
            <div className="hc-model-field hc-model-field-wide hc-model-field-toggle">
              <label className="hc-model-toggle">
                <input
                  type="checkbox"
                  checked={modelDraft.supportsImageInput !== false}
                  onChange={(event) => setModelDraft({ ...modelDraft, supportsImageInput: event.target.checked })}
                />
                <span className="hc-model-toggle-track" aria-hidden="true">
                  <span className="hc-model-toggle-thumb" />
                </span>
                <span className="hc-model-toggle-text">
                  <span className="hc-model-field-label">支持图片输入</span>
                  <span className="hc-model-field-hint">开启后可在对话中粘贴 / 拖入图片;请确认你选的模型本身支持图片。</span>
                </span>
              </label>
            </div>
          </div>
        </fieldset>
      </div>
      <div className="hc-settings-footer">
        <div className="hc-muted">
          已配置 {configuredModels.length} 个模型 · 当前共 {models.length} 套模型档案
        </div>
        <button className="hc-button hc-button-primary" onClick={onSave} type="button"><KeyRound size={15} /> 保存并应用</button>
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

/*
 * CODEX-REF: Codex Desktop's per-slug icon map lives in
 * settings-page-*.js as `he={"general-settings":W, profile:te, appearance:ce, ...}`,
 * where each value is a component imported from a sibling icon chunk
 * (sun-*.js, globe-*.js, branch-*.js, speedometer-*.js,
 * shield-code-*.js, face-*.js, app-window-*.js,
 * cursor-*.js, dock-*.js, worktree-*.js,
 * apps-*.js, archive-*.js, appshot-window-*.js,
 * mcp-*.js, hooks-*.js, skills-*.js, keyboard inline SVG).
 * Each Lucide pick below targets the closest visual/semantic match
 * (HiCodex does not bundle Codex's bespoke icon set).
 */
function settingsSectionIcon(icon: (typeof SETTINGS_SECTIONS)[number]["icon"]) {
  switch (icon) {
    // HiCodex-original icon tokens (no Codex Desktop counterpart)
    case "models":
      return <KeyRound size={15} />;
    case "images":
      return <ImageIcon size={15} />;
    case "permissions":
      return <ShieldCheck size={15} />;
    case "apps":
      return <AppWindow size={15} />;
    case "experimental":
      return <FlaskConical size={15} />;
    // Codex Desktop sections — Lucide equivalents of the chunk-named icons
    case "appearance":
      return <Sun size={15} />;             // Codex `sun-*.js`
    case "appshots":
      return <Camera size={15} />;          // Codex `appshot-window-*.js`
    case "connections":
      return <Globe size={15} />;           // Codex `globe-*.js`
    case "git":
      return <GitBranch size={15} />;       // Codex `branch-*.js`
    case "usage":
      return <Gauge size={15} />;           // Codex `speedometer-*.js`
    case "agent":
      return <Cog size={15} />;             // Codex `shield-code-*.js` — Cog matches the "Configuration" label
    case "personalization":
      return <Smile size={15} />;           // Codex `face-*.js`
    case "keyboard":
      return <Keyboard size={15} />;        // Codex inline keyboard SVG
    case "browser":
      return <MonitorPlay size={15} />;     // Codex `app-window-*.js` (avoid clash with `apps` slot)
    case "computer":
      return <MousePointer2 size={15} />;   // Codex `cursor-*.js`
    case "environments":
      return <Container size={15} />;       // Codex `dock-*.js`
    case "worktrees":
      return <GitBranch size={15} />;       // Codex `worktree-*.js`
    case "mcp":
      return <Server size={15} />;          // Codex `mcp-*.js`
    case "skills":
      return <Boxes size={15} />;           // Codex `skills-*.js`
    case "hooks":
      return <Wrench size={15} />;          // Codex `hooks-*.js`
    case "plugins":
      return <Plug size={15} />;            // Codex `apps-*.js` (HiCodex token "plugins")
    case "archive":
      return <Archive size={15} />;         // Codex `archive-*.js`
    case "general":
    default:
      return <Settings size={15} />;        // Codex `settings.cog-*.js`
  }
}

export { SETTINGS_SECTIONS, isRefreshableSettingsPanel };
