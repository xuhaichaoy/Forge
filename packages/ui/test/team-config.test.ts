import { SEED_TEAMS } from "../src/state/team-config";

export default function runTeamConfigTests(): void {
  keepsDefaultLocalTeamSchemaStable();
  keepsDefaultActiveTeamSafe();
  avoidsUserSpecificTeamSeedData();
}

function keepsDefaultLocalTeamSchemaStable(): void {
  assertEqual(SEED_TEAMS.length, 1, "SEED_TEAMS should contain one bootstrap team");

  const localTeam = SEED_TEAMS[0];
  assertNotNull(localTeam, "local bootstrap team should exist");
  assertDeepEqual(
    Object.keys(localTeam).sort(),
    ["active", "id", "name", "plan", "role"].sort(),
    "local bootstrap team schema should stay stable",
  );
  assertEqual(localTeam.id, "local", "local bootstrap team id");
  assertEqual(localTeam.name, "Local workspace", "local bootstrap team name");
  assertEqual(localTeam.role, "owner", "local bootstrap team role");
  assertEqual(localTeam.plan, "trial", "local bootstrap team plan");
  assertEqual(localTeam.active, true, "local bootstrap team active flag");
}

function keepsDefaultActiveTeamSafe(): void {
  const activeTeams = SEED_TEAMS.filter((team) => team.active);

  assertEqual(activeTeams.length, 1, "exactly one bootstrap team should be active");
  assertEqual(activeTeams[0]?.id, "local", "active bootstrap team should fall back to local");
}

function avoidsUserSpecificTeamSeedData(): void {
  const serialized = JSON.stringify(SEED_TEAMS);

  assert(!serialized.includes("/Users/"), "team seed should not include a macOS user path");
  assert(!serialized.includes("\\"), "team seed should not include a Windows user path");
  assert(!serialized.includes("@"), "team seed should not include a real account identifier");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
