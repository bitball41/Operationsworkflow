const HEALTH_TTL_MS = 60_000;
const healthCache = new WeakMap();

export const AI_PROVIDER_IDS = Object.freeze(["anthropic", "openai", "kimi", "qwen"]);

const DEFINITIONS = Object.freeze({
  anthropic: {
    label: "Anthropic",
    protocol: "anthropic_messages",
    secret: "ANTHROPIC_API_KEY",
    modelBinding: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5",
    baseUrl: "https://api.anthropic.com/v1",
    capabilities: { tools: true, effort: true },
  },
  openai: {
    label: "OpenAI",
    protocol: "openai_responses",
    secret: "OPENAI_API_KEY",
    modelBinding: "OPENAI_MODEL",
    defaultModel: "gpt-5.6-sol",
    baseUrl: "https://api.openai.com/v1",
    capabilities: { tools: true, effort: true },
  },
  kimi: {
    label: "Kimi",
    protocol: "openai_chat_completions",
    secret: "KIMI_API_KEY",
    modelBinding: "KIMI_MODEL",
    defaultModel: "",
    baseUrl: "https://api.moonshot.ai/v1",
    capabilities: { tools: true, effort: false },
  },
  qwen: {
    label: "Qwen",
    protocol: "openai_chat_completions",
    secret: "QWEN_API_KEY",
    legacySecret: "DASHSCOPE_API_KEY",
    modelBinding: "QWEN_MODEL",
    baseBinding: "QWEN_BASE_URL",
    defaultModel: "",
    baseUrl: "",
    capabilities: { tools: true, effort: false },
  },
});

function string(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeBaseUrl(provider, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    if (provider === "qwen") {
      const allowedHost = url.hostname === "dashscope.aliyuncs.com"
        || url.hostname.endsWith(".aliyuncs.com");
      const allowedPath = /\/(?:compatible-mode\/)?v1\/?$/i.test(url.pathname);
      if (!allowedHost || !allowedPath) return "";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function aiProviderConfig(env, provider) {
  const definition = DEFINITIONS[provider];
  if (!definition) return null;
  const key = string(env?.[definition.secret]) || string(env?.[definition.legacySecret]);
  const model = string(env?.[definition.modelBinding]) || definition.defaultModel;
  const rawBase = definition.baseBinding ? string(env?.[definition.baseBinding]) : definition.baseUrl;
  const baseUrl = safeBaseUrl(provider, rawBase);
  const missing = [];
  if (!key) missing.push(definition.secret);
  if (!model) missing.push(definition.modelBinding);
  if (!rawBase && definition.baseBinding) missing.push(definition.baseBinding);
  else if (!baseUrl) missing.push(`${definition.baseBinding || "base URL"} (invalid)`);
  return {
    id: provider,
    label: definition.label,
    protocol: definition.protocol,
    secret: definition.secret,
    key,
    model,
    baseUrl,
    missing,
    capabilities: definition.capabilities,
  };
}

function headersFor(config) {
  if (config.id === "anthropic") {
    return {
      "x-api-key": config.key,
      "anthropic-version": "2023-06-01",
    };
  }
  return { authorization: `Bearer ${config.key}` };
}

function modelListed(payload, model) {
  if (payload?.id === model) return true;
  return Array.isArray(payload?.data) && payload.data.some((entry) => entry?.id === model);
}

async function probe(config) {
  if (config.missing.length) {
    return { connected: false, configured: false, reason: `Missing ${config.missing.join(", ")}.` };
  }
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: headersFor(config),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? "Provider rejected the Worker credential."
        : `Provider model check returned HTTP ${response.status}.`;
      return { connected: false, configured: true, reason };
    }
    const payload = await response.json().catch(() => null);
    if (!modelListed(payload, config.model)) {
      return { connected: false, configured: true, reason: `Configured model ${config.model} was not returned by the provider.` };
    }
    return { connected: true, configured: true, reason: "Authenticated model check passed." };
  } catch {
    return { connected: false, configured: true, reason: "Provider model check could not be completed." };
  }
}

export async function aiProviderStatus(env) {
  const cached = healthCache.get(env);
  if (cached && Date.now() - cached.at < HEALTH_TTL_MS) return cached.value;
  const entries = await Promise.all(AI_PROVIDER_IDS.map(async (provider) => {
    const config = aiProviderConfig(env, provider);
    const health = await probe(config);
    return [provider, {
      connected: health.connected,
      configured: health.configured,
      model: config.model,
      protocol: config.protocol,
      capabilities: config.capabilities,
      reason: health.reason,
    }];
  }));
  const value = Object.fromEntries(entries);
  healthCache.set(env, { at: Date.now(), value });
  return value;
}

export function clearAiProviderHealthCacheForTests() {
  // WeakMap has no clear(), and replacing it would make the binding mutable.
  // Tests use a fresh env object for every health scenario.
}

export function aiProviderHeaders(config) {
  return headersFor(config);
}
