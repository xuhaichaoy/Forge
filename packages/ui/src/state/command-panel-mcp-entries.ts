/*
 * MCP entry projection: server/tool/resource/template entries plus
 * tool-call and resource-read result entries. Moved verbatim out of
 * state/command-panel.ts.
 */
import { formatUnknown } from "../lib/format";
import {
  mcpToolRequiredArguments,
  projectMcpToolArgumentFields,
} from "./mcp-tool-arguments";
import { mcpAppResourceUriFromMeta } from "./thread-item-fields";
import {
  cleanSecondaryActions,
  numberField,
  recordField,
} from "./command-panel-value-utils";
import {
  arrayField,
  cleanList,
  fieldText,
  isRecord,
  responseItems,
  textDetails,
} from "./command-panel-entry-fields";
import type { CommandPanelEntry } from "./command-panel-types";

export function projectMcpServerEntries(value: unknown): CommandPanelEntry[] {
  return responseItems(value).flatMap((server, index) => {
    const name = fieldText(server, "name") || `server-${index + 1}`;
    const tools = recordField(server, "tools");
    const resources = arrayField(server, "resources");
    const templates = arrayField(server, "resourceTemplates");
    const toolDetails = Object.entries(tools)
      .map(([toolName, tool]) => {
        const description = fieldText(tool, "description");
        return description ? `${toolName} - ${description}` : toolName;
      });
    const resourceDetails = resources.map((resource) => {
      const title = fieldText(resource, "title") || fieldText(resource, "name") || fieldText(resource, "uri");
      const uri = fieldText(resource, "uri");
      return title && uri && title !== uri ? `${title} - ${uri}` : title || uri;
    }).filter(Boolean);
    const templateDetails = templates.map((template) => {
      const title = fieldText(template, "title") || fieldText(template, "name") || fieldText(template, "uriTemplate");
      const uriTemplate = fieldText(template, "uriTemplate");
      return title && uriTemplate && title !== uriTemplate ? `${title} - ${uriTemplate}` : title || uriTemplate;
    }).filter(Boolean);

    const authStatus = mcpAuthStatus(server);
    const serverEntry: CommandPanelEntry = {
      id: `mcp:${name}`,
      title: name,
      kind: "mcpServer",
      status: authStatus,
      meta: mcpServerMeta(toolDetails.length, resourceDetails.length, templateDetails.length),
      details: [
        ...toolDetails,
        ...resourceDetails.map((detail) => `Resource: ${detail}`),
        ...templateDetails.map((detail) => `Template: ${detail}`),
      ],
      secondaryActions: cleanSecondaryActions([
        mcpAuthStatusNeedsLogin(authStatus) ? {
          id: `mcp:${name}:login`,
          label: "Authenticate",
          title: `Authenticate ${name}`,
          tone: "success",
          action: { type: "loginMcpServer", server: name, title: `Authenticate ${name}` },
        } : undefined,
        {
          id: `mcp:${name}:reload`,
          label: "Reload",
          title: "Reload MCP config",
          action: { type: "reloadMcpServers", title: "Reload MCP config" },
        },
      ]),
    };
    return [
      serverEntry,
      ...Object.entries(tools).map(([toolName, tool]) => mcpToolEntry(name, toolName, tool)),
      ...resources.map((resource, resourceIndex) => mcpResourceEntry(name, resource, resourceIndex)),
      ...templates.map((template, templateIndex) => mcpResourceTemplateEntry(name, template, templateIndex)),
    ];
  });
}

export function projectMcpToolCallResultEntries(
  server: string,
  tool: string,
  value: unknown,
): CommandPanelEntry[] {
  const record = isRecord(value) ? value : {};
  const content = Array.isArray(record.content) ? record.content : [];
  const structuredContent = record.structuredContent ?? record.structured_content;
  const isError = record.isError === true || record.is_error === true;
  const resourceUri = mcpAppResourceUriFromMeta(record._meta);
  const entries: CommandPanelEntry[] = content.map((item, index) => ({
    id: `mcp-result:${server}:${tool}:content:${index}`,
    title: mcpResultTitle(item, index),
    kind: "status" as const,
    status: isError ? "error" : "completed",
    meta: `${server}:${tool}`,
    details: textDetails(mcpResultText(item)),
  }));

  if (structuredContent !== undefined && structuredContent !== null) {
    entries.push({
      id: `mcp-result:${server}:${tool}:structured`,
      title: "Structured content",
      kind: "status",
      status: isError ? "error" : "completed",
      meta: `${server}:${tool}`,
      details: textDetails(formatUnknown(structuredContent)),
    });
  }

  if (resourceUri) {
    entries.push({
      id: `mcp-result:${server}:${tool}:mcp-app-resource`,
      title: "MCP app resource",
      kind: "mcpResource",
      status: isError ? "error" : "resource",
      meta: `${server} · ${resourceUri}`,
      details: [
        "Tool result advertises an MCP app resource.",
        "Click to read the resource content.",
      ],
      action: { type: "readMcpResource", server, uri: resourceUri, title: "MCP app resource" },
    });
  }

  if (entries.length > 0) return entries;
  return [{
    id: `mcp-result:${server}:${tool}:empty`,
    title: isError ? "Tool returned an error" : "Tool completed",
    kind: "status",
    status: isError ? "error" : "completed",
    meta: `${server}:${tool}`,
    details: textDetails(formatUnknown(value)),
  }];
}

export function projectMcpResourceReadResultEntries(
  server: string,
  uri: string,
  value: unknown,
): CommandPanelEntry[] {
  const contents = arrayField(value, "contents");
  if (contents.length === 0) {
    return [{
      id: `mcp-resource-result:${server}:${uri}:empty`,
      title: "Resource returned no content",
      kind: "status",
      status: "empty",
      meta: `${server} · ${uri}`,
      details: textDetails(formatUnknown(value)),
    }];
  }
  return contents.map((content, index) => ({
    id: `mcp-resource-result:${server}:${uri}:${index}`,
    title: mcpResourceContentTitle(content, index),
    kind: "status" as const,
    status: "read",
    meta: cleanList([server, fieldText(content, "mimeType") || fieldText(content, "mime_type")]).join(" · "),
    details: mcpResourceContentDetails(content),
  }));
}

function mcpToolEntry(serverName: string, toolName: string, tool: unknown): CommandPanelEntry {
  const title = fieldText(tool, "title") || toolName;
  const description = fieldText(tool, "description");
  const fields = projectMcpToolArgumentFields(tool);
  const required = mcpToolRequiredArguments(tool);
  const optional = fields.filter((field) => !field.required).map((field) => field.name);
  const canCallWithoutArguments = fields.length === 0;
  return {
    id: `mcp-tool:${serverName}:${toolName}`,
    title,
    kind: "mcpTool",
    status: canCallWithoutArguments ? "callable" : required.length > 0 ? "needs input" : "configure",
    meta: `${serverName}:${toolName}`,
    details: cleanList([
      description,
      required.length > 0 ? `Required: ${required.join(", ")}` : undefined,
      optional.length > 0 ? `Optional: ${optional.join(", ")}` : undefined,
      canCallWithoutArguments ? "Click to call with empty arguments." : "Click to enter arguments.",
    ]),
    action: canCallWithoutArguments
      ? { type: "callMcpTool", server: serverName, tool: toolName, arguments: {} }
      : { type: "openMcpToolForm", server: serverName, tool: toolName, title, description, fields },
  };
}

function mcpResourceEntry(serverName: string, resource: Record<string, unknown>, index: number): CommandPanelEntry {
  const uri = fieldText(resource, "uri");
  const title = fieldText(resource, "title") || fieldText(resource, "name") || uri || `resource-${index + 1}`;
  const mime = fieldText(resource, "mimeType") || fieldText(resource, "mime_type");
  return {
    id: `mcp-resource:${serverName}:${uri || index}`,
    title,
    kind: "mcpResource",
    status: "resource",
    meta: cleanList([serverName, mime]).join(" · ") || undefined,
    details: cleanList([
      fieldText(resource, "description"),
      uri && `URI: ${uri}`,
      numberField(resource, "size") !== null && `Size: ${numberField(resource, "size")} bytes`,
    ]),
    disabled: uri ? undefined : true,
    action: uri ? { type: "readMcpResource", server: serverName, uri, title } : undefined,
  };
}

function mcpResourceTemplateEntry(
  serverName: string,
  template: Record<string, unknown>,
  index: number,
): CommandPanelEntry {
  const uriTemplate = fieldText(template, "uriTemplate") || fieldText(template, "uri_template");
  const title = fieldText(template, "title") || fieldText(template, "name") || uriTemplate || `template-${index + 1}`;
  const mime = fieldText(template, "mimeType") || fieldText(template, "mime_type");
  return {
    id: `mcp-resource-template:${serverName}:${uriTemplate || index}`,
    title,
    kind: "mcpResourceTemplate",
    status: "template",
    meta: cleanList([serverName, mime]).join(" · ") || undefined,
    details: cleanList([
      fieldText(template, "description"),
      uriTemplate && `Template: ${uriTemplate}`,
    ]),
    disabled: true,
  };
}

function mcpResultTitle(value: unknown, index: number): string {
  if (!isRecord(value)) return `Result ${index + 1}`;
  const type = fieldText(value, "type");
  if (type === "text") return `Text result ${index + 1}`;
  if (type === "image") return `Image result ${index + 1}`;
  if (type === "resource") return `Resource result ${index + 1}`;
  return `Result ${index + 1}`;
}

function mcpResultText(value: unknown): string {
  if (!isRecord(value)) return formatUnknown(value);
  const text = fieldText(value, "text");
  if (text) return text;
  const data = fieldText(value, "data");
  if (data) return data;
  const uri = fieldText(value, "uri");
  if (uri) return uri;
  return formatUnknown(value);
}

function mcpResourceContentTitle(value: Record<string, unknown>, index: number): string {
  const uri = fieldText(value, "uri");
  if (uri) return `Resource content ${index + 1}`;
  return `Content ${index + 1}`;
}

function mcpResourceContentDetails(value: Record<string, unknown>): string[] {
  const uri = fieldText(value, "uri");
  const mime = fieldText(value, "mimeType") || fieldText(value, "mime_type");
  const text = fieldText(value, "text");
  const blob = fieldText(value, "blob");
  return cleanList([
    uri && `URI: ${uri}`,
    mime && `MIME: ${mime}`,
    blob && `Blob: ${blob.length} base64 characters`,
    ...textDetails(text || (!blob ? formatUnknown(value) : "")),
  ]);
}

function mcpAuthStatus(server: Record<string, unknown>): string {
  const authStatus = fieldText(server, "authStatus");
  if (authStatus) return authStatus;
  const auth = recordField(server, "auth");
  return fieldText(auth, "status") || fieldText(server, "authMode") || "unknown";
}

function mcpAuthStatusNeedsLogin(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "notloggedin"
    || normalized === "oauth"
    || normalized === "unauthenticated";
}

function countLabel(count: number, singular: string, empty: string): string {
  if (count === 0) return empty;
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function mcpServerMeta(toolCount: number, resourceCount: number, templateCount: number): string {
  const labels = cleanList([
    countLabel(toolCount, "tool", "No tools"),
    resourceCount > 0 && countLabel(resourceCount, "resource", ""),
    templateCount > 0 && countLabel(templateCount, "template", ""),
  ]);
  return labels.join(" · ");
}
