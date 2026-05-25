import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RemoteTaskView } from "../src/components/remote-task-view";

export default function runRemoteTaskViewTests(): void {
  rendersInternalRemoteTaskRouteShell();
}

function rendersInternalRemoteTaskRouteShell(): void {
  const html = renderToStaticMarkup(createElement(RemoteTaskView, {
    taskId: "task-123",
    onBack: () => undefined,
    onOpenExternal: () => undefined,
  }));

  assertIncludes(html, "Codex Cloud task", "remote task view should expose Desktop's internal route shell");
  assertIncludes(html, "task-123", "remote task view should render the task id");
  assertIncludes(html, "Back to local conversation", "remote task view should provide a local back action");
  assertIncludes(html, "Open in browser", "remote task view should keep the browser fallback action");
  assertIncludes(html, "hc-remote-task-main", "remote task view should use the app main surface");
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
