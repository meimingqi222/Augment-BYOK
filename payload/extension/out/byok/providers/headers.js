"use strict";

function withJsonContentType(headers) {
  return { "content-type": "application/json", ...(headers && typeof headers === "object" ? headers : {}) };
}

function openAiAuthHeaders(apiKey, extraHeaders) {
  const key = String(apiKey || "");
  return { ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {}), authorization: `Bearer ${key}` };
}

function anthropicAuthHeaders(apiKey, extraHeaders, opts) {
  const key = String(apiKey || "");
  const forceBearer = opts && typeof opts === "object" ? Boolean(opts.forceBearer) : false;
  const headers = {
    ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {}),
    "x-api-key": key,
    "anthropic-version": "2023-06-01"
  };
  if (forceBearer) headers.authorization = `Bearer ${key}`;
  return headers;
}

module.exports = { withJsonContentType, openAiAuthHeaders, anthropicAuthHeaders };
