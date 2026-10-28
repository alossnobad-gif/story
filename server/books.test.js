import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createBookStore } from "./books.js";
const legacy = {
  title: "不能丢失的原稿",
  genre: "悬疑",
  goal: 3000,
  chapters: [
    {
      id: "c1",
      title: "第一章",
      body: "原有正文，不可覆盖。",
      summary: "梗概",
      eventIds: ["e1"],
    },
  ],
  events: [
    { id: "e1", title: "旧事件", content: "旧的情节素材", source: "原创" },
  ],
  characters: [{ id: "p1", name: "旧角色", description: "设定" }],
};
function setup(old) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE workspace(id INTEGER PRIMARY KEY,revision INTEGER,body TEXT)",
  );
  if (old)
    db.prepare("INSERT INTO workspace VALUES(1,7,?)").run(JSON.stringify(old));
  return { db, store: createBookStore(db) };
}
const info = (title) => ({
  title,
  genre: "奇幻",
  description: "简介",
  cover: "clay",
});
test("legacy migration is lossless, runs once, and retains original row for rollback", () => {
  const { db, store } = setup(legacy);
  assert.deepEqual(store.get("legacy"), {
    id: "legacy",
    revision: 7,
    state: legacy,
  });
  assert.equal(store.list().length, 1);
  assert.deepEqual(
    JSON.parse(db.prepare("SELECT body FROM workspace").get().body),
    legacy,
  );
  store.move("legacy", 7);
  assert.equal(createBookStore(db).list().length, 0);
  assert.equal(createBookStore(db).list(true).length, 1);
  db.close();
});
test("books isolate chapter, event, character and revision writes; stale updates do not overwrite", () => {
  const { db, store } = setup();
  const a = store.create(info("甲书")),
    b = store.create(info("乙书"));
  const aState = { ...legacy, title: "甲书" };
  store.write(a.id, aState, 1);
  assert.deepEqual(store.get(a.id).state, aState);
  assert.deepEqual(store.get(b.id), b);
  assert.throws(() => store.write(a.id, { ...aState, title: "过期覆盖" }, 1), {
    status: 409,
  });
  assert.equal(store.get(a.id).state.title, "甲书");
  store.edit(b.id, info("乙书新名"), 1);
  assert.equal(store.get(b.id).state.title, "乙书新名");
  assert.deepEqual(store.get(a.id).state, aState);
  assert.equal(
    store.list().find((x) => x.id === a.id).words,
    legacy.chapters[0].body.length,
  );
  db.close();
});
test("trash preserves all content, prevents stale writes and restores only the selected book", () => {
  const { db, store } = setup();
  const a = store.create(info("甲书")),
    b = store.create(info("乙书"));
  store.write(a.id, legacy, 1);
  store.move(a.id, 2);
  assert.equal(store.list().length, 1);
  assert.equal(store.list(true).length, 1);
  assert.throws(() => store.get(a.id), { status: 404 });
  assert.throws(() => store.write(a.id, legacy, 2), { status: 404 });
  assert.throws(() => store.move(a.id, 2, true), { status: 409 });
  store.move(a.id, 3, true);
  assert.deepEqual(store.get(a.id).state, legacy);
  assert.equal(store.get(a.id).revision, 4);
  assert.deepEqual(store.get(b.id), b);
  assert.equal(store.list().length, 2);
  db.close();
});
