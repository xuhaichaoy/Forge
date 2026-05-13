import { projectArtifactPreview } from "./artifact-preview";
import type { RailEntry, ThreadItem } from "./render-group-types";
import {
  addCommandOutputFileCandidates,
  addFileArtifactCandidate,
  artifactsFromText,
  fileArtifactEntryFromPath,
  resolveFileArtifactCandidate,
  setArtifact,
  type ArtifactFileCandidateIndex,
} from "./rail-projection";
import {
  commandOutputText,
  filePathsFromItem,
  shouldProjectArtifactsFromItem,
  statusText,
} from "./thread-item-fields";

export function assistantArtifactsForTurn(
  items: ThreadItem[],
  assistantText: string,
  knownArtifacts: Iterable<RailEntry> = [],
  knownFileCandidates: ArtifactFileCandidateIndex = new Map(),
): RailEntry[] {
  const artifacts = new Map<string, RailEntry>();
  const fileCandidates: ArtifactFileCandidateIndex = new Map(knownFileCandidates);
  for (const entry of knownArtifacts) {
    if (entry.action?.kind !== "file") continue;
    addFileArtifactCandidate(fileCandidates, entry);
  }

  for (const item of items) {
    if (shouldProjectArtifactsFromItem(item)) {
      for (const path of filePathsFromItem(item)) {
        const entry = fileArtifactEntryFromPath(path, statusText(item));
        setArtifact(artifacts, entry);
        addFileArtifactCandidate(fileCandidates, entry);
      }
      addCommandOutputFileCandidates(fileCandidates, commandOutputText(item));
    }
  }

  for (const entry of artifactsFromText(assistantText, { source: "assistant" })) {
    if (entry.action?.kind !== "file") continue;
    setArtifact(artifacts, resolveFileArtifactCandidate(entry, fileCandidates));
  }

  return Array.from(artifacts.values()).filter((entry) => {
    const kind = projectArtifactPreview(entry).kind;
    return kind !== "url";
  });
}
