import { strict as assert } from "node:assert";
import test from "node:test";

import {
  ReleaseConfigError,
  buildTauriReleaseConfig,
  normalizeUpdaterPubkey,
  parseUpdaterEndpoints,
  validateUpdaterEndpoints,
} from "./tauri-release-config.mjs";

const RAW_PUBLIC_KEY = [
  "untrusted comment: minisign public key: 815D3694E0C665BF",
  "RWS/ZcbglDZdgWYbo2pA9TNMvDtCvoK4l6hJ9uZ7qdBW/AzL7TLi8Ccn",
].join("\n");
const ENCODED_PUBLIC_KEY = Buffer.from(RAW_PUBLIC_KEY, "utf8").toString("base64");

function baseEnv() {
  return {
    HICODEX_UPDATER_ENDPOINTS: "https://releases.hicodex.test/{{target}}/{{arch}}/{{current_version}}",
    HICODEX_UPDATER_PUBKEY: ENCODED_PUBLIC_KEY,
    TAURI_SIGNING_PRIVATE_KEY: "secret key material",
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Example Inc (ABCDE12345)",
  };
}

test("parses JSON and delimited updater endpoints", () => {
  assert.deepEqual(parseUpdaterEndpoints('["https://a.test/latest.json","https://b.test/latest.json"]'), [
    "https://a.test/latest.json",
    "https://b.test/latest.json",
  ]);
  assert.deepEqual(parseUpdaterEndpoints("https://a.test/latest.json,\nhttps://b.test/latest.json"), [
    "https://a.test/latest.json",
    "https://b.test/latest.json",
  ]);
});

test("rejects insecure or placeholder updater endpoints by default", () => {
  const errors = [];
  validateUpdaterEndpoints(["http://updates.test/latest.json", "https://placeholder.invalid/latest.json"], { errors });
  assert.deepEqual(errors, [
    "Updater endpoint must use https in release builds: http://updates.test/latest.json",
    "Updater endpoint still looks like a placeholder: https://placeholder.invalid/latest.json",
  ]);
});

test("allows insecure endpoints only when explicitly requested", () => {
  const errors = [];
  validateUpdaterEndpoints(["http://updates.test/latest.json"], { allowInsecure: true, errors });
  assert.deepEqual(errors, []);
});

test("normalizes raw minisign public key content to Tauri updater pubkey", () => {
  assert.equal(normalizeUpdaterPubkey(RAW_PUBLIC_KEY), ENCODED_PUBLIC_KEY);
  assert.equal(normalizeUpdaterPubkey(ENCODED_PUBLIC_KEY), ENCODED_PUBLIC_KEY);
});

test("builds a release merge config from environment variables", () => {
  const result = buildTauriReleaseConfig({
    ...baseEnv(),
    HICODEX_MACOS_ENTITLEMENTS: "src-tauri/entitlements.plist",
  });
  assert.deepEqual(result.config.bundle, {
    createUpdaterArtifacts: true,
    macOS: {
      signingIdentity: "Developer ID Application: Example Inc (ABCDE12345)",
      entitlements: "src-tauri/entitlements.plist",
    },
  });
  assert.deepEqual(result.config.plugins.updater, {
    endpoints: ["https://releases.hicodex.test/{{target}}/{{arch}}/{{current_version}}"],
    pubkey: ENCODED_PUBLIC_KEY,
  });
});

test("removes local ad-hoc signing when CI provides an Apple certificate", () => {
  const env = baseEnv();
  delete env.APPLE_SIGNING_IDENTITY;
  env.APPLE_CERTIFICATE = "base64-p12";
  const result = buildTauriReleaseConfig(env);
  assert.equal(result.config.bundle.macOS.signingIdentity, null);
  assert.match(result.warnings.join("\n"), /removes the local ad-hoc identity/);
});

test("fails fast when release-only values are missing", () => {
  assert.throws(
    () => buildTauriReleaseConfig({}),
    (err) => err instanceof ReleaseConfigError && err.errors.length === 4,
  );
});
