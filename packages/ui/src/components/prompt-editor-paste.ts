export interface PromptEditorPasteFileLike {
  readonly name?: string;
  readonly type?: string;
}

export function splitPromptEditorPasteFiles<T extends PromptEditorPasteFileLike>(
  files: ArrayLike<T> | null | undefined,
): { imageFiles: T[]; otherFiles: T[] } {
  const imageFiles: T[] = [];
  const otherFiles: T[] = [];
  for (const file of Array.from(files ?? [])) {
    if (isPromptEditorImageFile(file)) imageFiles.push(file);
    else otherFiles.push(file);
  }
  return { imageFiles, otherFiles };
}

function isPromptEditorImageFile(file: PromptEditorPasteFileLike): boolean {
  const mime = file.type?.trim().toLowerCase();
  if (mime?.startsWith("image/")) return true;
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name ?? "");
}
