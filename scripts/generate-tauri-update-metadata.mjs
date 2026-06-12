import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    artifactName: process.env.HICODEX_RELEASE_ARTIFACT_NAME || "HiCodex",
    config: resolve(root, ".tmp/tauri.release.conf.json"),
    outDir: "",
    product: "",
    skipCopy: false,
    targets: [],
    version: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact-name") {
      args.artifactName = requiredValue(argv, ++index, arg);
    } else if (arg === "--config") {
      args.config = resolve(requiredValue(argv, ++index, arg));
    } else if (arg === "--out-dir") {
      args.outDir = resolve(requiredValue(argv, ++index, arg));
    } else if (arg === "--product") {
      args.product = requiredValue(argv, ++index, arg);
    } else if (arg === "--skip-copy") {
      args.skipCopy = true;
    } else if (arg === "--target") {
      args.targets.push(requiredValue(argv, ++index, arg));
    } else if (arg === "--version") {
      args.version = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.targets.length === 0) {
    const rawTargets = process.env.HICODEX_RELEASE_TARGETS || process.env.HICODEX_RELEASE_TARGET || "";
    args.targets = rawTargets.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  }
  if (args.targets.length === 0) args.targets = ["aarch64-apple-darwin"];
  if (!args.version) {
    args.version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
  }
  if (!args.outDir) {
    args.outDir = resolve(root, "dist/release", args.version);
  }
  if (!args.product) {
    const baseConfig = JSON.parse(readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
    const releaseConfig = readJson(args.config);
    args.product = releaseConfig.productName || baseConfig.productName || "HiCodex";
  }
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function bundleDirForTarget(target) {
  const candidates = [
    resolve(root, "target", target, "release/bundle"),
    resolve(root, "apps/desktop/src-tauri/target", target, "release/bundle"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Tauri bundle directory not found for ${target}; checked ${candidates.join(", ")}`);
}

function singleDmg(bundleDir, product) {
  const dmgDir = resolve(bundleDir, "dmg");
  const matches = readdirSync(dmgDir)
    .filter((name) => name.startsWith(`${product}_`) && name.endsWith(".dmg"))
    .map((name) => resolve(dmgDir, name));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one DMG for ${product} in ${dmgDir}, found ${matches.length}`);
  }
  return matches[0];
}

function archFromTarget(target) {
  if (!target.endsWith("-apple-darwin")) {
    throw new Error(`Only macOS Tauri update metadata is supported, got target: ${target}`);
  }
  return target.slice(0, target.length - "-apple-darwin".length);
}

function copyArtifactsForTarget({ artifactName, outDir, product, target }) {
  const arch = archFromTarget(target);
  const bundleDir = bundleDirForTarget(target);
  const macosDir = resolve(bundleDir, "macos");
  const sourceTar = resolve(macosDir, `${product}.app.tar.gz`);
  const sourceSig = resolve(macosDir, `${product}.app.tar.gz.sig`);
  const destTar = resolve(outDir, `${artifactName}_${arch}.app.tar.gz`);
  const destSig = resolve(outDir, `${artifactName}_${arch}.app.tar.gz.sig`);
  copyFileRequired(sourceTar, destTar);
  copyFileRequired(sourceSig, destSig);
  const sigExtras = readdirSync(macosDir)
    .filter((name) => name.startsWith(`${product}.app.tar.gz.sig.`))
    .map((name) => resolve(macosDir, name));
  for (const source of sigExtras) {
    copyFileRequired(source, resolve(outDir, `${artifactName}_${arch}.app.tar.gz.sig.${basename(source).split(".").pop()}`));
  }
  copyFileRequired(singleDmg(bundleDir, product), resolve(outDir, `${artifactName}_${arch}.dmg`));
}

function copyFileRequired(source, destination) {
  if (!existsSync(source)) throw new Error(`Missing release artifact: ${source}`);
  copyFileSync(source, destination);
}

function artifactUrl(baseUrl, fileName) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURI(fileName)}`;
}

function deriveArtifactBaseUrl(endpoints) {
  const explicit = process.env.HICODEX_RELEASE_ARTIFACT_BASE_URL?.trim();
  if (explicit) return explicit;
  const first = endpoints[0];
  if (!first) throw new Error("Release config does not contain updater endpoints.");
  const url = new URL(first);
  const pathname = decodeURIComponent(url.pathname);
  const templateIndex = pathname.indexOf("/{{");
  if (templateIndex >= 0) {
    url.pathname = pathname.slice(0, templateIndex) || "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }
  if (pathname.endsWith("/latest.json")) {
    url.pathname = pathname.slice(0, -"/latest.json".length) || "/";
  } else {
    url.pathname = pathname.replace(/\/[^/]*$/, "") || "/";
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function metadataDestinations(endpoints) {
  return endpoints.map((endpoint) => {
    if (endpoint.includes("{{")) {
      return `${endpoint}    (serve latest.json at this templated updater route)`;
    }
    return endpoint;
  });
}

export function buildUpdateMetadata({ artifactName, configPath, outDir, product, skipCopy, targets, version }) {
  const releaseConfig = readJson(configPath);
  const endpoints = releaseConfig.plugins?.updater?.endpoints ?? [];
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error("Release config does not contain plugins.updater.endpoints.");
  }
  const artifactBaseUrl = deriveArtifactBaseUrl(endpoints);
  mkdirSync(outDir, { recursive: true });
  const platforms = {};
  const uploads = [];

  for (const target of targets) {
    const arch = archFromTarget(target);
    const filePrefix = `${artifactName}_${version}_${arch}`;
    if (!skipCopy) {
      copyArtifactsForTarget({
        artifactName: `${artifactName}_${version}`,
        outDir,
        product,
        target,
      });
    }
    const tarName = `${filePrefix}.app.tar.gz`;
    const sigPath = resolve(outDir, `${tarName}.sig`);
    if (!existsSync(sigPath)) throw new Error(`Missing updater signature: ${sigPath}`);
    platforms[`darwin-${arch}`] = {
      signature: readFileSync(sigPath, "utf8").replace(/\s+/g, ""),
      url: artifactUrl(artifactBaseUrl, tarName),
    };
    uploads.push(`${resolve(outDir, tarName)} -> ${artifactUrl(artifactBaseUrl, tarName)}`);
  }

  const notes = process.env.HICODEX_RELEASE_NOTES || process.env.NOTES_RAW || "";
  const metadata = {
    version,
    notes,
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms,
  };
  const latestPath = resolve(outDir, "latest.json");
  writeFileSync(latestPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const destinationLines = [
    "Artifact uploads:",
    ...uploads,
    "",
    "Updater metadata uploads:",
    ...metadataDestinations(endpoints).map((destination) => `${latestPath} -> ${destination}`),
  ];
  writeFileSync(resolve(outDir, "upload-destinations.txt"), `${destinationLines.join("\n")}\n`);
  return { latestPath, metadata, uploadDestinations: destinationLines };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = buildUpdateMetadata({
      artifactName: args.artifactName,
      configPath: args.config,
      outDir: args.outDir,
      product: args.product,
      skipCopy: args.skipCopy,
      targets: args.targets,
      version: args.version,
    });
    console.log(`Wrote Tauri updater metadata: ${result.latestPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
