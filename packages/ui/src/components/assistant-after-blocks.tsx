import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { AssistantEndResourceCards } from "./assistant-end-resource-cards";
import { GeneratedImageGallery } from "./generated-image-gallery";
import { TurnDiffBlock, type PatchAction, type PatchActionState } from "./event-unit";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;

export function AssistantAfterGalleries({ units }: { units: NonNullable<MessageRenderUnit["assistantAfter"]> }) {
  const galleries = units.filter((unit) => unit.kind === "generatedImageGallery");
  if (galleries.length === 0) return null;
  return (
    <>
      {galleries.map((unit) => (
        <GeneratedImageGallery
          hasPending={unit.hasPending}
          images={unit.images}
          key={unit.key}
        />
      ))}
    </>
  );
}

export function AssistantAfterEndResources({
  units,
  onOpenArtifact,
  onRevealResource,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenArtifact?: (entry: RailEntry) => void;
  onRevealResource?: (entry: RailEntry) => void;
}) {
  const resourceUnits = units.filter((unit) => unit.kind === "assistantEndResources");
  if (resourceUnits.length === 0) return null;
  return (
    <>
      {resourceUnits.map((unit) => (
        <AssistantEndResourceCards
          key={unit.key}
          resources={unit.resources}
          onOpenArtifact={onOpenArtifact}
          onRevealResource={onRevealResource}
        />
      ))}
    </>
  );
}

export function AssistantAfterEvents({
  units,
  onOpenDiff,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenDiff?: (filePath?: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
}) {
  const events = units.filter((unit) => unit.kind === "assistantAfterEvent");
  if (events.length === 0) return null;
  return (
    <>
      {events.map((unit) => {
        if (unit.format !== "diff") return null;
        return (
          <TurnDiffBlock
            contentSearchUnitKey={unit.key}
            inProgress={false}
            itemIds={unit.item.id}
            key={unit.key}
            onOpenDiff={onOpenDiff}
            onPatchAction={onPatchAction}
            patchActionState={patchActionState}
            patchActionInFlight={patchActionInFlight}
            value={unit.text}
          />
        );
      })}
    </>
  );
}
