import {
  shouldRenderMessageActionRow,
  shouldRenderUserMessageActionStrip,
} from "../src/components/message-unit";

export default function runMessageUnitTests(): void {
  hidesTimestampOnlyActionRows();
  rendersRowsWithCopyableText();
  rendersRowsWithSecondaryActions();
  rendersUserActionStripForMetadataOnlyRows();
}

function hidesTimestampOnlyActionRows(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "", hasActionChildren: false }),
    false,
    "message actions should not render when only a timestamp is available",
  );
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "   ", hasActionChildren: false }),
    false,
    "whitespace-only copy text should not render a Desktop action row",
  );
}

function rendersRowsWithCopyableText(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "hello", hasActionChildren: false }),
    true,
    "copyable text should render a Desktop action row",
  );
}

function rendersRowsWithSecondaryActions(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "", hasActionChildren: true }),
    true,
    "artifact, fork, edit, or review actions should render a Desktop action row",
  );
}

function rendersUserActionStripForMetadataOnlyRows(): void {
  assertEqual(
    shouldRenderUserMessageActionStrip({ copyText: "", hasEditAction: false, metaCount: 1 }),
    true,
    "Desktop user status chips should keep the below-message strip visible without copy/edit actions",
  );
  assertEqual(
    shouldRenderUserMessageActionStrip({ copyText: "   ", hasEditAction: false, metaCount: 0 }),
    false,
    "empty user messages without metadata should not render the below-message strip",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
