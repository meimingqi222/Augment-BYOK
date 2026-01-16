"use strict";

const shared = require("./augment-struct");
const {
  REQUEST_NODE_TEXT,
  REQUEST_NODE_TOOL_RESULT,
  REQUEST_NODE_HISTORY_SUMMARY,
  RESPONSE_NODE_RAW_RESPONSE,
  RESPONSE_NODE_THINKING,
  RESPONSE_NODE_TOOL_USE
} = require("./augment-protocol");

const { asRecord, asArray, asString, pick, normalizeNodeType } = shared;

function normalizeJoinedLines(lines) {
  let out = "";
  for (const raw of lines) {
    const line = asString(raw).replace(/\n+$/g, "");
    if (!line.trim()) continue;
    if (out) out += "\n";
    out += line;
  }
  return out;
}

function extractUserMessageFromRequestNodes(nodes, fallback) {
  const joined = normalizeJoinedLines(
    asArray(nodes)
      .filter((n) => normalizeNodeType(n) === REQUEST_NODE_TEXT)
      .map((n) => asString(pick(pick(n, ["text_node", "textNode"]), ["content"])))
  );
  const fb = asString(fallback);
  return joined.trim() ? joined : fb;
}

function buildExchangeRenderCtx(ex) {
  const r = asRecord(ex);
  const requestMessage = asString(pick(r, ["request_message", "requestMessage"])) || "";
  const requestNodes = asArray(pick(r, ["request_nodes", "requestNodes"]));
  const responseNodes = asArray(pick(r, ["response_nodes", "responseNodes"]));

  const userMessageFromNodes = requestNodes
    .filter((n) => normalizeNodeType(n) === REQUEST_NODE_TEXT && pick(n, ["text_node", "textNode"]) != null)
    .map((n) => asString(pick(pick(n, ["text_node", "textNode"]), ["content"])))
    .join("\n");
  const userMessage = userMessageFromNodes || requestMessage;

  const toolResults = requestNodes
    .filter((n) => normalizeNodeType(n) === REQUEST_NODE_TOOL_RESULT && pick(n, ["tool_result_node", "toolResultNode"]) != null)
    .map((n) => asRecord(pick(n, ["tool_result_node", "toolResultNode"])))
    .filter((tr) => asString(pick(tr, ["tool_use_id", "toolUseId"])).trim())
    .map((tr) => ({ id: asString(pick(tr, ["tool_use_id", "toolUseId"])), content: asString(pick(tr, ["content"])), isError: Boolean(pick(tr, ["is_error", "isError"])) }));

  const thinking = responseNodes
    .filter((n) => normalizeNodeType(n) === RESPONSE_NODE_THINKING && pick(n, ["thinking", "thinking_node", "thinkingNode"]) != null)
    .map((n) => {
      const th = asRecord(pick(n, ["thinking", "thinking_node", "thinkingNode"]));
      return asString(pick(th, ["content", "summary"]));
    })
    .filter((s) => s.length > 0)
    .join("\n");

  const responseText = responseNodes
    .filter((n) => normalizeNodeType(n) === RESPONSE_NODE_RAW_RESPONSE)
    .map((n) => asString(pick(n, ["content"])))
    .join("\n");

  const toolUses = responseNodes
    .filter((n) => normalizeNodeType(n) === RESPONSE_NODE_TOOL_USE && pick(n, ["tool_use", "toolUse"]) != null)
    .map((n) => asRecord(pick(n, ["tool_use", "toolUse"])))
    .filter((tu) => asString(pick(tu, ["tool_use_id", "toolUseId"])).trim() && asString(pick(tu, ["tool_name", "toolName"])).trim())
    .map((tu) => ({ name: asString(pick(tu, ["tool_name", "toolName"])), id: asString(pick(tu, ["tool_use_id", "toolUseId"])), input: asString(pick(tu, ["input_json", "inputJson"])) }));

  return {
    user_message: userMessage,
    tool_results: toolResults,
    has_response: Boolean(thinking || responseText || toolUses.length),
    thinking,
    response_text: responseText,
    tool_uses: toolUses
  };
}

function renderExchangeFull(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const out = [];
  out.push("<exchange>");
  out.push("  <user_request_or_tool_results>");
  out.push(asString(c.user_message));
  for (const tr of asArray(c.tool_results)) {
    out.push(`    <tool_result tool_use_id="${asString(tr?.id)}" is_error="${tr?.isError ? "true" : "false"}">`);
    out.push(asString(tr?.content));
    out.push("    </tool_result>");
  }
  out.push("  </user_request_or_tool_results>");
  if (c.has_response) {
    out.push("  <agent_response_or_tool_uses>");
    if (asString(c.thinking)) {
      out.push("    <thinking>");
      out.push(asString(c.thinking));
      out.push("    </thinking>");
    }
    out.push(asString(c.response_text));
    for (const tu of asArray(c.tool_uses)) {
      out.push(`    <tool_use name="${asString(tu?.name)}" tool_use_id="${asString(tu?.id)}">`);
      out.push(asString(tu?.input));
      out.push("    </tool_use>");
    }
    out.push("  </agent_response_or_tool_uses>");
  }
  out.push("</exchange>");
  return out.join("\n").trim();
}

function replacePlaceholders(template, repl) {
  let out = asString(template);
  for (const [k, v] of Array.isArray(repl) ? repl : []) {
    if (!out.includes(k)) continue;
    out = out.split(k).join(asString(v));
  }
  return out;
}

function normalizeHistoryEndExchange(raw) {
  const r = asRecord(raw);
  return {
    request_message: asString(pick(r, ["request_message", "requestMessage"])),
    response_text: asString(pick(r, ["response_text", "responseText"])),
    request_nodes: asArray(pick(r, ["request_nodes", "requestNodes"])),
    response_nodes: asArray(pick(r, ["response_nodes", "responseNodes"]))
  };
}

function renderHistorySummaryNodeValue(v, extraToolResults) {
  const r = asRecord(v);
  const messageTemplate = asString(pick(r, ["message_template", "messageTemplate"]));
  if (!messageTemplate.trim()) return null;

  const summaryText = asString(pick(r, ["summary_text", "summaryText"]));
  const summarizationRequestId = asString(pick(r, ["summarization_request_id", "summarizationRequestId"]));
  const historyBeginningDroppedNumExchanges = Number(pick(r, ["history_beginning_dropped_num_exchanges", "historyBeginningDroppedNumExchanges"])) || 0;
  const historyMiddleAbridgedText = asString(pick(r, ["history_middle_abridged_text", "historyMiddleAbridgedText"]));
  const historyEnd = asArray(pick(r, ["history_end", "historyEnd"])).map(normalizeHistoryEndExchange);
  const extra = asArray(extraToolResults);
  if (extra.length) historyEnd.push({ request_message: "", response_text: "", request_nodes: extra, response_nodes: [] });

  const endPartFull = historyEnd.map(buildExchangeRenderCtx).map(renderExchangeFull).join("\n");
  const abridged = historyMiddleAbridgedText;

  return replacePlaceholders(messageTemplate, [
    ["{summary}", summaryText],
    ["{summarization_request_id}", summarizationRequestId],
    ["{beginning_part_dropped_num_exchanges}", String(historyBeginningDroppedNumExchanges)],
    ["{middle_part_abridged}", abridged],
    ["{end_part_full}", endPartFull],
  ]);
}

function hasHistorySummaryNode(nodes) {
  return asArray(nodes).some((n) => normalizeNodeType(n) === REQUEST_NODE_HISTORY_SUMMARY && pick(n, ["history_summary_node", "historySummaryNode"]) != null);
}

function chatHistoryItemHasSummary(item) {
  const it = asRecord(item);
  return hasHistorySummaryNode(pick(it, ["request_nodes", "requestNodes"])) || hasHistorySummaryNode(pick(it, ["structured_request_nodes", "structuredRequestNodes"])) || hasHistorySummaryNode(pick(it, ["nodes"]));
}

function extractHistorySummaryNodeFromNodes(nodes) {
  return asArray(nodes).find((n) => normalizeNodeType(n) === REQUEST_NODE_HISTORY_SUMMARY && pick(n, ["history_summary_node", "historySummaryNode"]) != null) || null;
}

function compactHistorySummaryExchange(exchange) {
  const ex = asRecord(exchange);
  const reqNodesAll = [...asArray(ex.request_nodes), ...asArray(ex.structured_request_nodes), ...asArray(ex.nodes)];
  const summaryNode = asRecord(extractHistorySummaryNodeFromNodes(reqNodesAll));
  const summaryValue = pick(summaryNode, ["history_summary_node", "historySummaryNode"]);
  if (!summaryValue) return exchange;

  const summaryId = Number(pick(summaryNode, ["id"])) || 0;
  const toolResults = reqNodesAll.filter((n) => normalizeNodeType(n) === REQUEST_NODE_TOOL_RESULT && pick(n, ["tool_result_node", "toolResultNode"]) != null);
  const otherNodes = reqNodesAll.filter((n) => {
    const t = normalizeNodeType(n);
    return t !== REQUEST_NODE_HISTORY_SUMMARY && t !== REQUEST_NODE_TOOL_RESULT;
  });

  const text = renderHistorySummaryNodeValue(summaryValue, toolResults);
  if (!text) return { ...exchange, request_nodes: otherNodes, structured_request_nodes: [], nodes: [] };

  const summaryTextNode = { id: summaryId, type: REQUEST_NODE_TEXT, content: "", text_node: { content: asString(text) } };
  return { ...exchange, request_nodes: [summaryTextNode, ...otherNodes], structured_request_nodes: [], nodes: [] };
}

function preprocessHistoryNew(exchanges) {
  const list = asArray(exchanges);
  if (!list.length) return list;

  let start = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (chatHistoryItemHasSummary(list[i])) { start = i; break; }
  }
  if (start === -1) return list;

  const out = list.slice(start);
  if (!out.length) return out;
  out[0] = compactHistorySummaryExchange(out[0]);
  return out;
}

function getChatHistoryAndRequestNodesForAPI(req) {
  const r = asRecord(req);
  const history = asArray(pick(r, ["chat_history", "chatHistory"]));
  const currentNodesAll = [...asArray(pick(r, ["nodes"])), ...asArray(pick(r, ["structured_request_nodes", "structuredRequestNodes"])), ...asArray(pick(r, ["request_nodes", "requestNodes"]))];

  const currentExchange = {
    request_id: "",
    request_message: "",
    response_text: "",
    request_nodes: currentNodesAll,
    structured_request_nodes: [],
    nodes: [],
    response_nodes: [],
    structured_output_nodes: []
  };

  const combined = history.concat([currentExchange]);
  const processed = preprocessHistoryNew(combined);
  if (!processed.length) return { processedHistory: history, processedRequestNodes: currentNodesAll };

  const last = asRecord(processed[processed.length - 1]);
  const processedRequestNodes = asArray(pick(last, ["request_nodes", "requestNodes"]));
  processed.pop();
  return { processedHistory: processed, processedRequestNodes: processedRequestNodes.length ? processedRequestNodes : currentNodesAll };
}

module.exports = { renderHistorySummaryNodeValue, preprocessHistoryNew, getChatHistoryAndRequestNodesForAPI };
