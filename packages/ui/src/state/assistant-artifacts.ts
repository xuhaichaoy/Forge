import { projectArtifactPreview } from "./artifact-preview";
import type { RailEntry, ThreadItem } from "./render-group-types";
import { artifactsFromText, fileArtifactEntryFromPath, setArtifact } from "./rail-projection";
import { commandOutputText, filePathsFromItem, itemText, statusText } from "./thread-item-fields";

export function assistantArtifactsForTurn(
  items: ThreadItem[],
  assistantText: string,
  knownArtifacts: Iterable<RailEntry> = [],
): RailEntry[] {
  const artifacts = new Map<string, RailEntry>();
  for (const entry of knownArtifacts) {
    if (entry.action?.kind !== "file") continue;
    setArtifact(artifacts, entry);
  }

  for (const item of items) {
    for (const path of filePathsFromItem(item)) {
      const entry = fileArtifactEntryFromPath(path, statusText(item));
      setArtifact(artifacts, entry);
    }
    for (const entry of artifactsFromText(commandOutputText(item), { source: "output" })) {
      if (entry.action?.kind !== "file") continue;
      setArtifact(artifacts, entry);
    }
    for (const entry of artifactsFromText(itemText(item), { source: "assistant" })) {
      if (entry.action?.kind !== "file") continue;
      setArtifact(artifacts, entry);
    }
  }

  for (const entry of artifactsFromText(assistantText, { source: "assistant" })) {
    if (entry.action?.kind !== "file") continue;
    setArtifact(artifacts, entry);
  }

  return Array.from(artifacts.values()).filter((entry) => {
    const kind = projectArtifactPreview(entry).kind;
    return kind !== "url";
  });
}
