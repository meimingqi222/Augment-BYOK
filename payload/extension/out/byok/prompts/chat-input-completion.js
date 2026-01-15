"use strict";

const { normalizeString } = require("../infra/util");
const { fmtSection, fmtCodeSection, buildSystem } = require("./common");

function buildChatInputCompletionPrompt(body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = typeof b.prompt === "string" ? b.prompt : "";
  const suffix = typeof b.suffix === "string" ? b.suffix : "";
  const path = normalizeString(b.path);

  const system = buildSystem({
    purpose: "chat-input-completion",
    directives: { userGuidelines: "", workspaceGuidelines: "", rulesText: "" },
    outputConstraints:
      "Continue the user's partial chat input.\n- Output ONLY the completion text (do not repeat the given prompt)\n- No quotes, no markdown\n- Do NOT wrap in ``` code fences"
  });

  const parts = [];
  if (path) parts.push(fmtSection("Path", path));
  if (prompt) parts.push(fmtCodeSection("Prompt", prompt));
  if (suffix) parts.push(fmtCodeSection("Suffix", suffix));

  const user = parts.filter(Boolean).join("\n\n").trim() || "Continue the text.";
  return { system, messages: [{ role: "user", content: user }] };
}

module.exports = { buildChatInputCompletionPrompt };
