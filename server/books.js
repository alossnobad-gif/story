import { randomUUID } from "node:crypto";
import { validateState } from "./core.js";

export class BookError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new BookError(status, message);
};
function metadata(state) {
  return [
    state.title.trim() || "未命名作品",
    state.genre || "",
    state.description || "",
    state.cover || "forest",
    state.chapters.reduce((n, c) => n + c.body.replace(/\s/g, "").length, 0),
    state.chapters.length,
  ];
}
function validateMetadata(value) {
  return (
    value &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.trim().length <= 200 &&
    typeof value.genre === "string" &&
    value.genre.length <= 100 &&
    typeof value.description === "string" &&
    value.description.length <= 4000 &&
    ["forest", "clay", "ink", "sand"].includes(value.cover)
  );
}
export function createBookStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL,
    title TEXT NOT NULL, genre TEXT NOT NULL, description TEXT NOT NULL, cover TEXT NOT NULL,
    words INTEGER NOT NULL, chapter_count INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  ); CREATE TABLE IF NOT EXISTS story_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const columns =
    "id,revision,title,genre,description,cover,words,chapter_count AS chapterCount,created_at AS createdAt,updated_at AS updatedAt,deleted_at AS deletedAt";
  function insert(id, state, revision = 1) {
    if (!validateState(state)) fail(400, "作品格式不正确");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books(id,revision,body,title,genre,description,cover,words,chapter_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, revision, JSON.stringify(state), ...metadata(state), now, now);
    return get(id);
  }
  function get(id, trash = false) {
    const row = db
      .prepare(`SELECT revision,body,deleted_at FROM books WHERE id=?`)
      .get(id);
    if (!row || !!row.deleted_at !== trash)
      fail(
        404,
        trash ? "回收站中没有这部作品" : "作品不存在或已移入回收站，请返回书架",
      );
    return { id, revision: row.revision, state: JSON.parse(row.body) };
  }
  function write(id, state, revision) {
    if (!validateState(state) || !Number.isInteger(revision))
      fail(400, "作品格式或版本号不正确");
    const result = db
      .prepare(
        `UPDATE books SET revision=revision+1,body=?,title=?,genre=?,description=?,cover=?,words=?,chapter_count=?,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL`,
      )
      .run(
        JSON.stringify(state),
        ...metadata(state),
        new Date().toISOString(),
        id,
        revision,
      );
    if (!result.changes) {
      get(id);
      fail(409, "这部作品已被其他窗口修改，请先导出当前内容，再刷新页面");
    }
    return { revision: revision + 1 };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db.prepare("SELECT value FROM story_meta WHERE key='books_v1'").get()
    ) {
      const legacy = db
        .prepare("SELECT revision,body FROM workspace WHERE id=1")
        .get();
      if (legacy) insert("legacy", JSON.parse(legacy.body), legacy.revision);
      db.prepare(
        "INSERT INTO story_meta(key,value) VALUES('books_v1','done')",
      ).run();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    get,
    write,
    list(trash = false) {
      return db
        .prepare(
          `SELECT ${columns} FROM books WHERE deleted_at IS ${trash ? "NOT " : ""}NULL ORDER BY updated_at DESC,id`,
        )
        .all();
    },
    create(value) {
      if (!validateMetadata(value))
        fail(400, "请填写作品名称、题材、简介并选择封面颜色");
      if (
        db
          .prepare("SELECT COUNT(*) AS n FROM books WHERE deleted_at IS NULL")
          .get().n >= 200
      )
        fail(400, "书架最多同时保存 200 部作品");
      return insert(randomUUID(), {
        title: value.title.trim(),
        genre: value.genre,
        description: value.description,
        cover: value.cover,
        goal: 3000,
        chapters: [
          {
            id: randomUUID(),
            title: "第一章",
            body: "",
            summary: "",
            eventIds: [],
          },
        ],
        events: [],
        characters: [],
      });
    },
    edit(id, value, revision) {
      if (!validateMetadata(value)) fail(400, "作品信息不正确");
      const current = get(id);
      return write(
        id,
        {
          ...current.state,
          title: value.title.trim(),
          genre: value.genre,
          description: value.description,
          cover: value.cover,
        },
        revision,
      );
    },
    move(id, revision, restore = false) {
      if (!Number.isInteger(revision)) fail(400, "需要作品版本号");
      if (
        restore &&
        db
          .prepare("SELECT COUNT(*) AS n FROM books WHERE deleted_at IS NULL")
          .get().n >= 200
      )
        fail(400, "书架已满，请先移出一部作品再恢复");
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `UPDATE books SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted_at IS ${restore ? "NOT " : ""}NULL`,
        )
        .run(restore ? null : now, now, id, revision);
      if (!result.changes) {
        get(id, restore);
        fail(409, "作品已在其他窗口更新，请刷新书架后再操作");
      }
      return { revision: revision + 1 };
    },
  };
}
