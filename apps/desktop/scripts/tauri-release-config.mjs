import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "placeholder.invalid",
]);
const DEFAULT_OUTPUT = ".tmp/tauri.release.conf.json";

export class ReleaseConfigError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "ReleaseConfigError";
    this.errors = errors;
  }
}

export function buildTauriReleaseConfig(env = process.env, options = {}) {
  const errors = [];
  const warnings = [];
  const readFile = options.readFile ?? ((path) => readFileSync(path, "utf8"));

  const allowInsecure = parseBool(env.HICODEX_UPDATER_ALLOW_INSECURE);
  const endpoints = parseUpdaterEndpoints(env.HICODEX_UPDATER_ENDPOINTS, errors);
  validateUpdaterEndpoints(endpoints, { allowInsecure, errors });

  const pubkey = readUpdaterPubkey(env, readFile, errors);
  validateUpdaterSigningKey(env, readFile, errors);

  const macOS = buildMacOSReleaseConfig(env, { errors, warnings });

  if (errors.length > 0) {
    throw new ReleaseConfigError(errors);
  }

  const updater = {
    endpoints,
    pubkey,
  };
  if (allowInsecure) {
    updater.dangerousInsecureTransportProtocol = true;
    warnings.push("HICODEX_UPDATER_ALLOW_INSECURE is enabled; do not use it for public production updates.");
  }

  return {
    config: {
      bundle: {
        createUpdaterArtifacts: true,
        macOS,
      },
      plugins: {
        updater,
      },
    },
    summary: {
      endpoints,
      createUpdaterArtifacts: true,
      pubkeyConfigured: pubkey.length > 0,
      updaterSigningKeyConfigured: hasValue(env.TAURI_SIGNING_PRIVATE_KEY) || hasValue(env.TAURI_SIGNING_PRIVATE_KEY_PATH),
      macOS,
    },
    warnings,
  };
}

export function parseUpdaterEndpoints(raw, errors = []) {
  if (!hasValue(raw)) {
    errors.push("Set HICODEX_UPDATER_ENDPOINTS to one or more real updater metadata URLs.");
    return [];
  }

  const value = raw.trim();
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
        errors.push("HICODEX_UPDATER_ENDPOINTS JSON must be an array of strings.");
        return [];
      }
      return parsed.map((entry) => entry.trim()).filter(Boolean);
    } catch (err) {
      errors.push(`HICODEX_UPDATER_ENDPOINTS is not valid JSON: ${errorMessage(err)}`);
      return [];
    }
  }

  return value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
}

export function validateUpdaterEndpoints(endpoints, { allowInsecure = false, errors = [] } = {}) {
  if (endpoints.length === 0) return errors;

  for (const endpoint of endpoints) {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      errors.push(`Updater endpoint is not a valid URL: ${endpoint}`);
      continue;
    }

    if (url.username || url.password) {
      errors.push(`Updater endpoint must not embed credentials: ${endpoint}`);
    }
    if (!allowInsecure && url.protocol !== "https:") {
      errors.push(`Updater endpoint must use https in release builds: ${endpoint}`);
    }
    if (PLACEHOLDER_HOSTS.has(url.hostname) || url.hostname.endsWith(".invalid")) {
      errors.push(`Updater endpoint still looks like a placeholder: ${endpoint}`);
    }
  }

  return errors;
}

export function normalizeUpdaterPubkey(raw) {
  const value = raw.trim();
  if (!value) {
    throw new Error("updater public key is empty");
  }

  if (value.includes("untrusted comment:") || value.includes("\n")) {
    return Buffer.from(value, "utf8").toString("base64");
  }

  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded.includes("minisign public key")) {
    throw new Error("updater public key must be the Tauri signer public key, not a placeholder or private key");
  }
  return value;
}

function readUpdaterPubkey(env, readFile, errors) {
  const inline = env.HICODEX_UPDATER_PUBKEY;
  const path = env.HICODEX_UPDATER_PUBKEY_PATH;
  if (hasValue(inline) && hasValue(path)) {
    errors.push("Set only one of HICODEX_UPDATER_PUBKEY or HICODEX_UPDATER_PUBKEY_PATH.");
    return "";
  }

  try {
    if (hasValue(inline)) {
      return normalizeUpdaterPubkey(inline);
    }
    if (hasValue(path)) {
      return normalizeUpdaterPubkey(readFile(path.trim()));
    }
  } catch (err) {
    errors.push(`Invalid updater public key: ${errorMessage(err)}`);
    return "";
  }

  errors.push("Set HICODEX_UPDATER_PUBKEY or HICODEX_UPDATER_PUBKEY_PATH for release builds.");
  return "";
}

function validateUpdaterSigningKey(env, readFile, errors) {
  if (hasValue(env.TAURI_SIGNING_PRIVATE_KEY)) {
    return;
  }
  if (hasValue(env.TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    try {
      if (!hasValue(readFile(env.TAURI_SIGNING_PRIVATE_KEY_PATH.trim()))) {
        errors.push("TAURI_SIGNING_PRIVATE_KEY_PATH points to an empty updater private key file.");
      }
    } catch (err) {
      errors.push(`TAURI_SIGNING_PRIVATE_KEY_PATH cannot be read: ${errorMessage(err)}`);
    }
    return;
  }
  errors.push("Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH so Tauri can sign updater artifacts.");
}

function buildMacOSReleaseConfig(env, { errors, warnings }) {
  const signingIdentity = firstValue(env.HICODEX_MACOS_SIGNING_IDENTITY, env.APPLE_SIGNING_IDENTITY);
  const entitlements = firstValue(env.HICODEX_MACOS_ENTITLEMENTS);
  const hasAppleCertificate = hasValue(env.APPLE_CERTIFICATE);
  const allowAdhoc = parseBool(env.HICODEX_RELEASE_ALLOW_ADHOC_SIGNING);

  const macOS = {};
  if (signingIdentity) {
    macOS.signingIdentity = signingIdentity;
  } else if (hasAppleCertificate) {
    macOS.signingIdentity = null;
    warnings.push("APPLE_CERTIFICATE is set; release config removes the local ad-hoc identity so Tauri can infer the imported certificate.");
  } else if (allowAdhoc) {
    macOS.signingIdentity = "-";
    warnings.push("Using ad-hoc macOS signing for a release build because HICODEX_RELEASE_ALLOW_ADHOC_SIGNING=1.");
  } else {
    errors.push("Set APPLE_SIGNING_IDENTITY, HICODEX_MACOS_SIGNING_IDENTITY, or APPLE_CERTIFICATE for macOS release signing.");
  }

  if (entitlements) {
    macOS.entitlements = entitlements;
  }

  return macOS;
}

function parseBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function firstValue(...values) {
  for (const value of values) {
    if (hasValue(value)) return value.trim();
  }
  return "";
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function parseArgs(argv) {
  const args = { build: false, buildArgs: [], check: false, print: false, write: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      args.buildArgs = argv.slice(i + 1);
      break;
    } else if (arg === "--build") {
      args.build = true;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--print") {
      args.print = true;
    } else if (arg === "--write") {
      const output = argv[i + 1];
      if (!output) throw new Error("--write requires an output path");
      args.write = output;
      i += 1;
    } else if (args.build) {
      args.buildArgs = argv.slice(i);
      break;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.build && !args.write) args.write = DEFAULT_OUTPUT;
  if (!args.build && !args.check && !args.print && !args.write) args.check = true;
  return args;
}

function childBuildEnv(env) {
  if (hasValue(env.TAURI_SIGNING_PRIVATE_KEY) || !hasValue(env.TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    return env;
  }
  return {
    ...env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(env.TAURI_SIGNING_PRIVATE_KEY_PATH.trim(), "utf8"),
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(errorMessage(err));
    process.exit(1);
  }

  try {
    const result = buildTauriReleaseConfig(process.env);
    if (args.write) {
      const outputPath = resolve(args.write);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(result.config, null, 2)}\n`);
      console.log(`Wrote Tauri release config: ${outputPath}`);
    }
    if (args.print) {
      console.log(JSON.stringify(result.config, null, 2));
    } else if (args.check) {
      console.log(JSON.stringify({ ok: true, summary: result.summary, warnings: result.warnings }, null, 2));
    }
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (args.build) {
      const tauriBin = process.platform === "win32" ? "tauri.cmd" : "tauri";
      const build = spawnSync(tauriBin, ["build", "--config", args.write, ...args.buildArgs], {
        env: childBuildEnv(process.env),
        stdio: "inherit",
      });
      process.exit(build.status ?? 1);
    }
  } catch (err) {
    if (err instanceof ReleaseConfigError) {
      console.error("Release updater configuration is incomplete:");
      for (const message of err.errors) {
        console.error(`- ${message}`);
      }
      process.exit(1);
    }
    console.error(errorMessage(err));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
