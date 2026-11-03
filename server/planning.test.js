import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanMessages,
  parsePlan,
  validPlanInput,
  validPlan,
} from "./planning.js";
import { validateState, buildMessages } from "./core.js";
const plan = {
  synopsis: "寻找父亲的过程",
  timeline: "十年前失踪；今天收到线索",
  questions: "结局是否团圆？",
  chapters: [
    { title: "来信", time: "今天", summary: "主角收到线索，决定出发。" },
  ],
};
test("planning respects relative dates and exact chapter count, rejects malformed provider output", () => {
  const input = {
    ideas: "寻找失踪父亲",
    timeline: "十年前失踪，今天出发",
    chapterCount: 1,
  };
  assert.equal(validPlanInput(input), true);
  assert.equal(validPlanInput({ ...input, ideas: "  " }), false);
  assert.equal(validPlanInput({ ...input, chapterCount: 13 }), false);
  const messages = buildPlanMessages(input);
  assert.match(messages[1].content, /十年前失踪/);
  assert.match(messages[0].content, /相对时间/);
  assert.deepEqual(
    parsePlan("```json\n" + JSON.stringify(plan) + "\n```", 1),
    plan,
  );
  for (const raw of [
    "not json",
    JSON.stringify({ ...plan, chapters: [] }),
    JSON.stringify({ ...plan, chapters: [{ title: "丢失梗概" }] }),
    JSON.stringify({ ...plan, synopsis: "a".repeat(6001) }),
  ]) {
    assert.throws(() => parsePlan(raw, 1));
  }
  assert.throws(() => parsePlan(JSON.stringify(plan), 2));
});
test("legacy and planning books validate, corrupted planning backups are rejected", () => {
  const state = {
    title: "书",
    chapters: [
      {
        id: "original",
        title: "原章",
        summary: "已有梗概",
        body: "已有正文",
        eventIds: [],
      },
    ],
    events: [],
    characters: [],
  };
  assert.equal(validateState(state), true);
  const planning = {
    ideas: "念头",
    timeline: "第二天",
    chapterCount: 1,
    proposal: plan,
    demo: false,
    applied: false,
  };
  assert.equal(validateState({ ...state, planning }), true);
  const partial = {
    ...plan,
    synopsis: "",
    chapters: [{ ...plan.chapters[0], title: "" }],
  };
  assert.equal(
    validateState({ ...state, planning: { ...planning, proposal: partial } }),
    true,
    "unfinished edits can autosave",
  );
  assert.equal(
    validPlan(partial),
    false,
    "unfinished drafts cannot be adopted",
  );
  assert.equal(
    validateState({
      ...state,
      planning: { ...planning, proposal: { ...plan, chapters: [] } },
    }),
    false,
  );
  assert.equal(validateState({ ...state, planning: null }), false);
  const context = buildMessages({
    mode: "根据梗概写正文",
    chapter: state.chapters[0],
    instruction: "",
    events: [],
    characters: [],
  });
  assert.match(context[0].content, /扩写成连贯的小说正文/);
  assert.equal(JSON.parse(context[1].content).章节.梗概, "已有梗概");
});
