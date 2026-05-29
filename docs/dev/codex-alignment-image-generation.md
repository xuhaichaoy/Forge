# Codex Alignment — Image Generation Rendering

Alignment reference for `ImageGeneration` ThreadItems and the right-rail Artifacts panel. Use this when changing `project-conversation.ts` image projection, `event-projection.ts` markdown image emission, `right-rail.tsx` artifact rendering, or any generated-image lightbox surface.

Linked: [gap matrix](./codex-alignment-gap-matrix.md).

## 1. Two surfaces, distinct contracts

There are two unrelated places generated images can appear in Codex Desktop:

1. **ThreadItem render path** — Codex's `ThreadItemView` switch contains `case 'generated-image': return null`. Generated images are NOT independent transcript cards.
2. **Turn-level inline gallery** — the turn container, after the assistant message and end resources, projects completed and pending generated images into a turn-level gallery component (clean-room name: `TurnGeneratedImageGallery`).

The earlier claim "Codex does not render inline generated images, only the right rail" was incorrect. The accurate statement: **no independent ThreadItem card, but YES a turn-level gallery in addition to the right-rail Artifacts list**.

HiCodex exposes generated images via:

- `project-conversation.ts` aggregating turn-scoped `generated-image` / `imageGeneration` items into one `generatedImageGallery` render unit.
- `right-rail.tsx` rendering them as right-rail artifacts.
- `event-projection.ts` emitting a markdown image only for legacy/orphan items outside normal turn grouping.

HiCodex now has the turn-level inline gallery equivalent.

## 2. Filename pattern

Both the right-rail Artifacts list and the inline gallery identify generated images by basename pattern:

```text
/^ig_[a-f0-9]{32,}\.(?:avif|gif|jpeg|jpg|png|webp)$/i
```

Matching artifacts render with the label `Generated image {imageNumber}` (1-based, ordered by appearance).

HiCodex `right-rail.tsx` uses the same regex.

## 3. Protocol state

`ImageGeneration.status` is a free-form string in the protocol. Observed values: `generating | complete | failed`.

## 4. Right-rail Artifacts section

- Cap: 6 items by default (`Show {count, number} more` / `Show less` toggle reveals the rest).
- Container: `-mx-2 flex max-h-[28rem] flex-col gap-px overflow-y-auto px-2`.
- Thumbnails load via the `app://` protocol for local files.
- Click opens the full-screen lightbox (see §6).

HiCodex right-rail behaves equivalently. The 6-item cap is shared with the Sources section.

## 5. Turn-level inline gallery (`TurnGeneratedImageGallery`)

Collection:

```ts
visibleCompletedGeneratedImages = completedGeneratedImages.filter(image => image.src != null)
hasPendingGeneratedImages = images.some(image => image.src == null && ['in_progress', 'inProgress'].includes(status))
shouldRenderGeneratedImageOutputs = visibleCompletedGeneratedImages.length > 0 || hasPendingGeneratedImages
```

Render rules:

- Cap: 4 images on screen (clean-room constant `MAX_GALLERY_ROW = 4`).
- Layout: natural aspect when the row fits the natural widths; switches to a square carousel otherwise.
- Overflow indicator: NOT a "show more" text affordance; rendered as a numeric badge with an icon in the bottom-right of the last visible tile.
- Hover / focus: shows two circular `Previous images` / `Next images` controls.
- Pending images: `flex h-24 w-24 ...` loading placeholder tile.
- Preview source: `previewSrc`; local file data is fetched through the `app://` bridge.

HiCodex implementation status: implemented by `project-conversation.ts` + `generated-image-gallery.tsx`; see [gap matrix](./codex-alignment-gap-matrix.md) G1.

## 6. Full-screen lightbox

A separate component handles full-screen preview with prev/next/close affordances:

- Container: `group/generated-image-gallery-controls relative overflow-hidden`.
- Close: `Close image preview` (`codex.localConversation.closeGeneratedImagePreview`).
- Carousel prev/next: `Previous images` / `Next images` (`codex.localConversation.generatedImageGallery.*`).
- Lightbox prev/next: `Previous image` / `Next image` (`imagePreviewDialog.previousImage` / `imagePreviewDialog.nextImage`).
- `imageNumber` counter is 1-based (`displayIndex + 1`).

HiCodex implementation status: `GeneratedImageGallery` uses `ImagePreviewLightbox` controlled mode with no visible card header, `Close image preview`, generic image-preview prev/next labels, `Download image`, zoom controls, `no-referrer`, and the thread-content max-width cap.

## 7. ThreadItem types that DO NOT render as transcript cards

The `case 'generated-image': return null` line lives in a broader skip list — these ThreadItem types are intentionally NOT independent transcript cards:

```text
generated-image                    -> turn-level gallery
assistant-message                  -> handled by conversation-markdown
auto-review-interruption-warning
automation-update
context-compaction
dynamic-tool-call                  -> mostly handled by tool-activity grouping
forked-from-conversation
mcp-server-elicitation
mcp-tool-call                      -> handled by tool-activity grouping
model-changed
model-rerouted
multi-agent-action
permission-request
personality-changed
plan-implementation
```

(Protocol type is `plan-implementation`, not `plan-implemented`; verified against Codex Desktop v26.519.81530 and HiCodex `render-group-types` / `event-projection`.)

This list is the durable rule for which types must not be rendered through the default `ThreadItemView` branch. Each entry has either a dedicated surface (gallery / markdown / tool-activity) or is explicitly suppressed.

## 8. i18n strings (durable)

```text
codex.localConversation.artifacts.generatedImage          = Generated image {imageNumber}
codex.localConversation.artifacts.showMore                = Show {count, number} more
codex.localConversation.artifacts.showLess                = Show less
codex.localConversation.generatedImageGallery.previousImages = Previous images
codex.localConversation.generatedImageGallery.nextImages     = Next images
codex.localConversation.closeGeneratedImagePreview        = Close image preview
codex.localConversation.generatedImage                    = Generated image {imageNumber}
```

## 9. Related Codex bundle areas

Search breadcrumbs:

- Right-rail Artifacts list: Codex `local-conversation-thread-*.js` (Artifacts region).
- Turn-level inline gallery: Codex `local-conversation-thread-*.js` (turn container, post-assistant section).
- Full-screen lightbox: Codex `local-conversation-thread-*.js` (generated-image-gallery-controls region).
