import { useRef } from "react";
import { Shield, Download, Plus, Trash2 } from "lucide-react";
import { validateState } from "../server/core";
import { download, uid } from "./data";
export function SettingsPage({ config, state, setState, onNotify }) {
  const restore = useRef();
  async function restoreBackup(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return onNotify("备份超过 8MB，无法恢复");
    try {
      const next = JSON.parse(await f.text());
      if (!validateState(next) || !next.chapters.length)
        throw Error("不是有效的完整作品备份");
      if (
        confirm(
          "恢复将替换当前作品、章节、事件和角色。请先下载当前备份，是否继续？",
        )
      ) {
        setState(next);
        onNotify("备份已载入，正在保存到服务器");
      }
    } catch (e) {
      onNotify(e.message || "备份读取失败");
    }
  }
  return (
    <section className="page-content settings-page">
      <div className="page-title">
        <div>
          <span className="overline">属于你的创作空间</span>
          <h1>工作室设置</h1>
          <p>让工具适应你的写作习惯。</p>
        </div>
      </div>
      <h2>作品信息</h2>
      <label>
        作品名称
        <input
          value={state.title}
          maxLength={200}
          onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
        />
      </label>
      <label>
        题材与形式
        <input
          value={state.genre || ""}
          maxLength={100}
          onChange={(e) => setState((s) => ({ ...s, genre: e.target.value }))}
        />
      </label>
      <label>
        作品字数目标
        <input
          type="number"
          min="100"
          max="10000000"
          value={state.goal || 3000}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              goal: Math.max(100, Number(e.target.value)),
            }))
          }
        />
      </label>
      <h2>通义千问 · AI 创作助手</h2>
      <div className="info-band">
        <Shield size={20} />
        <div>
          {config.ai
            ? "已检测到 AI 配置，请通过实际生成验证"
            : "尚未配置，当前为示例模式"}
          <br />
          <small>
            模型：{config.model} · 密钥仅保存在服务器，不会发送给浏览器。
          </small>
        </div>
      </div>
      <p className="muted">
        在服务器 .env 文件中设置 AI_API_KEY，默认使用中国内地百炼接口和
        qwen-plus。修改后重启服务。国际地域需要同步修改 AI_BASE_URL。
      </p>
      <p className="muted">
        生成时会将本章正文末尾、关联事件和角色设定发送到所配置的模型服务。请在确认服务商数据政策后使用。
      </p>
      <h2>备份与数据</h2>
      <p className="muted">
        作品自动保存在服务器 SQLite 数据库。JSON
        包含全部章节、事件和角色，可用于备份。请同时定期备份服务器 data 目录。
      </p>
      <button
        className="outline"
        onClick={() =>
          download(
            `${state.title}-完整备份.json`,
            JSON.stringify(state, null, 2),
            "application/json",
          )
        }
      >
        <Download size={16} />
        下载完整备份
      </button>{" "}
      <button className="outline" onClick={() => restore.current.click()}>
        恢复 JSON 备份
      </button>
      <input
        ref={restore}
        type="file"
        accept=".json"
        hidden
        onChange={restoreBackup}
      />
    </section>
  );
}
export function Characters({ state, setState }) {
  return (
    <section className="page-content">
      <div className="page-title">
        <div>
          <span className="overline">每个人，都有自己的故事</span>
          <h1>角色档案</h1>
          <p>角色设定会随章节一起提供给 AI，帮助保持人物一致。</p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setState((s) => ({
              ...s,
              characters: [
                ...s.characters,
                { id: uid(), name: "未命名角色", description: "" },
              ],
            }))
          }
        >
          <Plus size={17} />
          新建角色
        </button>
      </div>
      {state.characters.map((c) => (
        <div className="character" key={c.id}>
          <div className="avatar">{c.name.slice(0, 1)}</div>
          <div>
            <input
              aria-label="角色姓名"
              className="character-name"
              value={c.name}
              maxLength={200}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  characters: s.characters.map((p) =>
                    p.id === c.id ? { ...p, name: e.target.value } : p,
                  ),
                }))
              }
            />
            <textarea
              aria-label={`${c.name}的人物设定`}
              rows={4}
              placeholder="身份、动机、秘密、语言习惯…"
              value={c.description}
              maxLength={20000}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  characters: s.characters.map((p) =>
                    p.id === c.id ? { ...p, description: e.target.value } : p,
                  ),
                }))
              }
            />
            <button
              className="text-button"
              onClick={() => {
                if (confirm("删除这个角色？"))
                  setState((s) => ({
                    ...s,
                    characters: s.characters.filter((p) => p.id !== c.id),
                  }));
              }}
            >
              <Trash2 size={14} />
              删除角色
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
