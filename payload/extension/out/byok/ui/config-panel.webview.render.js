(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml, optionHtml, computeProviderIndexById } = ns;

  ns.summarizeSummaryBox = function summarizeSummaryBox(summary) {
    const s = summary && typeof summary === "object" ? summary : {};
    const off = s.official && typeof s.official === "object" ? s.official : {};
    const providers = Array.isArray(s.providers) ? s.providers : [];

    const lines = [];
    lines.push(`<div class="title">Runtime</div>`);
    lines.push(`<div class="small">runtimeEnabled: <span class="mono">${escapeHtml(String(Boolean(s.runtimeEnabled)))}</span></div>`);
    lines.push(`<div class="small">byokEnabled: <span class="mono">${escapeHtml(String(Boolean(s.byokEnabled)))}</span></div>`);
    if (s.storageKey) lines.push(`<div class="small">storageKey: <span class="mono">${escapeHtml(String(s.storageKey))}</span></div>`);

    lines.push(`<div style="height:10px"></div>`);
    lines.push(`<div class="title">Official</div>`);
    lines.push(`<div class="small">completionUrl: <span class="mono">${escapeHtml(off.completionUrl || "")}</span></div>`);
    lines.push(`<div class="small">apiToken: ${off.apiTokenSet ? `<span class="badge">set</span>` : `<span class="badge">empty</span>`}</div>`);

    lines.push(`<div style="height:10px"></div>`);
    lines.push(`<div class="title">Providers</div>`);
    if (!providers.length) lines.push(`<div class="small">(none)</div>`);
    for (const p of providers) {
      lines.push(`<div class="card" style="padding:8px;margin-top:8px;">`);
      lines.push(`<div class="small"><span class="mono">${escapeHtml(p.id)}</span> <span class="badge">${escapeHtml(p.type || "")}</span></div>`);
      if (p.baseUrl) lines.push(`<div class="small">baseUrl: <span class="mono">${escapeHtml(p.baseUrl)}</span></div>`);
      if (p.defaultModel) lines.push(`<div class="small">defaultModel: <span class="mono">${escapeHtml(p.defaultModel)}</span></div>`);
      lines.push(`<div class="small">apiKey: ${p.apiKeySet ? `<span class="badge">set</span>` : `<span class="badge">empty</span>`}</div>`);
      lines.push(`<div class="small">models: <span class="mono">${escapeHtml(String(p.modelsCount || 0))}</span></div>`);
      lines.push(`</div>`);
    }

    return lines.join("");
  };

  ns.renderApp = function renderApp({ cfg, summary, status, modal }) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const off = c.official && typeof c.official === "object" ? c.official : {};
    const routing = c.routing && typeof c.routing === "object" ? c.routing : {};
    const timeouts = c.timeouts && typeof c.timeouts === "object" ? c.timeouts : {};
    const telemetry = c.telemetry && typeof c.telemetry === "object" ? c.telemetry : {};

    const providers = Array.isArray(c.providers) ? c.providers : [];
    const providerIds = providers.map((p) => normalizeStr(p?.id)).filter(Boolean);

    const rulesObj = routing.rules && typeof routing.rules === "object" ? routing.rules : {};
    const ruleEndpoints = Object.keys(rulesObj).sort();

    const telemetryLines = Array.isArray(telemetry.disabledEndpoints) ? telemetry.disabledEndpoints.join("\n") : "";

    const toolbar = [
      `<button class="btn primary" data-action="save">Save</button>`,
      `<button class="btn" data-action="reset">Reset</button>`,
      `<button class="btn" data-action="reload">Reload</button>`,
      `<button class="btn danger" data-action="disableRuntime">Rollback (Disable Runtime)</button>`,
      `<button class="btn" data-action="enableRuntime">Enable Runtime</button>`
    ].join("");

    const general = `
      <div class="card">
        <div class="title">General</div>
        <div class="grid">
          <div>enabled</div>
          <div class="row">
            <input type="checkbox" id="enabled" ${c.enabled === true ? "checked" : ""} />
            <span class="small">BYOK runtime switch (routes still apply)</span>
          </div>
          <div>routing.default_mode</div>
          <div>
            <select id="defaultMode">
              ${optionHtml({ value: "official", label: "official", selected: routing.defaultMode === "official" })}
              ${optionHtml({ value: "byok", label: "byok", selected: routing.defaultMode === "byok" })}
              ${optionHtml({ value: "disabled", label: "disabled", selected: routing.defaultMode === "disabled" })}
            </select>
          </div>
          <div>routing.default_provider_id</div>
          <div>
            <select id="defaultProviderId">
              ${optionHtml({ value: "", label: "(auto)", selected: !routing.defaultProviderId })}
              ${providerIds.map((id) => optionHtml({ value: id, label: id, selected: routing.defaultProviderId === id })).join("")}
            </select>
          </div>
          <div>timeouts.upstream_ms</div>
          <div><input type="number" id="upstreamMs" min="1000" step="1000" value="${escapeHtml(String(timeouts.upstreamMs ?? 120000))}" /></div>
        </div>
      </div>
    `;

    const official = `
      <div class="card">
        <div class="title">Official</div>
        <div class="hint">用于 non-LLM 端点 official 路由 + /get-models 合并（token 也用于官方链路调用）。</div>
        <div class="grid">
          <div>completion_url</div>
          <div><input type="text" id="officialCompletionUrl" value="${escapeHtml(off.completionUrl ?? "")}" placeholder="https://api.augmentcode.com/" /></div>
          <div>api_token</div>
          <div class="row">
            <input type="password" id="officialApiToken" value="" placeholder="${off.apiToken ? "(set)" : "(empty)"}" />
            <button class="btn" data-action="clearOfficialToken">Clear</button>
          </div>
        </div>
        <div class="small">说明：token 输入框留空=保持不变；Clear=清空。</div>
      </div>
    `;

    const providersHtml = `
      <div class="card">
        <div class="title">Providers</div>
        <div class="hint">OpenAI / Anthropic（或兼容 OpenAI Chat Completions 的网关）。models 用于下拉选择与 /get-models 注入。</div>
        <div class="row" style="margin-bottom:8px;justify-content:space-between;">
          <button class="btn" data-action="addProvider">Add Provider</button>
          <div class="small">Tips: Fetch Models 会把结果写入 UI（pending save）。</div>
        </div>
        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th style="min-width:120px;">id</th>
                <th style="min-width:140px;">type</th>
                <th style="min-width:260px;">base_url</th>
                <th style="min-width:220px;">api_key</th>
                <th style="min-width:180px;">models</th>
                <th style="min-width:220px;">default_model</th>
                <th style="min-width:170px;">advanced</th>
                <th style="min-width:90px;"></th>
              </tr>
            </thead>
            <tbody>
              ${providers
                .map((p, idx) => {
                  const pid = normalizeStr(p?.id);
                  const type = normalizeStr(p?.type);
                  const baseUrl = normalizeStr(p?.baseUrl);
                  const apiKeySet = Boolean(normalizeStr(p?.apiKey));
                  const dm = normalizeStr(p?.defaultModel);
                  const rawModels = Array.isArray(p?.models) ? p.models : [];
                  const models = uniq(rawModels.filter((m) => normalizeStr(m)));
                  const modelOptions = uniq(models.concat(dm ? [dm] : []));

                  return `
                    <tr>
                      <td><input type="text" data-p-idx="${idx}" data-p-key="id" value="${escapeHtml(pid)}" placeholder="openai" /></td>
                      <td>
                        <select data-p-idx="${idx}" data-p-key="type">
                          ${optionHtml({ value: "openai_compatible", label: "openai_compatible", selected: type === "openai_compatible" })}
                          ${optionHtml({ value: "anthropic", label: "anthropic", selected: type === "anthropic" })}
                        </select>
                      </td>
                      <td><input type="text" data-p-idx="${idx}" data-p-key="baseUrl" value="${escapeHtml(baseUrl)}" placeholder="https://api.openai.com/v1" /></td>
                      <td>
                        <div class="row">
                          <input type="password" data-p-idx="${idx}" data-p-key="apiKeyInput" value="" placeholder="${apiKeySet ? "(set)" : "(empty)"}" />
                          <button class="btn" data-action="clearProviderKey" data-idx="${idx}">Clear</button>
                        </div>
                      </td>
                      <td>
                        <div class="row">
                          <span class="badge">${escapeHtml(String(models.length))}</span>
                          <button class="btn" data-action="fetchProviderModels" data-idx="${idx}">Fetch</button>
                          <button class="btn" data-action="editProviderModels" data-idx="${idx}">Edit</button>
                        </div>
                      </td>
                      <td>
                        <select data-p-idx="${idx}" data-p-key="defaultModel">
                          ${optionHtml({ value: "", label: "(auto)", selected: !dm })}
                          ${modelOptions.map((m) => optionHtml({ value: m, label: m, selected: dm === m })).join("")}
                        </select>
                      </td>
                      <td>
                        <div class="row">
                          <button class="btn" data-action="editProviderHeaders" data-idx="${idx}">Headers</button>
                          <button class="btn" data-action="editProviderRequestDefaults" data-idx="${idx}">Defaults</button>
                        </div>
                      </td>
                      <td><button class="btn danger" data-action="removeProvider" data-idx="${idx}">Remove</button></td>
                    </tr>
                  `;
                })
                .join("") || `<tr><td colspan="8" class="small">(no providers)</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const providerMap = computeProviderIndexById(c);

    const rulesTableRows = ruleEndpoints
      .map((ep) => {
        const r = rulesObj[ep] && typeof rulesObj[ep] === "object" ? rulesObj[ep] : {};
        const mode = normalizeStr(r.mode) || "official";
        const providerId = normalizeStr(r.providerId);
        const model = normalizeStr(r.model);
        const models = providerId && providerMap[providerId] && Array.isArray(providerMap[providerId].models) ? providerMap[providerId].models : [];

        const modelDisabled = !providerId;
        const modelOptions = uniq(models.concat(model ? [model] : []));

        return `
          <tr>
            <td class="mono">${escapeHtml(ep)}</td>
            <td>
              <select data-rule-ep="${escapeHtml(ep)}" data-rule-key="mode">
                ${optionHtml({ value: "official", label: "official", selected: mode === "official" })}
                ${optionHtml({ value: "byok", label: "byok", selected: mode === "byok" })}
                ${optionHtml({ value: "disabled", label: "disabled", selected: mode === "disabled" })}
              </select>
            </td>
            <td>
              <select data-rule-ep="${escapeHtml(ep)}" data-rule-key="providerId">
                ${optionHtml({ value: "", label: "(auto / from model picker)", selected: !providerId })}
                ${providerIds.map((id) => optionHtml({ value: id, label: id, selected: providerId === id })).join("")}
              </select>
            </td>
            <td>
              <select data-rule-ep="${escapeHtml(ep)}" data-rule-key="model" ${modelDisabled ? "disabled" : ""}>
                ${optionHtml({ value: "", label: "(auto / from model picker)", selected: !model })}
                ${modelOptions.map((m) => optionHtml({ value: m, label: m, selected: model === m })).join("")}
              </select>
            </td>
            <td>
              <button class="btn danger" data-action="removeRule" data-ep="${escapeHtml(ep)}">Remove</button>
            </td>
          </tr>
        `;
      })
      .join("");

    const routingRules = `
      <div class="card">
        <div class="title">Routing Rules</div>
        <div class="hint">留空 provider/model = 优先跟随请求体 model（当其为 <span class="mono">byok:&lt;provider&gt;:&lt;model&gt;</span>）否则走 default provider。</div>
        <div class="row" style="margin-bottom:8px;">
          <input type="text" id="newRuleEndpoint" placeholder="/some-endpoint" />
          <button class="btn" data-action="addRule">Add Rule</button>
        </div>
        <table>
          <thead>
            <tr><th>endpoint</th><th>mode</th><th>provider</th><th>model</th><th></th></tr>
          </thead>
          <tbody>
            ${rulesTableRows || `<tr><td colspan="5" class="small">(no rules)</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    const telemetryHtml = `
      <div class="card">
        <div class="title">Telemetry (disabled_endpoints)</div>
        <div class="hint">每行一个 endpoint（这些会在本地直接 no-op，不发网络请求）。</div>
        <textarea class="mono" id="telemetryDisabled">${escapeHtml(telemetryLines)}</textarea>
      </div>
    `;

    const m = modal && typeof modal === "object" ? modal : null;
    const mKind = normalizeStr(m?.kind);
    const mIdx = Number(m?.idx);
    const mProvider = Number.isFinite(mIdx) && mIdx >= 0 && mIdx < providers.length ? providers[mIdx] : null;
    const modalHtml =
      !mKind
        ? ""
        : mKind === "confirmReset"
          ? `
              <div class="modal-backdrop">
                <div class="modal card">
                  <div class="title">Reset to defaults?</div>
                  <div class="hint">这会覆盖存储在 extension globalState 里的 BYOK 配置（token/key 也会被清空）。</div>
                  <div class="row" style="margin-top:10px;justify-content:flex-end;">
                    <button class="btn" data-action="modalCancel">Cancel</button>
                    <button class="btn danger" data-action="confirmReset">Reset</button>
                  </div>
                </div>
              </div>
            `
          : !mProvider
            ? ""
            : (() => {
            const title =
              mKind === "models" ? `Edit models (Provider #${mIdx + 1})` : mKind === "headers" ? `Edit headers (Provider #${mIdx + 1})` : `Edit request_defaults (Provider #${mIdx + 1})`;
            const text =
              mKind === "models"
                ? (Array.isArray(mProvider.models) ? mProvider.models : []).join("\n")
                : JSON.stringify(mKind === "headers" ? (mProvider.headers ?? {}) : (mProvider.requestDefaults ?? {}), null, 2);
            const hint =
              mKind === "models" ? "每行一个 model id（用于下拉选择与 /get-models 注入）。" : "请输入 JSON 对象（会在 Save 时持久化）。";

            return `
              <div class="modal-backdrop">
                <div class="modal card">
                  <div class="title">${escapeHtml(title)}</div>
                  <div class="hint">${escapeHtml(hint)}</div>
                  <textarea class="mono" id="modalText" style="min-height:240px;">${escapeHtml(text)}</textarea>
                  <div class="row" style="margin-top:10px;justify-content:flex-end;">
                    <button class="btn" data-action="modalCancel">Cancel</button>
                    <button class="btn primary" data-action="modalApply">Apply</button>
                  </div>
                </div>
              </div>
            `;
          })();

    return `
      <div class="wrap">
        <div class="main">
          <div class="toolbar">${toolbar}</div>
          <div class="status" id="status">${escapeHtml(status || "Ready.")}</div>
          ${general}
          ${official}
          ${providersHtml}
          ${routingRules}
          ${telemetryHtml}
        </div>
        <div class="side" id="side">${ns.summarizeSummaryBox(summary)}</div>
      </div>
      ${modalHtml}
    `;
  };
})();
