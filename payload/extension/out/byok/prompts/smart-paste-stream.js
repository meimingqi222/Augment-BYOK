"use strict";

const { normalizeString } = require("../infra/util");
const { truncate, fmtSection, fmtCodeSection, historyToMessages, extractDirectives, buildSystem, extractCodeContext } = require("./common");

function buildSmartPasteStreamPrompt(body) {
  const b = body && typeof body === "object" ? body : {};
  const directives = extractDirectives(b);
  const lang = normalizeString(b.lang);
  const path = normalizeString(b.path);
  const instruction = normalizeString(b.instruction) || "Integrate the pasted code into the target context.";
  const codeBlock = typeof b.code_block === "string" ? b.code_block : "";
  const { prefix, selectedText, suffix, combined } = extractCodeContext(b);
  const targetFilePath = normalizeString(b.target_file_path ?? b.targetFilePath);
  const targetFileContent =
    typeof b.target_file_content === "string" ? b.target_file_content : (typeof b.targetFileContent === "string" ? b.targetFileContent : "");

  const system = buildSystem({
    purpose: "smart-paste-stream",
    directives,
    outputConstraints:
      "Integrate the pasted code into the target context.\n- Output ONLY the final code to replace the selected range\n- No markdown, no explanations\n- Do NOT wrap in ``` code fences"
  });

  const history = historyToMessages(b.chat_history ?? b.chatHistory, { maxItems: 8 });

  const parts = [];
  if (instruction) parts.push(fmtSection("Instruction", instruction));
  if (path) parts.push(fmtSection("Path", path));
  if (lang) parts.push(fmtSection("Language", lang));
  if (codeBlock) parts.push(fmtCodeSection("Pasted Code Block", codeBlock, { lang }));
  if (targetFilePath) parts.push(fmtSection("Target File Path", targetFilePath));
  if (!combined.trim() && targetFileContent) parts.push(fmtCodeSection("Target File Content (truncated)", truncate(targetFileContent, 12000), { lang }));
  if (prefix) parts.push(fmtCodeSection("Prefix", prefix, { lang }));
  if (selectedText) parts.push(fmtCodeSection("Selected (replace this)", selectedText, { lang }));
  if (suffix) parts.push(fmtCodeSection("Suffix", suffix, { lang }));

  const user = parts.filter(Boolean).join("\n\n").trim() || "Smart paste.";
  return { system, messages: [...history, { role: "user", content: user }] };
}

module.exports = { buildSmartPasteStreamPrompt };
