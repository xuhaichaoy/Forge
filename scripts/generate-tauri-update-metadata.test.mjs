import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildUpdateMetadata } from "./generate-tauri-update-metadata.mjs";

test("writes latest metadata without rewriting templated updater endpoint destination", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "forge-update-metadata-test-"));
  try {
    const configPath = join(tempDir, "tauri.release.conf.json");
    const outDir = join(tempDir, "out");
    writeFileSync(
      configPath,
      JSON.stringify({
        plugins: {
          updater: {
            endpoints: ["https://releases.forge.test/update/{{target}}/{{arch}}/{{current_version}}"],
          },
        },
      }),
    );
    mkdirSync(outDir);
    writeFileSync(join(outDir, "Forge_1.2.3_aarch64.app.tar.gz.sig"), "signature\n");

    const result = buildUpdateMetadata({
      artifactName: "Forge",
      configPath,
      outDir,
      product: "Forge",
      skipCopy: true,
      targets: ["aarch64-apple-darwin"],
      version: "1.2.3",
    });

    assert.ok(existsSync(result.latestPath));
    assert.equal(
      result.metadata.platforms["darwin-aarch64"].url,
      "https://releases.forge.test/update/Forge_1.2.3_aarch64.app.tar.gz",
    );
    const destinations = readFileSync(join(outDir, "upload-destinations.txt"), "utf8");
    assert.match(destinations, /serve latest\.json at this templated updater route/);
    assert.doesNotMatch(destinations, /update\/latest\.json/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
