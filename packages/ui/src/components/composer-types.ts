/*
 * Pure type leaf for composer prop shapes shared with the composer workflow
 * hooks. Extracted from ./composer so the attachment-picker workflow's
 * type-only back edge no longer closes a cycle with composer's value import
 * of the workflow hook. composer.tsx re-exports this name in place, so
 * existing import paths keep working unchanged.
 */
export type ComposerBrowseKind = "file" | "image";
