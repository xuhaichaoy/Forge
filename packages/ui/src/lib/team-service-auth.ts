import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/hicodex-desktop-namespace";
import {
  DEFAULT_YUXI_BASE_URL,
  normalizeYuxiBaseUrl,
  readYuxiConnectionConfig,
  writeYuxiConnectionConfig,
} from "./yuxi-client";

export const DEFAULT_TEAM_SERVICE_BASE_URL = DEFAULT_YUXI_BASE_URL;
export const TEAM_SERVICE_AUTH_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.teamServiceAuth;

export interface TeamServiceUser {
  id: number | string | null;
  username: string;
  uid: string | null;
  phoneNumber: string | null;
  avatar: string | null;
  role: string | null;
  departmentId: number | null;
  departmentName: string | null;
  capabilities: string[];
}

export interface TeamServiceAuthSession {
  baseUrl: string;
  token: string;
  user: TeamServiceUser | null;
}

export interface TeamServiceLoginPayload {
  baseUrl: string;
  loginId: string;
  password: string;
}

export interface TeamServiceRegisterPayload {
  baseUrl: string;
  username: string;
  password: string;
  uid?: string | null;
  phoneNumber?: string | null;
}

type TeamServiceAuthStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class TeamServiceAuthError extends Error {
  readonly status: number | null;
  readonly detail: unknown;

  constructor(message: string, status: number | null = null, detail: unknown = null) {
    super(message);
    this.name = "TeamServiceAuthError";
    this.status = status;
    this.detail = detail;
  }
}

export function readTeamServiceAuthSession(
  storage: Pick<Storage, "getItem"> | null | undefined = browserStorage(),
): TeamServiceAuthSession | null {
  const raw = readMigratedStorageValue(storage, TEAM_SERVICE_AUTH_STORAGE_KEY);
  const stored = normalizeTeamServiceAuthSessionFromJson(raw);
  if (stored) return stored;

  const legacy = readYuxiConnectionConfig(storage);
  const legacyToken = legacy.token.trim();
  if (!legacyToken) return null;
  return {
    baseUrl: normalizeTeamServiceBaseUrl(legacy.baseUrl),
    token: legacyToken,
    user: null,
  };
}

export function saveTeamServiceAuthSession(
  session: TeamServiceAuthSession,
  storage: Pick<Storage, "setItem"> | null | undefined = browserStorage(),
): TeamServiceAuthSession {
  const normalized = normalizeTeamServiceAuthSession(session);
  if (!normalized) {
    throw new TeamServiceAuthError("登录凭证无效，请重新登录");
  }
  if (storage) {
    storage.setItem(TEAM_SERVICE_AUTH_STORAGE_KEY, JSON.stringify(normalized));
    writeYuxiConnectionConfig({
      baseUrl: normalized.baseUrl,
      token: normalized.token,
    }, storage);
  }
  return normalized;
}

export function clearTeamServiceAuthSession(
  storage: TeamServiceAuthStorage | null | undefined = browserStorage(),
): void {
  if (!storage) return;
  const currentBaseUrl =
    readTeamServiceAuthSession(storage)?.baseUrl
    ?? readYuxiConnectionConfig(storage).baseUrl
    ?? DEFAULT_TEAM_SERVICE_BASE_URL;
  storage.removeItem(TEAM_SERVICE_AUTH_STORAGE_KEY);
  writeYuxiConnectionConfig({
    baseUrl: currentBaseUrl,
    token: "",
  }, storage);
}

export async function loginTeamService(payload: TeamServiceLoginPayload): Promise<TeamServiceAuthSession> {
  const baseUrl = normalizeTeamServiceBaseUrl(payload.baseUrl);
  const username = payload.loginId.trim();
  if (!username || !payload.password) {
    throw new TeamServiceAuthError("请输入账号和密码");
  }

  const body = new FormData();
  body.set("username", username);
  body.set("password", payload.password);

  const response = await fetch(`${baseUrl}/api/auth/token`, {
    method: "POST",
    body,
  });
  const detail = await readResponseBody(response);
  if (!response.ok) {
    throw new TeamServiceAuthError(authErrorMessage(response.status, detail), response.status, detail);
  }
  return saveTeamServiceAuthSession(sessionFromAuthResponse(baseUrl, detail));
}

export async function registerTeamService(payload: TeamServiceRegisterPayload): Promise<TeamServiceAuthSession> {
  const baseUrl = normalizeTeamServiceBaseUrl(payload.baseUrl);
  const username = payload.username.trim();
  if (!username || !payload.password) {
    throw new TeamServiceAuthError("请输入用户名和密码");
  }

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password: payload.password,
      uid: trimmedOrUndefined(payload.uid),
      phone_number: trimmedOrUndefined(payload.phoneNumber),
    }),
  });
  const detail = await readResponseBody(response);
  if (!response.ok) {
    throw new TeamServiceAuthError(authErrorMessage(response.status, detail), response.status, detail);
  }
  return saveTeamServiceAuthSession(sessionFromAuthResponse(baseUrl, detail));
}

export async function refreshTeamServiceUser(session: TeamServiceAuthSession): Promise<TeamServiceAuthSession> {
  const normalized = normalizeTeamServiceAuthSession(session);
  if (!normalized) {
    throw new TeamServiceAuthError("登录凭证无效，请重新登录");
  }
  const response = await fetch(`${normalized.baseUrl}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${normalized.token}`,
    },
  });
  const detail = await readResponseBody(response);
  if (!response.ok) {
    throw new TeamServiceAuthError(authErrorMessage(response.status, detail), response.status, detail);
  }
  return saveTeamServiceAuthSession({
    ...normalized,
    user: normalizeTeamServiceUser(detail) ?? normalized.user,
  });
}

export function normalizeTeamServiceBaseUrl(value: string | null | undefined): string {
  return normalizeYuxiBaseUrl(value);
}

export function normalizeTeamServiceAuthSession(value: unknown): TeamServiceAuthSession | null {
  const record = objectRecord(value);
  if (!record) return null;
  const token = stringValue(record.token) ?? stringValue(record.access_token);
  if (!token?.trim()) return null;
  return {
    baseUrl: normalizeTeamServiceBaseUrl(stringValue(record.baseUrl) ?? stringValue(record.base_url)),
    token: token.trim(),
    user: normalizeTeamServiceUser(record.user),
  };
}

export function normalizeTeamServiceUser(value: unknown): TeamServiceUser | null {
  const record = objectRecord(value);
  if (!record) return null;
  const source = objectRecord(record.user) ?? record;
  const username =
    stringValue(source.username)
    ?? stringValue(source.name)
    ?? stringValue(source.login_id);
  if (!username) return null;
  return {
    id: numberOrStringValue(source.id) ?? numberOrStringValue(source.user_id),
    username,
    uid: stringValue(source.uid),
    phoneNumber: stringValue(source.phone_number) ?? stringValue(source.phoneNumber),
    avatar: stringValue(source.avatar),
    role: stringValue(source.role),
    departmentId: numberValue(source.department_id) ?? numberValue(source.departmentId),
    departmentName: stringValue(source.department_name) ?? stringValue(source.departmentName),
    capabilities: stringArrayValue(source.capabilities),
  };
}

export function teamServiceAuthErrorMessage(error: unknown): string {
  if (error instanceof TeamServiceAuthError) return error.message;
  if (error instanceof Error) return error.message;
  return "登录失败，请稍后重试";
}

function normalizeTeamServiceAuthSessionFromJson(raw: string | null): TeamServiceAuthSession | null {
  if (!raw) return null;
  try {
    return normalizeTeamServiceAuthSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sessionFromAuthResponse(baseUrl: string, value: unknown): TeamServiceAuthSession {
  const record = objectRecord(value);
  const token = stringValue(record?.access_token) ?? stringValue(record?.token);
  if (!token?.trim()) {
    throw new TeamServiceAuthError("登录成功但没有返回访问凭证，请检查服务端认证接口");
  }
  return {
    baseUrl,
    token: token.trim(),
    user: normalizeTeamServiceUser(value),
  };
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

function authErrorMessage(status: number, detail: unknown): string {
  const detailText = detailMessage(detail);
  if (status === 401) return detailText || "账号或密码不正确";
  if (status === 403) return detailText || "当前账号没有权限使用此服务";
  if (status === 409) return detailText || "账号已存在";
  return detailText || `认证请求失败 (${status})`;
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  const record = objectRecord(detail);
  if (!record) return "";
  const raw = record.detail ?? record.message ?? record.error;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        const itemRecord = objectRecord(item);
        return stringValue(itemRecord?.msg) ?? stringValue(itemRecord?.message);
      })
      .filter(Boolean)
      .join("；");
  }
  return "";
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrStringValue(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return stringValue(value);
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function browserStorage(): TeamServiceAuthStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
