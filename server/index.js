import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { MODES, validateState, buildMessages } from "./core.js";
const app = express(),
  port = Number(process.env.PORT || 3001),
  prod = process.env.NODE_ENV === "production";
const password = process.env.APP_PASSWORD || "";
if (prod && password.length < 12)
  throw new Error("Production requires APP_PASSWORD of at least 12 characters");
const hash = (x) => createHash("sha256").update(x).digest();
const dir = resolve(process.env.DATA_DIR || "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(resolve(dir, "story.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)",
);
const sessions = new Map(),
  failures = new Map();
let generating = false;
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  });
  next();
});
const revisionFile = resolve("REVISION");
const revision = existsSync(revisionFile)
  ? readFileSync(revisionFile, "utf8").trim()
  : "development";
app.get("/api/health", (_, res) => res.json({ ok: true, revision }));
app.get("/api/session", (req, res) =>
  res.json({
    authenticated: !password || validSession(req),
    protected: !!password,
  }),
);
function validSession(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("story_session="))
    ?.slice(14);
  const exp = sessions.get(token);
  return exp && exp > Date.now();
}
app.post("/api/login", (req, res) => {
  const ip = req.ip,
    f = failures.get(ip);
  if (f && f.until > Date.now() && f.count >= 10)
    return res.status(429).json({ error: "尝试过于频繁，请 15 分钟后再试" });
  if (
    typeof req.body.password !== "string" ||
    !password ||
    !timingSafeEqual(hash(req.body.password), hash(password))
  ) {
    failures.set(ip, {
      count: (f && f.until > Date.now() ? f.count : 0) + 1,
      until: Date.now() + 900000,
    });
    return res.status(401).json({ error: "密码不正确" });
  }
  failures.delete(ip);
  for (const [t, e] of sessions) if (e < Date.now()) sessions.delete(t);
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 7 * 86400000);
  res.cookie("story_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 86400000,
  });
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.get("host")}`
  )
    return res.status(403).json({ error: "来源不允许" });
  if (password && !validSession(req))
    return res.status(401).json({ error: "请先登录" });
  res.set("Cache-Control", "no-store");
  next();
});
app.post("/api/logout", (req, res) => {
  const token = (req.headers.cookie || "").match(/story_session=([^;]+)/)?.[1];
  sessions.delete(token);
  res.clearCookie("story_session");
  res.json({ ok: true });
});
app.get("/api/config", (_, res) =>
  res.json({
    ai: !!process.env.AI_API_KEY,
    model: process.env.AI_MODEL || "qwen-plus",
  }),
);
app.get("/api/workspace", (_, res) => {
  const row = db
    .prepare("SELECT revision,body FROM workspace WHERE id=1")
    .get();
  res.json(
    row
      ? { revision: row.revision, state: JSON.parse(row.body) }
      : { revision: 0, state: null },
  );
});
app.put("/api/workspace", (req, res) => {
  const { state, revision } = req.body;
  if (!validateState(state) || !Number.isInteger(revision))
    return res.status(400).json({ error: "作品格式不正确" });
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT revision FROM workspace WHERE id=1").get();
    if ((row?.revision || 0) !== revision) {
      db.exec("ROLLBACK");
      return res
        .status(409)
        .json({ error: "其他窗口已更新作品，请先导出当前内容，再刷新页面" });
    }
    db.prepare(
      "INSERT INTO workspace(id,revision,body) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body",
    ).run(revision + 1, JSON.stringify(state));
    db.exec("COMMIT");
    res.json({ revision: revision + 1 });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});
app.post("/api/generate", async (req, res) => {
  const {
    mode,
    instruction = "",
    chapter,
    events = [],
    characters = [],
  } = req.body;
  if (
    !MODES[mode] ||
    typeof instruction !== "string" ||
    instruction.length > 4000 ||
    !chapter ||
    typeof chapter.title !== "string" ||
    typeof chapter.body !== "string" ||
    typeof chapter.summary !== "string" ||
    !Array.isArray(events) ||
    !Array.isArray(characters)
  )
    return res.status(400).json({ error: "生成参数无效" });
  if (!process.env.AI_API_KEY)
    return res
      .status(503)
      .json({ error: "尚未配置通义千问密钥，当前只能查看示例" });
  if (generating)
    return res.status(429).json({ error: "上一项生成尚未完成，请稍后重试" });
  generating = true;
  try {
    const base = (
      process.env.AI_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "qwen-plus",
        messages: buildMessages({
          mode,
          instruction,
          chapter,
          events: events.slice(0, 20),
          characters: characters.slice(0, 30),
        }),
        max_tokens: 1800,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok)
      return res.status(502).json({
        error: `模型服务返回 ${response.status}，请检查服务器上的密钥、地域、模型名称或余额`,
      });
    const data = await response.json(),
      text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim())
      throw new Error("Empty result");
    res.json({ text, model: process.env.AI_MODEL || "qwen-plus" });
  } catch {
    return res
      .status(502)
      .json({ error: "生成失败或超时，请检查服务器网络和模型配置后重试" });
  } finally {
    generating = false;
  }
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
app.use((err, req, res, next) => {
  console.error("Request failed:", err.name);
  res.status(err.status === 413 ? 413 : 500).json({
    error:
      err.status === 413
        ? "作品体积超过 8MB，请分卷管理"
        : "服务器处理失败，请稍后重试",
  });
});
app.listen(port, process.env.HOST || (prod ? "0.0.0.0" : "127.0.0.1"), () =>
  console.log(
    `Story server listening on ${port}; AI ${process.env.AI_API_KEY ? "configured" : "demo"}; login ${password ? "enabled" : "local only"}`,
  ),
);
