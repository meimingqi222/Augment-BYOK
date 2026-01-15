"use strict";

const { info, warn } = require("../log");
const { normalizeString } = require("../util");
const { defaultConfig, normalizeConfig } = require("../config");
const { fetchProviderModels } = require("../providers/models");
const { renderConfigPanelHtml } = require("./config-panel.html");

function summarizeRuntime({ cfgMgr, state }) {
  const cfg = cfgMgr?.get?.() || defaultConfig();
  const off = cfg?.official && typeof cfg.official === "object" ? cfg.official : {};
  const providers = Array.isArray(cfg?.providers) ? cfg.providers : [];

  return {
    runtimeEnabled: Boolean(state?.runtimeEnabled),
    byokEnabled: cfg?.enabled === true,
    storageKey: typeof cfgMgr?.getStorageKey === "function" ? cfgMgr.getStorageKey() : "",
    official: {
      completionUrl: normalizeString(off.completionUrl),
      apiTokenSet: Boolean(normalizeString(off.apiToken))
    },
    providers: providers.map((p) => ({
      id: normalizeString(p?.id) || "(unknown)",
      type: normalizeString(p?.type),
      baseUrl: normalizeString(p?.baseUrl),
      defaultModel: normalizeString(p?.defaultModel),
      modelsCount: Array.isArray(p?.models) ? p.models.filter((m) => normalizeString(m)).length : 0,
      apiKeySet: Boolean(normalizeString(p?.apiKey))
    }))
  };
}

async function setRuntimeEnabled({ enabled, ctx, state }) {
  state.runtimeEnabled = Boolean(enabled);
  try {
    await ctx?.globalState?.update?.(state.runtimeEnabledKey, Boolean(enabled));
  } catch {}
}

function post(panel, msg) {
  try {
    panel.webview.postMessage(msg);
  } catch {}
}

function postStatus(panel, status) {
  post(panel, { type: "status", status: String(status || "") });
}

function postRender(panel, cfgMgr, state) {
  post(panel, { type: "render", config: cfgMgr.get(), summary: summarizeRuntime({ cfgMgr, state }) });
}

function createHandlers({ vscode, ctx, cfgMgr, state, panel }) {
  return {
    init: async () => {
      postRender(panel, cfgMgr, state);
    },
    reload: async () => {
      const rr = cfgMgr.reloadNow("panel_reload");
      postStatus(panel, rr.ok ? "Reloaded (OK)." : `Reload failed (${rr.reason || "unknown"}) (kept last-good).`);
      postRender(panel, cfgMgr, state);
    },
    disableRuntime: async () => {
      await setRuntimeEnabled({ enabled: false, ctx, state });
      info("BYOK disabled (rollback) via panel");
      postStatus(panel, "Runtime disabled (rollback to official).");
      postRender(panel, cfgMgr, state);
    },
    enableRuntime: async () => {
      await setRuntimeEnabled({ enabled: true, ctx, state });
      info("BYOK enabled via panel");
      postStatus(panel, "Runtime enabled.");
      postRender(panel, cfgMgr, state);
    },
    reset: async () => {
      try {
        await cfgMgr.resetNow("panel_reset");
        postStatus(panel, "Reset to defaults (OK).");
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        warn("panel reset failed:", m);
        postStatus(panel, `Reset failed: ${m}`);
      }
      postRender(panel, cfgMgr, state);
    },
    save: async (msg) => {
      const raw = msg && typeof msg === "object" ? msg.config : null;
      try {
        const cfg = normalizeConfig(raw);
        await cfgMgr.saveNow(cfg, "panel_save");
        postStatus(panel, "Saved (OK).");
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        warn("panel save failed:", m);
        postStatus(panel, `Save failed: ${m}`);
      }
      postRender(panel, cfgMgr, state);
    },
    fetchProviderModels: async (msg) => {
      const idx = Number(msg?.idx);
      const provider = msg?.provider;
      try {
        const models = await fetchProviderModels({ provider, timeoutMs: 15000 });
        post(panel, { type: "providerModelsFetched", idx, models });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        warn("fetchProviderModels failed:", m);
        post(panel, { type: "providerModelsFailed", idx, error: `Fetch models failed: ${m}` });
      }
    }
  };
}

async function openConfigPanel({ vscode, ctx, cfgMgr, state }) {
  if (!vscode) throw new Error("vscode not available");
  if (!ctx) throw new Error("extension context not available");
  if (!cfgMgr || typeof cfgMgr.get !== "function") throw new Error("cfgMgr missing");

  const panel = vscode.window.createWebviewPanel("augment-byok.config", "BYOK Config", vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  });

  panel.webview.html = renderConfigPanelHtml({
    vscode,
    webview: panel.webview,
    ctx,
    init: { config: cfgMgr.get(), summary: summarizeRuntime({ cfgMgr, state }) }
  });

  const handlers = createHandlers({ vscode, ctx, cfgMgr, state, panel });
  panel.webview.onDidReceiveMessage(async (msg) => {
    const t = normalizeString(msg?.type);
    const fn = handlers[t];
    if (typeof fn === "function") await fn(msg);
  });

  postRender(panel, cfgMgr, state);
  return panel;
}

module.exports = { openConfigPanel };
