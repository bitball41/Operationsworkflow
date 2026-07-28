/**
 * Stateless MCP endpoint for the deployed operations Worker.
 *
 * This first slice deliberately exposes only two bounded, server-native tools:
 * integration status and Browser Run research. The in-app CRUD registry still
 * depends on browser state and will move behind authenticated Supabase server
 * operations in a later slice.
 */
import { browseToMarkdown } from "./browser.js";
import { demoHostingStatus } from "./demos.js";

const PROTOCOL_VERSION = "2025-11-25";

function rpc(id, result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function rpcError(id, code, message, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function tokenMatches(request, expected) {
  const actual = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!expected || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function tools(env) {
  return [
    {
      name: "operations_api_status",
      title: "Operations API status",
      description: "Report which server-side Operations integrations are configured without returning any secret values.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "browser_research",
      title: "Research a public web page",
      description: "Open a public HTTP(S) page in Cloudflare Browser Run and return readable markdown.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", format: "uri", description: "Public HTTP or HTTPS URL." } },
        required: ["url"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { configured: Boolean(env?.BROWSER) },
    },
  ];
}

function safeStatus(env) {
  const hosting = demoHostingStatus(env);
  return {
    worker: "operationsworkflow",
    providers: {
      anthropic: Boolean(env?.ANTHROPIC_API_KEY),
      openai: Boolean(env?.OPENAI_API_KEY),
      whop: Boolean(env?.WHOP_WEBHOOK_SECRET && env?.SUPABASE_SERVICE_ROLE_KEY && env?.WHOP_OWNER_USER_ID),
      google_maps: Boolean(env?.GOOGLE_MAPS_API_KEY),
      outlook: Boolean(
        env?.MICROSOFT_CLIENT_ID
        && env?.MICROSOFT_CLIENT_SECRET
        && env?.OUTLOOK_TOKEN_ENCRYPTION_KEY
        && env?.OUTLOOK_TOKENS,
      ),
      browser_research: Boolean(env?.BROWSER),
      demo_hosting: hosting.configured,
    },
    demo_domain: hosting.domain,
  };
}

function toolResult(data, summary) {
  return {
    content: [{ type: "text", text: summary || JSON.stringify(data) }],
    structuredContent: data,
    isError: false,
  };
}

export async function handleMcp(request, env) {
  if (!env?.MCP_API_TOKEN) {
    return rpcError(null, -32000, "MCP_API_TOKEN is not set on this Worker.", 503);
  }
  if (!tokenMatches(request, String(env.MCP_API_TOKEN))) {
    return new Response(JSON.stringify({ error: "unauthorized", message: "A valid MCP bearer token is required." }), {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "www-authenticate": 'Bearer realm="operations-mcp"',
      },
    });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }

  let message;
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id, -32600, "Invalid Request");
  }

  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (message.method === "ping") return rpc(message.id, {});
  if (message.method === "initialize") {
    return rpc(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "operationsworkflow", version: "0.1.0" },
      instructions: "Use the status tool before calling an integration-backed tool.",
    });
  }
  if (message.method === "tools/list") {
    return rpc(message.id, { tools: tools(env) });
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    try {
      if (name === "operations_api_status") {
        const status = safeStatus(env);
        return rpc(message.id, toolResult(status, JSON.stringify(status)));
      }
      if (name === "browser_research") {
        const result = await browseToMarkdown(args.url, env);
        return rpc(message.id, toolResult(result, `Opened ${result.url}\n\n${result.markdown}`));
      }
      return rpcError(message.id, -32602, `Unknown tool: ${name}`);
    } catch (error) {
      return rpc(message.id, {
        content: [{ type: "text", text: error.message || "Tool call failed." }],
        isError: true,
      });
    }
  }
  return rpcError(message.id, -32601, `Method not found: ${message.method}`);
}
