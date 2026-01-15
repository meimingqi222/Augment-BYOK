"use strict";

const { joinBaseUrl, safeFetch, readTextLimit } = require("./http");
const { parseSse } = require("./sse");
const { normalizeString, requireString } = require("../infra/util");
const { withJsonContentType, openAiAuthHeaders } = require("./headers");

function buildOpenAiRequest({ baseUrl, apiKey, model, messages, extraHeaders, requestDefaults, stream }) {
  const url = joinBaseUrl(requireString(baseUrl, "OpenAI baseUrl"), "chat/completions");
  const key = requireString(apiKey, "OpenAI apiKey");
  const m = requireString(model, "OpenAI model");
  if (!Array.isArray(messages) || !messages.length) throw new Error("OpenAI messages 为空");
  const body = { ...(requestDefaults && typeof requestDefaults === "object" ? requestDefaults : null), model: m, messages, stream: Boolean(stream) };
  const headers = withJsonContentType(openAiAuthHeaders(key, extraHeaders));
  return { url, headers, body };
}

async function openAiCompleteText({ baseUrl, apiKey, model, messages, timeoutMs, abortSignal, extraHeaders, requestDefaults }) {
  const { url, headers, body } = buildOpenAiRequest({ baseUrl, apiKey, model, messages, extraHeaders, requestDefaults, stream: false });
  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    { timeoutMs, abortSignal, label: "OpenAI" }
  );

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await readTextLimit(resp, 500)}`.trim());
  const json = await resp.json().catch(() => null);
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenAI 响应缺少 choices[0].message.content");
  return text;
}

async function* openAiStreamTextDeltas({ baseUrl, apiKey, model, messages, timeoutMs, abortSignal, extraHeaders, requestDefaults }) {
  const { url, headers, body } = buildOpenAiRequest({ baseUrl, apiKey, model, messages, extraHeaders, requestDefaults, stream: true });
  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    { timeoutMs, abortSignal, label: "OpenAI(stream)" }
  );

  if (!resp.ok) throw new Error(`OpenAI(stream) ${resp.status}: ${await readTextLimit(resp, 500)}`.trim());
  for await (const ev of parseSse(resp)) {
    const data = normalizeString(ev?.data);
    if (!data) continue;
    if (data === "[DONE]") break;
    let json;
    try { json = JSON.parse(data); } catch { continue; }
    const delta = json?.choices?.[0]?.delta;
    const text = typeof delta?.content === "string" ? delta.content : "";
    if (text) yield text;
  }
}

module.exports = { openAiCompleteText, openAiStreamTextDeltas };
