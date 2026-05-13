import { commandPreviewText, looksLikeCommandOrPath } from "../src/components/pending-request-stack";

export default function runPendingRequestStackTests(): void {
  detectsCommandsAndPaths();
  keepsPlainLanguageDetailsAsText();
  preservesCommandPreviewText();
}

function detectsCommandsAndPaths(): void {
  assertEqual(looksLikeCommandOrPath("npm run typecheck"), true, "npm command should be treated as technical");
  assertEqual(looksLikeCommandOrPath("/workspace/project"), true, "absolute path should be treated as technical");
  assertEqual(looksLikeCommandOrPath("./scripts/build.mjs"), true, "relative path should be treated as technical");
  assertEqual(looksLikeCommandOrPath("https://example.com"), true, "URL should be treated as technical");
  assertEqual(looksLikeCommandOrPath("src/app.ts"), true, "source file path should be treated as technical");
}

function keepsPlainLanguageDetailsAsText(): void {
  assertEqual(looksLikeCommandOrPath("No additional permissions"), false, "ordinary prose should not be code styled");
  assertEqual(looksLikeCommandOrPath("Apply generated changes"), false, "approval reason prose should not be code styled");
}

function preservesCommandPreviewText(): void {
  const heredoc = "/bin/zsh -lc 'cat > ~/Downloads/hicodex_demo.html <<\\'HTML\\'\n<div>preview</div>\nHTML'";
  assertEqual(commandPreviewText({ command: heredoc }), heredoc, "multiline command preview should stay as one preview block");
  assertEqual(commandPreviewText({ command: ["npm", "run", "typecheck"] }), "npm run typecheck", "argv commands should join for preview");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
