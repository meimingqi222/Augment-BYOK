"use strict";

const { normalizeEndpoint, normalizeString, parseByokModelId } = require("../infra/util");

function pickRequestedModel(body) {
  if (!body || typeof body !== "object") return "";
  const v = body.model ?? body.model_name ?? body.modelName ?? body.provider_model_name ?? body.providerModelName;
  return normalizeString(v);
}

function getRule(cfg, endpoint) {
  const rules = cfg?.routing?.rules && typeof cfg.routing.rules === "object" ? cfg.routing.rules : null;
  const r = rules && rules[endpoint] && typeof rules[endpoint] === "object" ? rules[endpoint] : null;
  return r || null;
}

function pickProvider(cfg, providerId) {
  const list = Array.isArray(cfg?.providers) ? cfg.providers : [];
  const id = normalizeString(providerId);
  const p = id ? list.find((x) => x && x.id === id) : null;
  return p || (list.length ? list[0] : null);
}

function decideRoute({ cfg, endpoint, body, runtimeEnabled }) {
  const ep = normalizeEndpoint(endpoint);
  if (!ep) return { mode: "official", endpoint: ep, reason: "empty_endpoint" };
  if (!runtimeEnabled) return { mode: "official", endpoint: ep, reason: "rollback_disabled" };
  if (!cfg || cfg.enabled !== true) return { mode: "official", endpoint: ep, reason: "byok_disabled" };

  const rule = getRule(cfg, ep);
  const mode = normalizeString(rule?.mode) || normalizeString(cfg?.routing?.defaultMode) || "official";
  if (mode === "official" || mode === "disabled") return { mode, endpoint: ep, reason: "rule" };
  if (mode !== "byok") return { mode: "official", endpoint: ep, reason: "unknown_mode" };

  const requestedModel = pickRequestedModel(body);
  const parsed = parseByokModelId(requestedModel, { strict: true });
  const providerId = normalizeString(rule?.providerId) || parsed?.providerId || normalizeString(cfg?.routing?.defaultProviderId) || "";
  const provider = pickProvider(cfg, providerId);
  const parsedModel = parsed && normalizeString(parsed.providerId) === normalizeString(provider?.id) ? parsed.modelId : "";
  const model = normalizeString(rule?.model) || normalizeString(parsedModel) || normalizeString(provider?.defaultModel) || "";
  return { mode: "byok", endpoint: ep, reason: "byok", provider, model, requestedModel };
}

module.exports = { decideRoute };
