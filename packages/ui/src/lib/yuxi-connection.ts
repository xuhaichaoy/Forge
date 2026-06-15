import { FORGE_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/forge-desktop-namespace";
import { setDesktopAppSettingValue } from "./app-settings";

export const DEFAULT_YUXI_BASE_URL = "http://127.0.0.1:5050";
export const YUXI_CONNECTION_STORAGE_KEY = FORGE_DESKTOP_CONFIG_KEYS.yuxiConnection;

export interface YuxiConnectionConfig {
  baseUrl: string;
  token: string;
}

export function readYuxiConnectionConfig(
  storage: Pick<Storage, "getItem"> | null | undefined = browserStorage(),
): YuxiConnectionConfig {
  const raw = readMigratedStorageValue(storage, YUXI_CONNECTION_STORAGE_KEY);
  if (!raw) return { baseUrl: DEFAULT_YUXI_BASE_URL, token: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<YuxiConnectionConfig>;
    return {
      baseUrl: normalizeYuxiBaseUrl(parsed.baseUrl),
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return { baseUrl: DEFAULT_YUXI_BASE_URL, token: "" };
  }
}

export function writeYuxiConnectionConfig(
  config: YuxiConnectionConfig,
  storage: Pick<Storage, "setItem"> | null | undefined = browserStorage(),
): void {
  if (!storage) return;
  setDesktopAppSettingValue(storage, YUXI_CONNECTION_STORAGE_KEY, JSON.stringify({
    baseUrl: normalizeYuxiBaseUrl(config.baseUrl),
    token: config.token.trim(),
  }));
}

export function normalizeYuxiBaseUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim() || DEFAULT_YUXI_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
