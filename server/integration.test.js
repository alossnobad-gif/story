import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("authenticated persistence, stale-write protection and real provider request path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "story-test-"));
  let received;
  const provider = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      received = {
        path: req.url,
        body: JSON.parse(text),
        auth: req.headers.authorization,
      };
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: "模拟服务商返回的对白。" } }],
        }),
      );
    });
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const port = 19000 + Math.floor(Math.random() * 10000);
  const password = "integration-test-password";
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      NODE_ENV: "production",
      TRUST_PROXY: "true",
      APP_PASSWORD: password,
      AI_API_KEY: "test-only-not-a-real-key",
      AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
    },
    stdio: "pipe",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready = (await fetch(base + "/api/health")).ok;
        if (ready) break;
      } catch {}
      await delay(100);
    }
    assert.equal(ready, true, "server starts");
    assert.equal((await fetch(base + "/api/workspace")).status, 401);
    const wrong = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assert.equal(wrong.status, 401);
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0],
      headers = { "Content-Type": "application/json", Cookie: cookie };
    const created = await fetch(base + "/api/books", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "测试作品",
        genre: "悬疑",
        description: "测试简介",
        cover: "forest",
      }),
    });
    assert.equal(created.status, 201);
    const book = await created.json();
    const bookPath = base + "/api/books/" + book.id;
    const state = {
      title: "测试作品",
      chapters: [
        {
          id: "c1",
          title: "第一章",
          body: "她推开了门。",
          summary: "相遇",
          eventIds: ["e1"],
        },
      ],
      events: [
        { id: "e1", title: "重逢", content: "与旧友重逢", source: "原创" },
      ],
      characters: [{ id: "p1", name: "林晚", description: "沉默" }],
    };
    const put = await fetch(bookPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({ state, revision: 1 }),
    });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).revision, 2);
    const persisted = await (await fetch(bookPath, { headers })).json();
    assert.deepEqual(persisted.state, state);
    assert.equal(
      (
        await fetch(bookPath, {
          method: "PUT",
          headers,
          body: JSON.stringify({ state, revision: 1 }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(bookPath, {
          method: "PUT",
          headers: { ...headers, Origin: "https://untrusted.example" },
          body: JSON.stringify({ state, revision: 2 }),
        })
      ).status,
      403,
    );
    // Node fetch normalizes Host; raw HTTP models Nginx forwarding exactly.
    const proxied = await new Promise((resolve, reject) => {
      const request = httpRequest(
        bookPath,
        {
          method: "PUT",
          headers: {
            ...headers,
            Host: "123.57.60.66:8443",
            "X-Forwarded-Proto": "https",
            Origin: "https://123.57.60.66:8443",
          },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({ status: response.statusCode, body: JSON.parse(body) }),
          );
        },
      );
      request.on("error", reject);
      request.end(JSON.stringify({ state, revision: 2 }));
    });
    assert.equal(
      proxied.status,
      200,
      "HTTPS writes preserve custom port in Host",
    );
    assert.equal(proxied.body.revision, 3);
    const gen = await fetch(base + "/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "人物对白",
        instruction: "克制",
        chapter: state.chapters[0],
        events: state.events,
        characters: state.characters,
      }),
    });
    assert.equal(gen.status, 200);
    assert.equal((await gen.json()).text, "模拟服务商返回的对白。");
    assert.equal(received.path, "/v1/chat/completions");
    assert.equal(received.body.model, "qwen-plus");
    assert.equal(received.auth, "Bearer test-only-not-a-real-key");
    assert.match(received.body.messages[1].content, /重逢/);
    await fetch(base + "/api/logout", { method: "POST", headers });
    assert.equal((await fetch(bookPath, { headers })).status, 401);
  } finally {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    await new Promise((r) => provider.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
