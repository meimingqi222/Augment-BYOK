"use strict";

const { normalizeString } = require("../infra/util");
const { fmtSection, fmtCodeSection, fmtJsonSection, extractDirectives, buildSystem, extractCodeContext } = require("./common");

function buildNextEditStreamPrompt(body) {
  const b = body && typeof body === "object" ? body : {};
  const directives = extractDirectives(b);
  const lang = normalizeString(b.lang);
  const path = normalizeString(b.path);
  const instruction = normalizeString(b.instruction) || "Propose the next code edit.";
  const { prefix, selectedText, suffix } = extractCodeContext(b);

  const mode = normalizeString(b.mode);
  const scope = normalizeString(b.scope);
  const diagnostics = b.diagnostics;
  const recentChanges = b.recent_changes ?? b.recentChanges;
  const blockedLocations = b.blocked_locations ?? b.blockedLocations;

  const system = buildSystem({
    purpose: "next-edit-stream",
    directives,
    outputConstraints:
      "Propose the next minimal edit.\n- Output ONLY the replacement code for the selected range\n- No markdown, no explanations\n- Do NOT wrap in ``` code fences"
  });

  const parts = [];
  if (instruction) parts.push(fmtSection("Instruction", instruction));
  if (path) parts.push(fmtSection("Path", path));
  if (lang) parts.push(fmtSection("Language", lang));
  if (mode) parts.push(fmtSection("Mode", mode));
  if (scope) parts.push(fmtSection("Scope", scope));
  if (Array.isArray(diagnostics) && diagnostics.length) parts.push(fmtJsonSection("Diagnostics", diagnostics, { maxChars: 12000 }));
  if (recentChanges != null) parts.push(fmtJsonSection("Recent Changes", recentChanges, { maxChars: 12000 }));
  if (blockedLocations != null) parts.push(fmtJsonSection("Blocked Locations", blockedLocations, { maxChars: 12000 }));
  if (prefix) parts.push(fmtCodeSection("Prefix", prefix, { lang }));
  if (selectedText) parts.push(fmtCodeSection("Selected (replace this)", selectedText, { lang }));
  if (suffix) parts.push(fmtCodeSection("Suffix", suffix, { lang }));

  const user = parts.filter(Boolean).join("\n\n").trim() || "Propose an edit.";
  return { system, messages: [{ role: "user", content: user }] };
}

module.exports = { buildNextEditStreamPrompt };
