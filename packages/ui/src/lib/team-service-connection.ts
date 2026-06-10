import {
  normalizeYuxiBaseUrl,
  readYuxiConnectionConfig,
} from "./yuxi-client";
import { readTeamServiceAuthSession } from "./team-service-auth";

export interface TeamServiceConnectionConfig {
  baseUrl: string;
  token: string;
}

export function readTeamServiceConnectionConfig(
  storage?: Pick<Storage, "getItem"> | null,
): TeamServiceConnectionConfig {
  const auth = readTeamServiceAuthSession(storage);
  if (auth?.token) {
    return {
      baseUrl: auth.baseUrl,
      token: auth.token,
    };
  }
  const config = readYuxiConnectionConfig(storage);
  return {
    baseUrl: config.baseUrl,
    token: config.token,
  };
}

export function normalizeTeamServiceBaseUrl(value: string | null | undefined): string {
  return normalizeYuxiBaseUrl(value);
}
