import { Check, Circle, Loader2, XCircle } from "lucide-react";
import { type LibraryUploadRun } from "./kb-library-model";

export type IngestPipelineStage = "source" | "parse" | "entity" | "confirm" | "index";
export type IngestPipelineTone = "done" | "active" | "waiting" | "failed";

export interface IngestPipelineStep {
  id: IngestPipelineStage;
  label: string;
  tone: IngestPipelineTone;
}

const PIPELINE_LABELS: Record<IngestPipelineStage, string> = {
  source: "原件",
  parse: "解析",
  entity: "提取",
  confirm: "确认",
  index: "入库",
};

const DEFAULT_PIPELINE: IngestPipelineStep[] = [
  { id: "source", label: PIPELINE_LABELS.source, tone: "waiting" },
  { id: "parse", label: PIPELINE_LABELS.parse, tone: "waiting" },
  { id: "entity", label: PIPELINE_LABELS.entity, tone: "waiting" },
  { id: "confirm", label: PIPELINE_LABELS.confirm, tone: "waiting" },
  { id: "index", label: PIPELINE_LABELS.index, tone: "waiting" },
];

export function KbLibraryIngestPipeline({
  steps = DEFAULT_PIPELINE,
  compact = false,
}: {
  steps?: IngestPipelineStep[];
  compact?: boolean;
}) {
  return (
    <ol className="hc-kb-ingest-pipeline" data-compact={compact ? "true" : undefined} aria-label="资料处理阶段">
      {steps.map((step) => {
        const Icon = stageIcon(step.tone);
        return (
          <li key={step.id} data-tone={step.tone}>
            <Icon size={12} strokeWidth={2.3} aria-hidden="true" />
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function uploadRunPipelineSteps(run: LibraryUploadRun): IngestPipelineStep[] {
  if (run.status === "failed") {
    return [
      step("source", "done"),
      step("parse", "failed"),
      step("entity", "waiting"),
      step("confirm", "waiting"),
      step("index", "waiting"),
    ];
  }
  if (run.status === "queued") {
    return [
      step("source", "done"),
      step("parse", "done"),
      step("entity", "done"),
      step("confirm", "active"),
      step("index", "waiting"),
    ];
  }
  if (run.status === "done") {
    return [
      step("source", "done"),
      step("parse", "done"),
      step("entity", "done"),
      step("confirm", "done"),
      step("index", "done"),
    ];
  }
  if (run.status === "uploading") {
    return [
      step("source", "active"),
      step("parse", "waiting"),
      step("entity", "waiting"),
      step("confirm", "waiting"),
      step("index", "waiting"),
    ];
  }
  return [
    step("source", "done"),
    step("parse", "active"),
    step("entity", "active"),
    step("confirm", "waiting"),
    step("index", "waiting"),
  ];
}

function step(id: IngestPipelineStage, tone: IngestPipelineTone): IngestPipelineStep {
  return { id, label: PIPELINE_LABELS[id], tone };
}

function stageIcon(tone: IngestPipelineTone) {
  if (tone === "done") return Check;
  if (tone === "active") return Loader2;
  if (tone === "failed") return XCircle;
  return Circle;
}
