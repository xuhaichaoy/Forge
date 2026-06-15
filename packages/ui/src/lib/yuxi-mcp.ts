import { yuxiRequest } from "./yuxi-request";
import type {
  YuxiMcpServerPayload,
  YuxiMcpServersResponse,
  YuxiMcpServerTestResponse,
  YuxiMcpServerStatusResponse,
  YuxiMcpToolsResponse,
} from "./yuxi-types";

export async function listYuxiMcpServers(): Promise<YuxiMcpServersResponse> {
  return yuxiRequest<YuxiMcpServersResponse>("/api/system/mcp-servers");
}

export async function createYuxiMcpServer(payload: YuxiMcpServerPayload): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>("/api/system/mcp-servers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateYuxiMcpServer(name: string, payload: YuxiMcpServerPayload): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteYuxiMcpServer(name: string): Promise<Record<string, unknown>> {
  return yuxiRequest<Record<string, unknown>>(`/api/system/mcp-servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function testYuxiMcpServer(name: string): Promise<YuxiMcpServerTestResponse> {
  return yuxiRequest<YuxiMcpServerTestResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function setYuxiMcpServerStatus(
  name: string,
  enabled: boolean,
): Promise<YuxiMcpServerStatusResponse> {
  return yuxiRequest<YuxiMcpServerStatusResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/status`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function listYuxiMcpTools(name: string): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/tools`);
}

export async function refreshYuxiMcpTools(name: string): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(`/api/system/mcp-servers/${encodeURIComponent(name)}/tools/refresh`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function toggleYuxiMcpTool(
  name: string,
  toolName: string,
): Promise<YuxiMcpToolsResponse> {
  return yuxiRequest<YuxiMcpToolsResponse>(
    `/api/system/mcp-servers/${encodeURIComponent(name)}/tools/${encodeURIComponent(toolName)}/toggle`,
    {
      method: "PUT",
      body: JSON.stringify({}),
    },
  );
}
