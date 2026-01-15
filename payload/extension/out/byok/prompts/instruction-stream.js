"use strict";

const { normalizeString } = require("../infra/util");
const { fmtSection, fmtCodeSection, historyToMessages, extractDirectives, buildSystem, extractCodeContext } = require("./common");

function buildInstructionStreamPrompt(body) {
  const b = body && typeof body === "object" ? body : {};
  const directives = extractDirectives(b);
  const lang = normalizeString(b.lang);
  const path = normalizeString(b.path);
  const instruction = normalizeString(b.instruction);
  const { prefix, selectedText, suffix } = extractCodeContext(b);

  const system = buildSystem({
    purpose: "instruction-stream",
    directives,
    outputConstraints:
      "Output ONLY the final replacement code for the selected range.\n- No markdown, no explanations\n- Do NOT wrap in ``` code fences\n- Stream plain code text only"
  });

  const history = historyToMessages(b.chat_history ?? b.chatHistory, { maxItems: 10 });

  const parts = [];
  if (instruction) parts.push(fmtSection("Instruction", instruction));
  if (path) parts.push(fmtSection("Path", path));
  if (lang) parts.push(fmtSection("Language", lang));
  if (prefix) parts.push(fmtCodeSection("Prefix", prefix, { lang }));
  if (selectedText) parts.push(fmtCodeSection("Selected (replace this)", selectedText, { lang }));
  if (suffix) parts.push(fmtCodeSection("Suffix", suffix, { lang }));

  const user = parts.filter(Boolean).join("\n\n").trim() || "Generate replacement code.";
  return { system, messages: [...history, { role: "user", content: user }] };
}

module.exports = { buildInstructionStreamPrompt };
