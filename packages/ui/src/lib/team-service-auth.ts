import { FORGE_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/forge-desktop-namespace";
import { formatMessage, type I18nMessageDescriptor, type I18nValues } from "../state/i18n";
import { scheduleAppSettingsPersist } from "./app-settings";
import {
  DEFAULT_YUXI_BASE_URL,
  normalizeYuxiBaseUrl,
  readYuxiConnectionConfig,
  writeYuxiConnectionConfig,
} from "./yuxi-client";

export const DEFAULT_TEAM_SERVICE_BASE_URL = DEFAULT_YUXI_BASE_URL;
export const TEAM_SERVICE_AUTH_STORAGE_KEY = FORGE_DESKTOP_CONFIG_KEYS.teamServiceAuth;

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

/*
 * Localizable auth copy. Descriptors live here; rendering happens in the
 * consumer — team-service-auth-gate.tsx formats via its useForgeIntl hook —
 * with the module-level formatMessage singleton as the non-React fallback.
 */
const TEAM_SERVICE_AUTH_COPY = {
  invalidSession: {
    id: "hc.teamAuth.error.invalidSession",
    defaultMessage: "Your sign-in credentials are invalid. Please sign in again.",
  },
  loginMissingCredentials: {
    id: "hc.teamAuth.error.loginMissingCredentials",
    defaultMessage: "Enter your username and password.",
  },
  registerMissingCredentials: {
    id: "hc.teamAuth.error.registerMissingCredentials",
    defaultMessage: "Enter a username and password.",
  },
  invalidCredentials: {
    id: "hc.teamAuth.error.invalidCredentials",
    defaultMessage: "Incorrect username or password.",
  },
  forbidden: {
    id: "hc.teamAuth.error.forbidden",
    defaultMessage: "This account doesn't have permission to use this service.",
  },
  accountExists: {
    id: "hc.teamAuth.error.accountExists",
    defaultMessage: "This account already exists.",
  },
  requestFailed: {
    id: "hc.teamAuth.error.requestFailed",
    defaultMessage: "Authentication request failed ({status})",
  },
  missingAccessToken: {
    id: "hc.teamAuth.error.missingAccessToken",
    defaultMessage: "Signed in, but the server didn't return an access token. Check the server's auth endpoint.",
  },
  signInFailed: {
    id: "hc.teamAuth.error.signInFailed",
    defaultMessage: "Sign-in failed. Please try again later.",
  },
} satisfies Record<string, I18nMessageDescriptor>;

export class TeamServiceAuthError extends Error {
  readonly status: number | null;
  readonly detail: unknown;
  /** Localizable UI copy; null when `message` carries server-provided text. */
  readonly descriptor: I18nMessageDescriptor | null;
  readonly values: I18nValues | undefined;

  constructor(
    copy: I18nMessageDescriptor | string,
    status: number | null = null,
    detail: unknown = null,
    values?: I18nValues,
  ) {
    // `message` stays a plain localized string (Error contract, logging); UI
    // consumers re-format from `descriptor` with their own formatter instance.
    super(typeof copy === "string" ? copy : formatMessage(copy, values));
    this.name = "TeamServiceAuthError";
    this.status = status;
    this.detail = detail;
    this.descriptor = typeof copy === "string" ? null : copy;
    this.values = values;
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
    throw new TeamServiceAuthError(TEAM_SERVICE_AUTH_COPY.invalidSession);
  }
  if (storage) {
    storage.setItem(TEAM_SERVICE_AUTH_STORAGE_KEY, JSON.stringify(normalized));
    writeYuxiConnectionConfig({
      baseUrl: normalized.baseUrl,
      token: normalized.token,
    }, storage);
    // Mirror to disk immediately — the login session must survive a webview
    // storage reset (app rebrand/reinstall).
    scheduleAppSettingsPersist();
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
  scheduleAppSettingsPersist();
}

export async function loginTeamService(payload: TeamServiceLoginPayload): Promise<TeamServiceAuthSession> {
  const baseUrl = normalizeTeamServiceBaseUrl(payload.baseUrl);
  const username = payload.loginId.trim();
  if (!username || !payload.password) {
    throw new TeamServiceAuthError(TEAM_SERVICE_AUTH_COPY.loginMissingCredentials);
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
    const { copy, values } = authErrorCopy(response.status, detail);
    throw new TeamServiceAuthError(copy, response.status, detail, values);
  }
  return saveTeamServiceAuthSession(sessionFromAuthResponse(baseUrl, detail));
}

export async function registerTeamService(payload: TeamServiceRegisterPayload): Promise<TeamServiceAuthSession> {
  const baseUrl = normalizeTeamServiceBaseUrl(payload.baseUrl);
  const username = payload.username.trim();
  if (!username || !payload.password) {
    throw new TeamServiceAuthError(TEAM_SERVICE_AUTH_COPY.registerMissingCredentials);
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
    const { copy, values } = authErrorCopy(response.status, detail);
    throw new TeamServiceAuthError(copy, response.status, detail, values);
  }
  return saveTeamServiceAuthSession(sessionFromAuthResponse(baseUrl, detail));
}

export async function refreshTeamServiceUser(session: TeamServiceAuthSession): Promise<TeamServiceAuthSession> {
  const normalized = normalizeTeamServiceAuthSession(session);
  if (!normalized) {
    throw new TeamServiceAuthError(TEAM_SERVICE_AUTH_COPY.invalidSession);
  }
  const response = await fetch(`${normalized.baseUrl}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${normalized.token}`,
    },
  });
  const detail = await readResponseBody(response);
  if (!response.ok) {
    const { copy, values } = authErrorCopy(response.status, detail);
    throw new TeamServiceAuthError(copy, response.status, detail, values);
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

type FormatTeamServiceAuthMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

/*
 * Resolve user-facing copy for an auth failure. Components pass their
 * useForgeIntl formatMessage so descriptors render through the hook; the
 * default falls back to the module-level i18n singleton (non-React callers,
 * and the gate's mount-only session check that deliberately avoids capturing
 * the hook formatter — see team-service-auth-gate.tsx).
 */
export function teamServiceAuthErrorMessage(
  error: unknown,
  format: FormatTeamServiceAuthMessage = formatMessage,
): string {
  if (error instanceof TeamServiceAuthError && error.descriptor) {
    return format(error.descriptor, error.values);
  }
  if (error instanceof Error) return error.message;
  return format(TEAM_SERVICE_AUTH_COPY.signInFailed);
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
    throw new TeamServiceAuthError(TEAM_SERVICE_AUTH_COPY.missingAccessToken);
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

interface TeamServiceAuthErrorCopy {
  /** Descriptor for static copy, or the raw server-provided detail string. */
  copy: I18nMessageDescriptor | string;
  values?: I18nValues;
}

function authErrorCopy(status: number, detail: unknown): TeamServiceAuthErrorCopy {
  const detailText = detailMessage(detail);
  if (detailText) return { copy: detailText };
  if (status === 401) return { copy: TEAM_SERVICE_AUTH_COPY.invalidCredentials };
  if (status === 403) return { copy: TEAM_SERVICE_AUTH_COPY.forbidden };
  if (status === 409) return { copy: TEAM_SERVICE_AUTH_COPY.accountExists };
  return { copy: TEAM_SERVICE_AUTH_COPY.requestFailed, values: { status } };
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
