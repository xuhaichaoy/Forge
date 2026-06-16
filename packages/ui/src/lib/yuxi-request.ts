import { normalizeYuxiBaseUrl, readYuxiConnectionConfig } from "./yuxi-connection";
import { notifyTeamServiceUnauthorized } from "./team-service-session";

export class YuxiApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "YuxiApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function yuxiRequest<T>(
  path: string,
  init: RequestInit = {},
  responseType: "json" | "blob" = "json",
): Promise<T> {
  const config = readYuxiConnectionConfig();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = config.token.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${normalizeYuxiBaseUrl(config.baseUrl)}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    // 401 = the shared login token is dead. Tell the auth gate to drop the
    // session app-wide instead of leaving the user staring at "未认证" errors
    // until they restart. (403 = a valid session hitting a forbidden resource,
    // not an expiry — must NOT log out.)
    if (response.status === 401) notifyTeamServiceUnauthorized();
    throw new YuxiApiError(yuxiErrorMessage(response.status, detail), response.status, detail);
  }
  if (responseType === "blob") return await response.blob() as T;
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

async function readErrorDetail(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) return await response.json();
    return await response.text();
  } catch {
    return null;
  }
}

function yuxiErrorMessage(status: number, detail: unknown): string {
  const detailText = detailMessage(detail);
  if (status === 401) return detailText || "系统未认证，请配置访问令牌";
  if (status === 403) return detailText || "当前账号没有权限访问 Yuxi 资料库";
  return detailText || `Yuxi 请求失败 (${status})`;
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const raw = record.detail ?? record.message;
    if (typeof raw === "string") return raw;
  }
  return "";
}
