export interface ForgeBuildInfo {
  version: string;
  mode: string;
  channel: string;
  flavor: string;
  buildId: string;
}

const DEFAULT_VERSION = "0.1.0";

export function resolveForgeBuildInfo(env: Record<string, unknown> | undefined): ForgeBuildInfo {
  const mode = stringEnv(env, "MODE") || (booleanEnv(env, "DEV") ? "development" : "production");
  // FORGE_* is the primary name; VITE_HICODEX_* stays accepted as a legacy
  // alias for existing build setups.
  return {
    version: stringEnv(env, "VITE_FORGE_VERSION") || stringEnv(env, "VITE_HICODEX_VERSION") || DEFAULT_VERSION,
    mode,
    channel: stringEnv(env, "VITE_FORGE_BUILD_CHANNEL") || stringEnv(env, "VITE_HICODEX_BUILD_CHANNEL") || (mode === "production" ? "local" : "dev"),
    flavor: stringEnv(env, "VITE_FORGE_BUILD_FLAVOR") || stringEnv(env, "VITE_HICODEX_BUILD_FLAVOR") || (mode === "production" ? "release-candidate" : "dev"),
    buildId: stringEnv(env, "VITE_FORGE_BUILD_ID") || stringEnv(env, "VITE_HICODEX_BUILD_ID") || "local",
  };
}

export function buildInfoDetails(info: ForgeBuildInfo): string[] {
  return [
    `version: ${info.version}`,
    `mode: ${info.mode}`,
    `channel: ${info.channel}`,
    `flavor: ${info.flavor}`,
    `build_id: ${info.buildId}`,
  ];
}

function stringEnv(env: Record<string, unknown> | undefined, key: string): string {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function booleanEnv(env: Record<string, unknown> | undefined, key: string): boolean {
  return env?.[key] === true;
}
