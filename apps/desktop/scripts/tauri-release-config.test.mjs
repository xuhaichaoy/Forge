import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
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
    APPLE_ID: "ci@example.com",
    APPLE_PASSWORD: "app-specific-password",
    APPLE_TEAM_ID: "ABCDE12345",
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
    HICODEX_MACOS_PROVIDER_SHORT_NAME: "ProviderShortName",
  });
  assert.deepEqual(result.config.bundle, {
    createUpdaterArtifacts: true,
    macOS: {
      signingIdentity: "Developer ID Application: Example Inc (ABCDE12345)",
      entitlements: "src-tauri/entitlements.plist",
      providerShortName: "ProviderShortName",
    },
  });
  assert.deepEqual(result.config.plugins.updater, {
    endpoints: ["https://releases.hicodex.test/{{target}}/{{arch}}/{{current_version}}"],
    pubkey: ENCODED_PUBLIC_KEY,
  });
  assert.equal(result.summary.macOSNotarizationAuth, "apple-id");
});

test("removes local ad-hoc signing when CI provides an Apple certificate", () => {
  const env = baseEnv();
  delete env.APPLE_SIGNING_IDENTITY;
  env.APPLE_CERTIFICATE = "base64-p12";
  env.APPLE_CERTIFICATE_PASSWORD = "certificate password";
  const result = buildTauriReleaseConfig(env);
  assert.equal(result.config.bundle.macOS.signingIdentity, null);
  assert.match(result.warnings.join("\n"), /removes the local ad-hoc identity/);
});

test("requires the Apple certificate password when CI provides a certificate", () => {
  const env = baseEnv();
  delete env.APPLE_SIGNING_IDENTITY;
  env.APPLE_CERTIFICATE = "base64-p12";
  assert.throws(
    () => buildTauriReleaseConfig(env),
    (err) =>
      err instanceof ReleaseConfigError &&
      err.errors.includes("Set APPLE_CERTIFICATE_PASSWORD when APPLE_CERTIFICATE is provided for CI signing."),
  );
});

test("accepts App Store Connect API key notarization credentials", () => {
  const env = baseEnv();
  delete env.APPLE_ID;
  delete env.APPLE_PASSWORD;
  delete env.APPLE_TEAM_ID;
  env.APPLE_API_KEY = "ABC123DEFG";
  env.APPLE_API_ISSUER = "00000000-0000-0000-0000-000000000000";
  env.APPLE_API_KEY_PATH = "/tmp/AuthKey_ABC123DEFG.p8";
  const result = buildTauriReleaseConfig(env);
  assert.equal(result.summary.macOSNotarizationAuth, "api-key");
});

test("requires complete macOS notarization credentials", () => {
  const env = baseEnv();
  delete env.APPLE_TEAM_ID;
  assert.throws(
    () => buildTauriReleaseConfig(env),
    (err) =>
      err instanceof ReleaseConfigError &&
      err.errors.includes("Set all of APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID for app-specific-password notarization."),
  );
});

test("allows explicit ad-hoc candidate builds without notarization credentials", () => {
  const env = baseEnv();
  delete env.APPLE_SIGNING_IDENTITY;
  delete env.APPLE_ID;
  delete env.APPLE_PASSWORD;
  delete env.APPLE_TEAM_ID;
  env.HICODEX_RELEASE_ALLOW_ADHOC_SIGNING = "1";
  const result = buildTauriReleaseConfig(env);
  assert.equal(result.config.bundle.macOS.signingIdentity, "-");
  assert.equal(result.summary.macOSNotarizationAuth, "skipped-ad-hoc");
  assert.match(result.warnings.join("\n"), /Skipping macOS notarization auth validation/);
});

test("fails fast when release-only values are missing", () => {
  assert.throws(
    () => buildTauriReleaseConfig({}),
    (err) => err instanceof ReleaseConfigError && err.errors.length === 5,
  );
});

test("development Tauri app uses a distinct bundle identity", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const devConfig = JSON.parse(readFileSync(new URL("../src-tauri/tauri.dev.conf.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts["tauri:dev"], /--config src-tauri\/tauri\.dev\.conf\.json/);
  assert.equal(devConfig.productName, "Forge Dev");
  assert.equal(devConfig.identifier, "com.forge.desktop.dev");
  assert.equal(devConfig.plugins["deep-link"].desktop.name, "com.forge.desktop.dev.deeplink");
});
