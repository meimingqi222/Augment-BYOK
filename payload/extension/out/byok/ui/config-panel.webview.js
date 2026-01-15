(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const ns = window.__byokCfgPanel;
  if (!ns || typeof ns.qs !== "function" || typeof ns.renderApp !== "function") throw new Error("BYOK panel init failed (missing util/render)");

  const { qs, normalizeStr, uniq, parseModelsTextarea, parseJsonOrEmptyObject, renderApp } = ns;

  let uiState = { cfg: {}, summary: {}, status: "Ready.", clearOfficialToken: false, modal: null };

  function render() {
    qs("#app").innerHTML = renderApp(uiState);
  }

  function applyProvidersEditsFromDom(cfg) {
    const providers = Array.isArray(cfg.providers) ? cfg.providers : [];
    const els = Array.from(document.querySelectorAll("[data-p-idx][data-p-key]"));

    for (const el of els) {
      const idx = Number(el.getAttribute("data-p-idx"));
      const key = el.getAttribute("data-p-key");
      if (!Number.isFinite(idx) || idx < 0 || idx >= providers.length) continue;
      if (key === "apiKeyInput") continue;

      const p = providers[idx] && typeof providers[idx] === "object" ? providers[idx] : (providers[idx] = {});

      if (key === "models") {
        p.models = parseModelsTextarea(el.value);
        continue;
      }
      if (key === "headers") {
        try { p.headers = parseJsonOrEmptyObject(el.value); } catch {}
        continue;
      }
      if (key === "requestDefaults") {
        try { p.requestDefaults = parseJsonOrEmptyObject(el.value); } catch {}
        continue;
      }

      p[key] = normalizeStr(el.value);
    }

    for (const el of els) {
      const idx = Number(el.getAttribute("data-p-idx"));
      const key = el.getAttribute("data-p-key");
      if (key !== "apiKeyInput") continue;
      const v = normalizeStr(el.value);
      if (v && providers[idx]) providers[idx].apiKey = v;
    }

    for (const p of providers) {
      const models = uniq((Array.isArray(p.models) ? p.models : []).concat(normalizeStr(p.defaultModel) ? [p.defaultModel] : []));
      p.models = models;
      if (!normalizeStr(p.defaultModel)) p.defaultModel = models[0] || "";
    }

    cfg.providers = providers;
  }

  function applyRulesEditsFromDom(cfg) {
    const routing = cfg.routing && typeof cfg.routing === "object" ? cfg.routing : (cfg.routing = {});
    const rules = routing.rules && typeof routing.rules === "object" ? routing.rules : (routing.rules = {});

    const els = Array.from(document.querySelectorAll("[data-rule-ep][data-rule-key]"));
    for (const el of els) {
      const ep = el.getAttribute("data-rule-ep");
      const key = el.getAttribute("data-rule-key");
      if (!ep || !key) continue;
      const r = rules[ep] && typeof rules[ep] === "object" ? rules[ep] : (rules[ep] = {});
      r[key] = normalizeStr(el.value);
    }

    routing.rules = rules;
    cfg.routing = routing;
  }

  function gatherConfigFromDom() {
    const cfg = JSON.parse(JSON.stringify(uiState.cfg || {}));

    cfg.enabled = Boolean(qs("#enabled")?.checked);

    cfg.timeouts = cfg.timeouts && typeof cfg.timeouts === "object" ? cfg.timeouts : {};
    cfg.timeouts.upstreamMs = Number(qs("#upstreamMs")?.value || 0) || 120000;

    cfg.routing = cfg.routing && typeof cfg.routing === "object" ? cfg.routing : {};
    cfg.routing.defaultMode = normalizeStr(qs("#defaultMode")?.value) || "official";
    cfg.routing.defaultProviderId = normalizeStr(qs("#defaultProviderId")?.value);

    cfg.official = cfg.official && typeof cfg.official === "object" ? cfg.official : {};
    cfg.official.completionUrl = normalizeStr(qs("#officialCompletionUrl")?.value);

    const officialTokenInput = normalizeStr(qs("#officialApiToken")?.value);
    if (officialTokenInput) cfg.official.apiToken = officialTokenInput;
    if (uiState.clearOfficialToken) cfg.official.apiToken = "";

    applyProvidersEditsFromDom(cfg);
    applyRulesEditsFromDom(cfg);

    cfg.telemetry = cfg.telemetry && typeof cfg.telemetry === "object" ? cfg.telemetry : {};
    cfg.telemetry.disabledEndpoints = uniq(String(qs("#telemetryDisabled")?.value ?? "").split("\n").map((x) => normalizeStr(x)));

    return cfg;
  }

  function setUiState(patch, { preserveEdits = true } = {}) {
    if (preserveEdits) {
      try {
        if (qs("#enabled")) uiState.cfg = gatherConfigFromDom();
      } catch {}
    }
    uiState = { ...uiState, ...(patch || {}) };
    render();
  }

  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    const t = msg && typeof msg === "object" ? msg.type : "";
    if (t === "status") setUiState({ status: msg.status || "" }, { preserveEdits: true });
    if (t === "render") setUiState({ cfg: msg.config || {}, summary: msg.summary || {}, status: "Ready.", clearOfficialToken: false, modal: null }, { preserveEdits: false });
    if (t === "providerModelsFetched") {
      const idx = Number(msg.idx);
      const models = Array.isArray(msg.models) ? msg.models : [];
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      if (!Number.isFinite(idx) || idx < 0 || idx >= cfg.providers.length) return setUiState({ status: "Models fetched but provider index invalid." }, { preserveEdits: true });
      cfg.providers[idx] = cfg.providers[idx] && typeof cfg.providers[idx] === "object" ? cfg.providers[idx] : {};
      cfg.providers[idx].models = uniq(models);
      const dm = normalizeStr(cfg.providers[idx].defaultModel);
      if (dm && !cfg.providers[idx].models.includes(dm)) cfg.providers[idx].models = uniq(cfg.providers[idx].models.concat([dm]));
      if (!dm) cfg.providers[idx].defaultModel = cfg.providers[idx].models[0] || "";
      return setUiState({ cfg, status: "Models fetched (pending save)." }, { preserveEdits: false });
    }
    if (t === "providerModelsFailed") return setUiState({ status: msg.error || "Fetch models failed." }, { preserveEdits: true });
  });

  document.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");

    if (action === "clearOfficialToken") {
      setUiState({ clearOfficialToken: true, status: "Official token cleared (pending save)." }, { preserveEdits: true });
      return;
    }

    if (action === "fetchProviderModels") {
      const idx = Number(btn.getAttribute("data-idx"));
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      const p = Number.isFinite(idx) && idx >= 0 && idx < cfg.providers.length ? cfg.providers[idx] : null;
      if (!p) return setUiState({ status: "Fetch Models: provider not found." }, { preserveEdits: true });
      vscode.postMessage({ type: "fetchProviderModels", idx, provider: p });
      setUiState({ status: `Fetching models... (Provider #${idx + 1})` }, { preserveEdits: true });
      return;
    }

    if (action === "editProviderModels") return setUiState({ modal: { kind: "models", idx: Number(btn.getAttribute("data-idx")) } }, { preserveEdits: true });
    if (action === "editProviderHeaders") return setUiState({ modal: { kind: "headers", idx: Number(btn.getAttribute("data-idx")) } }, { preserveEdits: true });
    if (action === "editProviderRequestDefaults") return setUiState({ modal: { kind: "requestDefaults", idx: Number(btn.getAttribute("data-idx")) } }, { preserveEdits: true });
    if (action === "modalCancel") return setUiState({ modal: null, status: "Canceled." }, { preserveEdits: true });
    if (action === "confirmReset") {
      vscode.postMessage({ type: "reset" });
      return setUiState({ modal: null, status: "Resetting..." }, { preserveEdits: true });
    }
    if (action === "modalApply") {
      const m = uiState.modal && typeof uiState.modal === "object" ? uiState.modal : null;
      const idx = Number(m?.idx);
      const kind = normalizeStr(m?.kind);
      const text = qs("#modalText")?.value ?? "";
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      if (!Number.isFinite(idx) || idx < 0 || idx >= cfg.providers.length) return setUiState({ status: "Apply failed: provider index invalid." }, { preserveEdits: true });
      const p = cfg.providers[idx] && typeof cfg.providers[idx] === "object" ? cfg.providers[idx] : (cfg.providers[idx] = {});
      if (kind === "models") p.models = parseModelsTextarea(text);
      else {
        try { kind === "headers" ? (p.headers = parseJsonOrEmptyObject(text)) : (p.requestDefaults = parseJsonOrEmptyObject(text)); } catch { return setUiState({ status: "Invalid JSON (kept modal open)." }, { preserveEdits: true }); }
      }
      return setUiState({ cfg, modal: null, status: "Updated (pending save)." }, { preserveEdits: false });
    }

    if (action === "addProvider") {
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      cfg.providers.push({ id: `provider_${cfg.providers.length + 1}`, type: "openai_compatible", baseUrl: "", apiKey: "", models: [], defaultModel: "", headers: {}, requestDefaults: {} });
      setUiState({ cfg, status: "Provider added (pending save)." }, { preserveEdits: false });
      return;
    }

    if (action === "removeProvider") {
      const idx = Number(btn.getAttribute("data-idx"));
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      if (Number.isFinite(idx) && idx >= 0 && idx < cfg.providers.length) cfg.providers.splice(idx, 1);
      setUiState({ cfg, status: "Provider removed (pending save)." }, { preserveEdits: false });
      return;
    }

    if (action === "clearProviderKey") {
      const idx = Number(btn.getAttribute("data-idx"));
      const cfg = gatherConfigFromDom();
      cfg.providers = Array.isArray(cfg.providers) ? cfg.providers : [];
      if (cfg.providers[idx]) cfg.providers[idx].apiKey = "";
      setUiState({ cfg, status: "Provider apiKey cleared (pending save)." }, { preserveEdits: false });
      return;
    }

    if (action === "addRule") {
      const ep = normalizeStr(qs("#newRuleEndpoint")?.value);
      if (!ep.startsWith("/")) return setUiState({ status: "Endpoint must start with /" }, { preserveEdits: true });
      const cfg = gatherConfigFromDom();
      cfg.routing = cfg.routing && typeof cfg.routing === "object" ? cfg.routing : {};
      cfg.routing.rules = cfg.routing.rules && typeof cfg.routing.rules === "object" ? cfg.routing.rules : {};
      if (!cfg.routing.rules[ep]) cfg.routing.rules[ep] = { mode: "official", providerId: "", model: "" };
      setUiState({ cfg, status: `Rule added: ${ep} (pending save).` }, { preserveEdits: false });
      return;
    }

    if (action === "removeRule") {
      const ep = btn.getAttribute("data-ep");
      const cfg = gatherConfigFromDom();
      if (cfg.routing && cfg.routing.rules && cfg.routing.rules[ep]) delete cfg.routing.rules[ep];
      setUiState({ cfg, status: `Rule removed: ${ep} (pending save).` }, { preserveEdits: false });
      return;
    }

    if (action === "save") return vscode.postMessage({ type: "save", config: gatherConfigFromDom() });
    if (action === "reset") return setUiState({ modal: { kind: "confirmReset" } }, { preserveEdits: true });
    if (action === "reload") return vscode.postMessage({ type: "reload" });
    if (action === "disableRuntime") return vscode.postMessage({ type: "disableRuntime" });
    if (action === "enableRuntime") return vscode.postMessage({ type: "enableRuntime" });
  });

  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || typeof el.matches !== "function") return;
    if (el.matches("[data-rule-key=\"providerId\"]")) return setUiState({ status: "Rule provider changed (pending save)." }, { preserveEdits: true });
    if (el.matches("[data-p-key=\"type\"],[data-p-key=\"defaultModel\"]")) return setUiState({ status: "Provider updated (pending save)." }, { preserveEdits: true });
  });

  function init() {
    try {
      const initEl = qs("#byokInit");
      const init = initEl ? JSON.parse(initEl.textContent || "{}") : {};
      setUiState({ cfg: init.config || {}, summary: init.summary || {}, status: "Ready.", clearOfficialToken: false }, { preserveEdits: false });
    } catch {
      setUiState({ cfg: {}, summary: {}, status: "Init failed.", clearOfficialToken: false }, { preserveEdits: false });
    }
    vscode.postMessage({ type: "init" });
  }

  init();
})();
