"use strict";

const { joinBaseUrl, safeFetch, readTextLimit } = require("./http");
const { parseSse } = require("./sse");
const { normalizeString, requireString } = require("../infra/util");
const { withJsonContentType, anthropicAuthHeaders } = require("./headers");

function pickMaxTokens(requestDefaults) {
  const v = requestDefaults && typeof requestDefaults === "object" ? requestDefaults.max_tokens ?? requestDefaults.maxTokens : undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1024;
}

function buildAnthropicRequest({ baseUrl, apiKey, model, system, messages, extraHeaders, requestDefaults, stream }) {
  const url = joinBaseUrl(requireString(baseUrl, "Anthropic baseUrl"), "messages");
  const key = requireString(apiKey, "Anthropic apiKey");
  const m = requireString(model, "Anthropic model");
  if (!Array.isArray(messages) || !messages.length) throw new Error("Anthropic messages 为空");

  const body = {
    ...(requestDefaults && typeof requestDefaults === "object" ? requestDefaults : null),
    model: m,
    max_tokens: pickMaxTokens(requestDefaults),
    messages,
    stream: Boolean(stream)
  };
  if (typeof system === "string" && system.trim()) body.system = system.trim();
  const headers = withJsonContentType(anthropicAuthHeaders(key, extraHeaders));
  return { url, headers, body };
}

async function anthropicCompleteText({ baseUrl, apiKey, model, system, messages, timeoutMs, abortSignal, extraHeaders, requestDefaults }) {
  const { url, headers, body } = buildAnthropicRequest({ baseUrl, apiKey, model, system, messages, extraHeaders, requestDefaults, stream: false });

  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    { timeoutMs, abortSignal, label: "Anthropic" }
  );

  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await readTextLimit(resp, 500)}`.trim());
  const json = await resp.json().catch(() => null);
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const out = blocks.map((b) => (b && b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  if (!out) throw new Error("Anthropic 响应缺少 content[].text");
  return out;
}

async function* anthropicStreamTextDeltas({ baseUrl, apiKey, model, system, messages, timeoutMs, abortSignal, extraHeaders, requestDefaults }) {
  const { url, headers, body } = buildAnthropicRequest({ baseUrl, apiKey, model, system, messages, extraHeaders, requestDefaults, stream: true });

  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    { timeoutMs, abortSignal, label: "Anthropic(stream)" }
  );

  if (!resp.ok) throw new Error(`Anthropic(stream) ${resp.status}: ${await readTextLimit(resp, 500)}`.trim());
  for await (const ev of parseSse(resp)) {
    const data = normalizeString(ev?.data);
    if (!data) continue;
    let json;
    try { json = JSON.parse(data); } catch { continue; }
    if (json?.type === "message_stop") break;
    if (json?.type === "content_block_delta" && json.delta && json.delta.type === "text_delta" && typeof json.delta.text === "string") {
      const t = json.delta.text;
      if (t) yield t;
    }
  }
}

module.exports = { anthropicCompleteText, anthropicStreamTextDeltas };
