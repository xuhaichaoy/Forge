import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerFooterLeft,
  ComposerSubmitButton,
} from "../src/components/composer-footer";
import { projectComposerSubmitState } from "../src/state/composer-workflow";

export default function runComposerFooterTests(): void {
  rendersPlanAndGoalFooterControls();
  rendersSubmitButtonModes();
}

function rendersPlanAndGoalFooterControls(): void {
  const html = renderToStaticMarkup(createElement(ComposerFooterLeft, {
    attachmentPickerOpen: true,
    mode: "plan",
    goalMode: true,
    onPlanSelected: () => undefined,
    onPursueGoal: () => undefined,
    onShowAttachmentMenu: () => undefined,
  }));

  assertIncludes(html, "aria-expanded=\"true\"", "footer add-context button should reflect attachment menu state");
  assertIncludes(html, "Add files and more", "footer should render add-context accessible label");
  assertIncludes(html, "Plan", "plan mode should render plan pill");
  assertIncludes(html, "Goal", "goal mode should render goal pill");
  assertIncludes(html, "Clear goal", "goal pill should expose clear-goal tooltip title");
}

function rendersSubmitButtonModes(): void {
  const sendHtml = renderToStaticMarkup(createElement(ComposerSubmitButton, {
    submitState: projectComposerSubmitState({
      input: "hello",
      attachmentCount: 0,
      connecting: false,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    submitTitle: "Send message",
  }));
  assertIncludes(sendHtml, "data-mode=\"send\"", "idle composer should render send mode");
  assertIncludes(sendHtml, "aria-label=\"Send message\"", "submit button should expose submit title");

  const stopHtml = renderToStaticMarkup(createElement(ComposerSubmitButton, {
    submitState: projectComposerSubmitState({
      input: "",
      attachmentCount: 0,
      connecting: false,
      threadRunning: true,
      activeTurnId: "turn-1",
      pendingRequestCount: 0,
    }),
    submitTitle: "Stop",
  }));
  assertIncludes(stopHtml, "data-mode=\"stop\"", "running composer should render stop mode");

  const connectingHtml = renderToStaticMarkup(createElement(ComposerSubmitButton, {
    submitState: projectComposerSubmitState({
      input: "hello",
      attachmentCount: 0,
      connecting: true,
      threadRunning: false,
      activeTurnId: null,
      pendingRequestCount: 0,
    }),
    submitTitle: "Connecting",
  }));
  assertIncludes(connectingHtml, "hc-spin", "connecting composer should render spinner");
  assertIncludes(connectingHtml, "disabled=\"\"", "connecting composer should disable submit");
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
