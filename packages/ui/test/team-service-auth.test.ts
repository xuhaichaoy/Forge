import {
  DEFAULT_TEAM_SERVICE_BASE_URL,
  TEAM_SERVICE_AUTH_STORAGE_KEY,
  clearTeamServiceAuthSession,
  normalizeTeamServiceUser,
  readTeamServiceAuthSession,
  saveTeamServiceAuthSession,
} from "../src/lib/team-service-auth";
import { readTeamServiceConnectionConfig } from "../src/lib/team-service-connection";
import {
  readYuxiConnectionConfig,
  writeYuxiConnectionConfig,
} from "../src/lib/yuxi-client";

export default function runTeamServiceAuthTests(): void {
  usesLanTeamServiceAddressByDefault();
  normalizesBackendAuthUserShape();
  persistsTeamServiceSessionAndSyncsLegacyConnection();
  teamConnectionPrefersProductAuthSession();
  clearSessionRemovesProductToken();
}

function usesLanTeamServiceAddressByDefault(): void {
  const storage = new MemoryStorage();
  assertEqual(DEFAULT_TEAM_SERVICE_BASE_URL, "http://192.168.61.214:5050", "team auth should default to the shared Yuxi service");
  assertEqual(readYuxiConnectionConfig(storage).baseUrl, DEFAULT_TEAM_SERVICE_BASE_URL, "empty legacy connection should use the same default service");
}

function normalizesBackendAuthUserShape(): void {
  const user = normalizeTeamServiceUser({
    user_id: 42,
    username: "haichao",
    uid: "xuhaichao",
    phone_number: "13800000000",
    role: "team_admin",
    department_id: "7",
    department_name: "售前组",
    capabilities: ["team:create", "team:manage", 123],
  });
  assert(user, "user should be parsed");
  assertEqual(user.id, 42, "user_id should map to id");
  assertEqual(user.username, "haichao", "username should be preserved");
  assertEqual(user.uid, "xuhaichao", "uid should be preserved");
  assertEqual(user.departmentId, 7, "department_id string should parse as number");
  assertDeepEqual(user.capabilities, ["team:create", "team:manage"], "capabilities should keep string entries only");
}

function persistsTeamServiceSessionAndSyncsLegacyConnection(): void {
  const storage = new MemoryStorage();
  const saved = saveTeamServiceAuthSession({
    baseUrl: " http://127.0.0.1:5050/// ",
    token: " product-token ",
    user: {
      id: 1,
      username: "owner",
      uid: null,
      phoneNumber: null,
      avatar: null,
      role: "user",
      departmentId: null,
      departmentName: null,
      capabilities: [],
    },
  }, storage);

  assertEqual(saved.baseUrl, "http://127.0.0.1:5050", "base url should be normalized before storage");
  assertEqual(saved.token, "product-token", "token should be trimmed before storage");
  assert(storage.getItem(TEAM_SERVICE_AUTH_STORAGE_KEY), "auth session should be stored");
  assertEqual(readTeamServiceAuthSession(storage)?.token, "product-token", "auth session should be readable");
  assertEqual(readYuxiConnectionConfig(storage).token, "product-token", "legacy knowledge connection should receive product token");
}

function teamConnectionPrefersProductAuthSession(): void {
  const storage = new MemoryStorage();
  writeYuxiConnectionConfig({ baseUrl: "http://legacy.example.test", token: "legacy-token" }, storage);
  saveTeamServiceAuthSession({
    baseUrl: "https://team.example.test/",
    token: "team-token",
    user: null,
  }, storage);

  assertDeepEqual(
    readTeamServiceConnectionConfig(storage),
    { baseUrl: "https://team.example.test", token: "team-token" },
    "team service connection should prefer product auth over old manual connection",
  );
}

function clearSessionRemovesProductToken(): void {
  const storage = new MemoryStorage();
  saveTeamServiceAuthSession({
    baseUrl: "http://127.0.0.1:5050",
    token: "product-token",
    user: null,
  }, storage);

  clearTeamServiceAuthSession(storage);

  assertEqual(storage.getItem(TEAM_SERVICE_AUTH_STORAGE_KEY), null, "auth session should be removed");
  assertEqual(readTeamServiceAuthSession(storage), null, "auth session should not fall back after token clear");
  assertDeepEqual(
    readYuxiConnectionConfig(storage),
    { baseUrl: "http://127.0.0.1:5050", token: "" },
    "legacy connection should keep base url but clear token",
  );
}

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
