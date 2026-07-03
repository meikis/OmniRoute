import test from "node:test";
import assert from "node:assert/strict";

// Regression guard for #6026 — Antigravity IDE (via AgentBridge/MITM) can ship a
// history whose FIRST message already carries a `tool_result` with no preceding
// `tool_use`. Anthropic (Claude on Vertex, behind Antigravity) rejects it with:
//   "messages.0.content.1: unexpected `tool_use_id` found in `tool_result` blocks:
//    toolu_...  Each `tool_result` block must have a corresponding `tool_use`
//    block in the previous message."
// AntigravityExecutor overrides BaseExecutor.execute(), so the base tool-pair
// guard never ran on this path. sanitizeAntigravityToolMessages() now strips the
// orphan before the upstream send.

const { sanitizeAntigravityToolMessages } = await import(
  "../../open-sse/executors/antigravity.ts"
);

test("#6026 strips an orphan tool_result at messages[0] (no preceding tool_use)", () => {
  const body = {
    model: "claude-opus-4.6",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "hi" },
          { type: "tool_result", tool_use_id: "toolu_vrtx_01N328k3yLh8R81CwtsUGipm", content: "x" },
        ],
      },
    ],
  };
  const out = sanitizeAntigravityToolMessages(body);
  const first = (out.messages as any[])[0];
  // The orphan tool_result must be gone; the plain text block stays.
  const hasOrphan = Array.isArray(first?.content)
    ? first.content.some((b: any) => b.type === "tool_result")
    : false;
  assert.equal(hasOrphan, false, "orphan tool_result must be stripped");
  assert.ok(
    first.content.some((b: any) => b.type === "text"),
    "the real text block is preserved"
  );
});

test("#6026 preserves a VALID tool_use → tool_result pair", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_ok", name: "read", input: {} }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_ok", content: "done" }],
      },
    ],
  };
  const out = sanitizeAntigravityToolMessages(body);
  const msgs = out.messages as any[];
  assert.ok(
    msgs.some(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content.some((b: any) => b.type === "tool_result" && b.tool_use_id === "toolu_ok")
    ),
    "a matched tool_result must be preserved"
  );
});

test("#6026 is a no-op on bodies without a messages array", () => {
  const noMsgs = { model: "x" };
  assert.equal(sanitizeAntigravityToolMessages(noMsgs), noMsgs);
  const badMsgs = { messages: "not-an-array" } as unknown as Record<string, unknown>;
  assert.equal(sanitizeAntigravityToolMessages(badMsgs), badMsgs);
});
