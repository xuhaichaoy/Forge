import { Eye, EyeOff, ImageIcon, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ModelConfig } from "@hicodex/codex-protocol";
import {
  modelSlugsForConfig,
  modelSlugsWithPrimary,
  parseModelSlugsInput,
} from "../model/model-settings";
import type { CommandPanelEntry, CommandPanelEntryAction, CommandPanelState } from "../state/command-panel";
import { IMAGE_GENERATION_SIZE_OPTIONS, type ImageGenerationSettings } from "../state/image-generation-tool";
import { CommandPanelEntryList } from "./command-panel";

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
                value={availableModelsText}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setAvailableModelsText(nextValue);
                  setAvailableModels(nextValue);
                }}
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
              <span className="hc-model-field-hint">保存后会重启模型运行时，当前对话下一轮会使用新连接。</span>
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
          已配置 {configuredModels.length} 个模型 · 当前共 {models.length} 套模型档案 · 保存会重启运行时以加载 API 地址和 Key
        </div>
        <button className="hc-button hc-button-primary hc-settings-footer-action" onClick={onSave} type="button">
          <KeyRound size={15} /> 保存并重启运行时
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
