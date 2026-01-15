"use strict";

const { debug, warn } = require("./log");
const { normalizeEndpoint, normalizeString } = require("./util");

const CONFIG_KEY = "augment-byok.config.v1";

function defaultConfig() {
  return {
    version: 1,
    enabled: true,
    official: {
      completionUrl: "https://api.augmentcode.com/",
      apiToken: ""
    },
    providers: [
      {
        id: "openai",
        type: "openai_compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        models: ["gpt-4o-mini"],
        defaultModel: "gpt-4o-mini",
        headers: {},
        requestDefaults: {}
      },
      {
        id: "anthropic",
        type: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "",
        models: ["claude-3-5-sonnet-20241022"],
        defaultModel: "claude-3-5-sonnet-20241022",
        headers: {},
        requestDefaults: {}
      }
    ],
    routing: {
      defaultMode: "official",
      defaultProviderId: "",
      rules: {
        "/get-models": { mode: "byok" },
        "/chat": { mode: "byok" },
        "/chat-stream": { mode: "byok" },
        "/prompt-enhancer": { mode: "byok" },
        "/completion": { mode: "byok" },
        "/chat-input-completion": { mode: "byok" },
        "/edit": { mode: "byok" },
        "/instruction-stream": { mode: "byok" },
        "/smart-paste-stream": { mode: "byok" },
        "/next-edit-stream": { mode: "byok" },
        "/generate-commit-message-stream": { mode: "byok" },
        "/generate-conversation-title": { mode: "byok" },
        "/next_edit_loc": { mode: "byok" }
      }
    },
    timeouts: { upstreamMs: 120000 },
    telemetry: {
      disabledEndpoints: [
        "/client-metrics",
        "/client-completion-timelines",
        "/record-preference-sample",
        "/record-request-events",
        "/record-session-events",
        "/record-user-events",
        "/report-error",
        "/resolve-completions",
        "/resolve-edit",
        "/resolve-instruction"
      ]
    }
  };
}

function get(obj, keys) {
  for (const k of keys) {
    if (obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function normalizeListStrings(v) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];
  for (const it of arr) {
    const s = normalizeString(it);
    if (s) out.push(s);
  }
  return Array.from(new Set(out));
}

function normalizeMode(v) {
  const s = normalizeString(v);
  if (s === "byok" || s === "official" || s === "disabled") return s;
  return "";
}

function normalizeConfig(raw) {
  const out = defaultConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  const enabled = get(raw, ["enabled"]);
  if (typeof enabled === "boolean") out.enabled = enabled;

  const version = get(raw, ["version"]);
  if (Number.isFinite(Number(version)) && Number(version) > 0) out.version = Number(version);

  const official = get(raw, ["official"]);
  const completionUrl = normalizeString(get(official, ["completion_url", "completionUrl"]));
  if (completionUrl) out.official.completionUrl = completionUrl;
  const apiToken = normalizeString(get(official, ["api_token", "apiToken"]));
  if (apiToken) out.official.apiToken = apiToken;

  const timeouts = get(raw, ["timeouts"]);
  const upstreamMs = get(timeouts, ["upstream_ms", "upstreamMs"]);
  if (Number.isFinite(Number(upstreamMs)) && Number(upstreamMs) > 0) out.timeouts.upstreamMs = Number(upstreamMs);

  const telemetry = get(raw, ["telemetry"]);
  const disabledEndpoints = get(telemetry, ["disabled_endpoints", "disabledEndpoints"]);
  if (Array.isArray(disabledEndpoints)) out.telemetry.disabledEndpoints = disabledEndpoints.map(normalizeEndpoint).filter(Boolean);

  const routing = get(raw, ["routing"]);
  const defaultMode = normalizeMode(get(routing, ["default_mode", "defaultMode"])) || out.routing.defaultMode;
  out.routing.defaultMode = defaultMode;

  const defaultProviderId = normalizeString(get(routing, ["default_provider_id", "defaultProviderId"]));
  if (defaultProviderId) out.routing.defaultProviderId = defaultProviderId;

  const rules = get(routing, ["rules"]);
  if (rules && typeof rules === "object" && !Array.isArray(rules)) {
    out.routing.rules = {};
    for (const [k, v] of Object.entries(rules)) {
      const ep = normalizeEndpoint(k);
      if (!ep) continue;
      const mode = normalizeMode(get(v, ["mode"])) || out.routing.defaultMode;
      const providerId = normalizeString(get(v, ["provider_id", "providerId"]));
      const model = normalizeString(get(v, ["model"]));
      out.routing.rules[ep] = { mode, providerId, model };
    }
  }

  const providers = get(raw, ["providers"]);
  if (Array.isArray(providers)) {
    out.providers = providers
      .map((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) return null;
        const id = normalizeString(get(p, ["id"]));
        const type = normalizeString(get(p, ["type"]));
        const baseUrl = normalizeString(get(p, ["base_url", "baseUrl"]));
        const apiKey = normalizeString(get(p, ["api_key", "apiKey"]));
        const defaultModel = normalizeString(get(p, ["default_model", "defaultModel"]));
        const models = normalizeListStrings(get(p, ["models"]));
        const headers = get(p, ["headers"]);
        const requestDefaults = get(p, ["request_defaults", "requestDefaults"]);
        if (!id || !type) return null;

        const finalModels = models.length ? models : defaultModel ? [defaultModel] : [];
        const finalDefaultModel = defaultModel || finalModels[0] || "";

        return {
          id,
          type,
          baseUrl,
          apiKey,
          models: finalModels,
          defaultModel: finalDefaultModel,
          headers: headers && typeof headers === "object" && !Array.isArray(headers) ? headers : {},
          requestDefaults: requestDefaults && typeof requestDefaults === "object" && !Array.isArray(requestDefaults) ? requestDefaults : {}
        };
      })
      .filter(Boolean);
  }

  return out;
}

class ConfigManager {
  constructor() {
    this.current = defaultConfig();
    this.lastGood = this.current;
    this.lastError = null;
    this._ctx = null;
  }

  attachContext(ctx) {
    this._ctx = ctx || null;
    return this.reloadNow("attachContext");
  }

  get() {
    return this.current;
  }

  getStorageKey() {
    return CONFIG_KEY;
  }

  reloadNow(reason) {
    const ctx = this._ctx;
    if (!ctx || !ctx.globalState || typeof ctx.globalState.get !== "function") {
      this.lastError = new Error("config storage not ready (missing extension context)");
      this.current = this.lastGood;
      debug(`config reload skipped (${reason}): no ctx`);
      return { ok: false, reason: "no_ctx" };
    }

    try {
      const raw = ctx.globalState.get(CONFIG_KEY);
      if (!raw) {
        this.lastError = new Error("config missing (will initialize defaults on next save)");
        this.current = this.lastGood;
        debug(`config missing (${reason})`);
        return { ok: false, reason: "missing" };
      }
      const cfg = normalizeConfig(raw);
      this.current = cfg;
      this.lastGood = cfg;
      this.lastError = null;
      debug(`config loaded (${reason})`);
      return { ok: true };
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      this.current = this.lastGood;
      warn(`config load failed (${reason}): ${this.lastError.message}`);
      return { ok: false, reason: "error", error: this.lastError };
    }
  }

  async saveNow(raw, reason) {
    const ctx = this._ctx;
    if (!ctx || !ctx.globalState || typeof ctx.globalState.update !== "function") throw new Error("config storage not ready (missing globalState)");
    const cfg = normalizeConfig(raw);
    await ctx.globalState.update(CONFIG_KEY, cfg);
    this.current = cfg;
    this.lastGood = cfg;
    this.lastError = null;
    debug(`config saved (${normalizeString(reason) || "save"})`);
    return { ok: true, config: cfg };
  }

  async resetNow(reason) {
    return await this.saveNow(defaultConfig(), normalizeString(reason) || "reset");
  }
}

function createConfigManager(opts) {
  const mgr = new ConfigManager();
  const ctx = opts && typeof opts === "object" ? opts.ctx : null;
  if (ctx) mgr.attachContext(ctx);
  return mgr;
}

module.exports = { CONFIG_KEY, defaultConfig, normalizeConfig, createConfigManager, ConfigManager };

