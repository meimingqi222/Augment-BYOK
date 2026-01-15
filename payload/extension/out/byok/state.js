"use strict";

const { createConfigManager } = require("./config");

const RUNTIME_ENABLED_KEY = "augment-byok.runtimeEnabled.v1";
const CONFIG_SYNC_KEYS = ["augment-byok.runtimeEnabled.v1"];

const state = {
  installed: false,
  vscode: null,
  extensionContext: null,
  runtimeEnabled: true,
  configManager: null,
  runtimeEnabledKey: RUNTIME_ENABLED_KEY
};

function ensureConfigManager(opts) {
  if (!state.configManager) state.configManager = createConfigManager();
  const ctx = opts && typeof opts === "object" ? opts.ctx : null;
  if (ctx && typeof state.configManager.attachContext === "function") state.configManager.attachContext(ctx);
  return state.configManager;
}

module.exports = { state, ensureConfigManager, CONFIG_SYNC_KEYS };
