import { KeyRound, Play, X } from "lucide-react";
import type { ModelConfig } from "@hicodex/codex-protocol";

export interface ModelSettingsPanelProps {
  modelDraft: ModelConfig;
  setModelDraft: (model: ModelConfig) => void;
  models: ModelConfig[];
  onClose: () => void;
  onSave: () => void;
}

export function ModelSettingsPanel({
  modelDraft,
  setModelDraft,
  models,
  onClose,
  onSave,
}: ModelSettingsPanelProps) {
  return (
    <div className="hc-settings-backdrop">
      <section className="hc-settings-panel">
        <header>
          <div><KeyRound size={17} /> Model configuration</div>
          <button className="hc-icon-button" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="hc-settings-grid">
          <label>Name<input value={modelDraft.name} onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })} /></label>
          <label>Protocol<select value={modelDraft.protocol} onChange={(event) => setModelDraft({ ...modelDraft, protocol: event.target.value as ModelConfig["protocol"] })}><option value="openai">OpenAI compatible</option><option value="anthropic">Anthropic</option></select></label>
          <label>Base URL<input value={modelDraft.baseUrl} onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value })} /></label>
          <label>API Key<input type="password" value={modelDraft.apiKey} onChange={(event) => setModelDraft({ ...modelDraft, apiKey: event.target.value })} /></label>
          <label>Model<input value={modelDraft.model} onChange={(event) => setModelDraft({ ...modelDraft, model: event.target.value })} /></label>
          <label>Temperature<input type="number" step="0.1" value={modelDraft.temperature} onChange={(event) => setModelDraft({ ...modelDraft, temperature: Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={modelDraft.supportsImageInput !== false} onChange={(event) => setModelDraft({ ...modelDraft, supportsImageInput: event.target.checked })} /> Image input</label>
        </div>
        <div className="hc-settings-footer">
          <div className="hc-muted">{models.length} configured model profile(s)</div>
          <button className="hc-button hc-button-primary" onClick={onSave}><Play size={15} /> Save and apply</button>
        </div>
      </section>
    </div>
  );
}
