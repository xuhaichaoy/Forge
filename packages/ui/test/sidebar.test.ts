import { sidebarContextMenuPosition } from "../src/components/sidebar";

export default function runSidebarComponentTests(): void {
  clampsThreadContextMenuIntoViewport();
}

function clampsThreadContextMenuIntoViewport(): void {
  const bottomRight = sidebarContextMenuPosition(
    { x: 780, y: 590 },
    { width: 800, height: 600 },
  );

  assertEqual(bottomRight.left, 572, "context menu should shift left from the viewport edge");
  assertEqual(bottomRight.top, 232, "context menu should shift up from the viewport bottom");

  const topLeft = sidebarContextMenuPosition(
    { x: -20, y: 0 },
    { width: 800, height: 600 },
  );

  assertEqual(topLeft.left, 8, "context menu should keep a left margin");
  assertEqual(topLeft.top, 8, "context menu should keep a top margin");
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
