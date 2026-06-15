import { Eye, EyeOff, ImageIcon, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ModelConfig } from "@forge/codex-protocol";
import {
  modelSlugsForConfig,
  modelSlugsWithPrimary,
  parseModelSlugsInput,
} from "../model/model-settings";
import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";
import { IMAGE_GENERATION_SIZE_OPTIONS, type ImageGenerationSettings } from "../state/image-generation-tool";
import { CommandPanelEntryList } from "./command-panel";
import { useForgeIntl } from "./i18n-provider";

export function SettingsCommandContent({
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

export function ModelSettingsForm({
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
  const { formatMessage } = useForgeIntl();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const configuredModels = modelSlugsForConfig(modelDraft);
  const configuredModelsText = configuredModels.join("\n");
  const [availableModelsText, setAvailableModelsText] = useState(() => configuredModelsText);
  const lastConfiguredModelsTextRef = useRef(configuredModelsText);
  useEffect(() => {
    if (configuredModelsText === lastConfiguredModelsTextRef.current) return;
    lastConfiguredModelsTextRef.current = configuredModelsText;
    setAvailableModelsText((current) => {
      const currentCanonical = parseModelSlugsInput(current).join("\n");
      return currentCanonical === configuredModelsText ? current : configuredModelsText;
    });
  }, [configuredModelsText]);
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
          <legend className="hc-model-fieldset-legend">{formatMessage({ id: "hc.settings.modelForm.connectionLegend", defaultMessage: "Connection" })}</legend>
          <p className="hc-model-fieldset-help">{formatMessage({ id: "hc.settings.modelForm.connectionHelp", defaultMessage: "Configure how to connect and which credentials to use." })}</p>
          <div className="hc-model-fieldset-grid">
            <label className="hc-model-field">
              <span className="hc-model-field-label">{formatMessage({ id: "settings.mcp.detail.name", defaultMessage: "Name" })}</span>
              <input
                value={modelDraft.name}
                onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })}
                placeholder={formatMessage({ id: "hc.settings.modelForm.namePlaceholder", defaultMessage: "e.g. OpenAI gateway" })}
              />
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.nameHint", defaultMessage: "Shown only on this device, to tell multiple gateways apart." })}</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.protocolLabel", defaultMessage: "API protocol" })}</span>
              <select
                value={modelDraft.protocol}
                onChange={(event) => setModelDraft({ ...modelDraft, protocol: event.target.value as ModelConfig["protocol"] })}
              >
                <option value="openai">{formatMessage({ id: "hc.settings.modelForm.protocolOptionOpenAi", defaultMessage: "OpenAI-compatible" })}</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.protocolHint", defaultMessage: "Pick the protocol your server speaks." })}</span>
            </label>
            <label className="hc-model-field hc-model-field-wide">
              <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.baseUrlLabel", defaultMessage: "Base URL" })}</span>
              <input
                value={modelDraft.baseUrl}
                onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value })}
                placeholder="https://api.example.com/v1"
              />
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.baseUrlHint", defaultMessage: "API root URL, usually ending in /v1." })}</span>
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
                  aria-label={apiKeyVisible
                    ? formatMessage({ id: "hc.settings.modelForm.hideApiKey", defaultMessage: "Hide API key" })
                    : formatMessage({ id: "hc.settings.modelForm.showApiKey", defaultMessage: "Show API key" })}
                  title={apiKeyVisible
                    ? formatMessage({ id: "hc.settings.modelForm.hide", defaultMessage: "Hide" })
                    : formatMessage({ id: "hc.settings.modelForm.show", defaultMessage: "Show" })}
                >
                  {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.apiKeyHint", defaultMessage: "Stored only on this device — never uploaded to any external service." })}</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="hc-model-fieldset">
          <legend className="hc-model-fieldset-legend">{formatMessage({ id: "hc.settings.nav.models", defaultMessage: "Models" })}</legend>
          <p className="hc-model-fieldset-help">{formatMessage({ id: "hc.settings.modelForm.modelsHelp", defaultMessage: "List the models you can use, and choose which one is the default." })}</p>
          <div className="hc-model-fieldset-grid">
            <label className="hc-model-field hc-model-field-wide">
              <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.availableModelsLabel", defaultMessage: "Available models" })}</span>
              <textarea
                rows={3}
                value={availableModelsText}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setAvailableModelsText(nextValue);
                  setAvailableModels(nextValue);
                }}
                placeholder={formatMessage({ id: "hc.settings.modelForm.availableModelsPlaceholder", defaultMessage: "One model name per line, e.g.\ngpt-4o\ngpt-4o-mini" })}
              />
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.availableModelsHint", defaultMessage: "One per line, named exactly as your service expects, e.g. gpt-4o." })}</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.defaultModelLabel", defaultMessage: "Default model" })}</span>
              {defaultModelSelectable ? (
                <select
                  value={defaultModelInList ? modelDraft.model : ""}
                  onChange={(event) => setPrimaryModel(event.target.value)}
                >
                  {!defaultModelInList && <option value="" disabled>{formatMessage({ id: "hc.settings.modelForm.defaultModelPlaceholder", defaultMessage: "Choose a default model" })}</option>}
                  {configuredModels.map((slug) => (
                    <option key={slug} value={slug}>{slug}</option>
                  ))}
                </select>
              ) : (
                <input value={modelDraft.model} onChange={(event) => setPrimaryModel(event.target.value)} disabled placeholder={formatMessage({ id: "hc.settings.modelForm.defaultModelEmptyPlaceholder", defaultMessage: "Add available models above first" })} />
              )}
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.saveRestartHint", defaultMessage: "Saving restarts the model runtime; the current chat switches to the new connection on its next turn." })}</span>
            </label>
            <label className="hc-model-field">
              <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.temperatureLabel", defaultMessage: "Temperature" })}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={modelDraft.temperature}
                onChange={(event) => setModelDraft({ ...modelDraft, temperature: Number(event.target.value) })}
              />
              <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.temperatureHint", defaultMessage: "0 is the most predictable, 2 the most varied; 0.2 – 0.7 suits everyday use." })}</span>
            </label>
            <div className="hc-model-field hc-model-field-wide hc-model-field-toggle">
              <label className="hc-model-toggle">
                <input
                  type="checkbox"
                  checked={modelDraft.supportsImageInput !== false}
                  onChange={(event) =>
                    setModelDraft({
                      ...modelDraft,
                      supportsImageInput: event.target.checked,
                    })
                  }
                />
                <span className="hc-model-toggle-track" aria-hidden="true">
                  <span className="hc-model-toggle-thumb" />
                </span>
                <span className="hc-model-toggle-text">
                  <span className="hc-model-field-label">{formatMessage({ id: "hc.settings.modelForm.imageInputLabel", defaultMessage: "Supports image input" })}</span>
                  <span className="hc-model-field-hint">{formatMessage({ id: "hc.settings.modelForm.imageInputHint", defaultMessage: "When enabled, you can paste or drop images into chats; make sure the selected model itself supports images." })}</span>
                </span>
              </label>
            </div>
          </div>
        </fieldset>
      </div>
      <div className="hc-settings-footer">
        <div className="hc-muted">
          {formatMessage(
            {
              id: "hc.settings.modelForm.footerSummary",
              defaultMessage: "{configuredCount} models configured · {profileCount} model profiles · saving restarts the runtime to load the API URL and key",
            },
            { configuredCount: configuredModels.length, profileCount: models.length },
          )}
        </div>
        <button className="hc-button hc-button-primary hc-settings-footer-action" onClick={onSave} type="button">
          <KeyRound size={15} /> {formatMessage({ id: "hc.settings.modelForm.saveAndRestart", defaultMessage: "Save and restart runtime" })}
        </button>
      </div>
    </>
  );
}

export function ImageGenerationSettingsForm({
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
        <label>
          Base URL
          <input
            placeholder="Required to enable image_gen"
            value={imageGenerationDraft.baseUrl}
            onChange={(event) =>
              setImageGenerationDraft({
                ...imageGenerationDraft,
                baseUrl: event.target.value,
              })
            }
          />
        </label>
        <label>
          API Key
          <input
            placeholder="Reuse model API key"
            type="password"
            value={imageGenerationDraft.apiKey}
            onChange={(event) =>
              setImageGenerationDraft({
                ...imageGenerationDraft,
                apiKey: event.target.value,
              })
            }
          />
        </label>
        <label>
          Image model
          <input
            placeholder="Backend default"
            value={imageGenerationDraft.model}
            onChange={(event) =>
              setImageGenerationDraft({
                ...imageGenerationDraft,
                model: event.target.value,
              })
            }
          />
        </label>
        <label>
          Default size
          <select
            value={imageGenerationDraft.size}
            onChange={(event) =>
              setImageGenerationDraft({
                ...imageGenerationDraft,
                size: event.target.value as ImageGenerationSettings["size"],
              })
            }
          >
            {IMAGE_GENERATION_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="hc-settings-footer">
        <div className="hc-muted">Base URL is required — image_gen stays disabled without it. A blank API key reuses the active model profile.</div>
        <button className="hc-button hc-button-primary hc-settings-footer-action" onClick={onSave} type="button">
          <ImageIcon size={15} /> Save image endpoint
        </button>
      </div>
    </>
  );
}
