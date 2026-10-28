import test from "node:test";
import assert from "node:assert/strict";
import { validateState, buildMessages } from "./core.js";
const state = {
  title: "作品",
  chapters: [
    { id: "1", title: "第一章", body: "正文", summary: "相遇", eventIds: [] },
  ],
  events: [],
  characters: [],
};
test("workspace validation rejects malformed chapters and duplicate IDs", () => {
  assert.equal(validateState(state), true);
  assert.equal(
    validateState({ ...state, chapters: [{ title: "缺少正文" }] }),
    false,
  );
  assert.equal(
    validateState({
      ...state,
      chapters: [...state.chapters, ...state.chapters],
    }),
    false,
  );
});
test("AI context includes chapter, linked events and characters, bounds prose length", () => {
  const messages = buildMessages({
    mode: "人物对白",
    instruction: "克制",
    chapter: { ...state.chapters[0], body: "文".repeat(20000) },
    events: [{ title: "重逢" }],
    characters: [{ name: "林晚" }],
  });
  const context = JSON.parse(messages[1].content);
  assert.equal(context.章节.正文.length, 14000);
  assert.equal(context.本章事件[0].标题, "重逢");
  assert.equal(context.人物设定[0].姓名, "林晚");
  assert.match(messages[0].content, /对白/);
});
