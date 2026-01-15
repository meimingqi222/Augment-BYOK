"use strict";

const { createConfigManager } = require("./config");

const RUNTIME_ENABLED_KEY = "augment-byok.runtimeEnabled.v1";
const CONFIG_SYNC_KEYS = [RUNTIME_ENABLED_KEY];

const state = {
  installed: false,
  vscode: null,
  extensionContext: null,
  runtimeEnabled: true,
  configManager: null
};

async function setRuntimeEnabled(ctx, enabled) {
  state.runtimeEnabled = Boolean(enabled);
  try {
    await ctx?.globalState?.update?.(RUNTIME_ENABLED_KEY, state.runtimeEnabled);
  } catch {}
  return state.runtimeEnabled;
}

function ensureConfigManager(opts) {
  if (!state.configManager) state.configManager = createConfigManager();
  const ctx = opts && typeof opts === "object" ? opts.ctx : null;
  if (ctx && typeof state.configManager.attachContext === "function") state.configManager.attachContext(ctx);
  return state.configManager;
}

module.exports = { state, setRuntimeEnabled, ensureConfigManager, CONFIG_SYNC_KEYS, RUNTIME_ENABLED_KEY };
