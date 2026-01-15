"use strict";

const { fmtSection, fmtCodeSection, fmtJsonSection, buildSystem } = require("./common");

function buildCommitMessageStreamPrompt(body) {
  const b = body && typeof body === "object" ? body : {};
  const diff = typeof b.diff === "string" ? b.diff : "";
  const stats = b.changed_file_stats ?? b.changedFileStats;
  const relevant = b.relevant_commit_messages ?? b.relevantCommitMessages;
  const examples = b.example_commit_messages ?? b.exampleCommitMessages;

  const system = buildSystem({
    purpose: "generate-commit-message-stream",
    directives: { userGuidelines: "", workspaceGuidelines: "", rulesText: "" },
    outputConstraints:
      "Generate ONE concise git commit message subject line.\n- Output ONLY the subject line\n- No quotes, no trailing period\n- Do NOT wrap in ``` code fences"
  });

  const parts = [];
  if (diff) parts.push(fmtCodeSection("Diff", diff, { lang: "diff" }));
  if (stats && typeof stats === "object") parts.push(fmtJsonSection("Changed File Stats", stats, { maxChars: 6000 }));
  if (relevant != null) parts.push(fmtJsonSection("Relevant Commit Messages", relevant, { maxChars: 6000 }));
  if (examples != null) parts.push(fmtJsonSection("Example Commit Messages", examples, { maxChars: 6000 }));
  const user = parts.filter(Boolean).join("\n\n").trim() || "Generate a commit message for an empty diff.";
  return { system, messages: [{ role: "user", content: user }] };
}

module.exports = { buildCommitMessageStreamPrompt };
