export type FileCitationArtifactTarget =
  | { artifactKind: "document"; pageNumber: number }
  | { artifactKind: "presentation"; slideId?: string; slideNumber?: number; objectId?: string }
  | { artifactKind: "workbook"; sheet: string; range: string }
  | { artifactKind: "workbook"; sheet: string; objectId: string; objectKind?: "chart" | "image" | "shape" | "table" };

export interface FileCitationArtifactCitation {
  label?: string | null;
  target: FileCitationArtifactTarget;
}

export interface FileReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
  hostId?: string | null;
  artifactCitation?: FileCitationArtifactCitation | null;
}
