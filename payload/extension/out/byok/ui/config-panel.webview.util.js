(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});

  ns.qs = function qs(sel, root) {
    return (root || document).querySelector(sel);
  };

  ns.normalizeStr = function normalizeStr(v) {
    return String(v ?? "").trim();
  };

  ns.uniq = function uniq(xs) {
    return Array.from(new Set((Array.isArray(xs) ? xs : []).map((x) => ns.normalizeStr(x)).filter(Boolean)));
  };

  ns.parseJsonOrEmptyObject = function parseJsonOrEmptyObject(s) {
    const t = ns.normalizeStr(s);
    if (!t) return {};
    return JSON.parse(t);
  };

  ns.parseModelsTextarea = function parseModelsTextarea(s) {
    const lines = String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    return ns.uniq(lines);
  };

  ns.escapeHtml = function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  ns.optionHtml = function optionHtml({ value, label, selected, disabled }) {
    return `<option value="${ns.escapeHtml(value)}"${selected ? " selected" : ""}${disabled ? " disabled" : ""}>${ns.escapeHtml(label)}</option>`;
  };

  ns.computeProviderIndexById = function computeProviderIndexById(cfg) {
    const out = {};
    const list = Array.isArray(cfg?.providers) ? cfg.providers : [];
    for (const p of list) {
      const id = ns.normalizeStr(p?.id);
      if (id) out[id] = p;
    }
    return out;
  };
})();

