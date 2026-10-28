import { useState } from "react";
import {
  Sparkles,
  Mountain,
  PersonStanding,
  MessageCircle,
  Smile,
  FileText,
  WandSparkles,
  Plus,
  Check,
  ArrowUpRight,
  Info,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import { modes, sample, samples } from "./data";
const icons = [
  Mountain,
  PersonStanding,
  MessageCircle,
  Smile,
  FileText,
  WandSparkles,
];
export default function Assistant({
  state,
  chapter,
  updateChapter,
  config,
  onError,
}) {
  const [tab, setTab] = useState("写作辅助"),
    [mode, setMode] = useState(modes[0]),
    [instruction, setInstruction] = useState(
      "增加雨夜港口的氛围感，保持克制的悬疑感",
    ),
    [result, setResult] = useState({
      text: sample,
      demo: true,
      mode: modes[0],
    }),
    [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      if (!config.ai) {
        setResult({ text: samples[mode], demo: true, mode });
        return;
      }
      const data = await api("/generate", {
        method: "POST",
        body: JSON.stringify({
          mode,
          instruction,
          chapter,
          events: state.events.filter((e) => chapter.eventIds.includes(e.id)),
          characters: state.characters,
        }),
      });
      setResult({ text: data.text, demo: false, mode });
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="assistant">
      <div className="assistant-heading">
        <Sparkles size={23} />
        <h2>灵感助手</h2>
        <span className="tiny-tag">{config.ai ? "通义千问" : "示例模式"}</span>
      </div>
      <div className="tabs">
        {["写作辅助", "章节事件"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "章节事件" && <small>{chapter.eventIds.length}</small>}
          </button>
        ))}
      </div>
      {tab === "写作辅助" ? (
        <>
          <div className="mode-grid">
            {modes.map((m, i) => {
              const Icon = icons[i];
              return (
                <button
                  key={m}
                  className={mode === m ? "selected" : ""}
                  onClick={() => setMode(m)}
                >
                  <Icon size={18} />
                  {m}
                </button>
              );
            })}
          </div>
          <label className="field-label" htmlFor="instruction">
            创作要求
          </label>
          <textarea
            id="instruction"
            className="prompt"
            value={instruction}
            maxLength={4000}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="告诉助手，你希望这一段如何发生…"
          />
          <div className="context-note">
            将参考本章正文、{chapter.eventIds.length} 个事件与{" "}
            {state.characters.length} 位角色
          </div>
          <button
            className="primary generate"
            onClick={generate}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}{" "}
            {busy ? "正在构思…" : config.ai ? "生成灵感" : "查看灵感示例"}
          </button>
          {result && (
            <div className="result">
              <div className="result-label">
                {result.mode} · {result.demo ? "示例" : "AI 生成"}
                <span>待你审阅</span>
              </div>
              <div className="result-text">{result.text}</div>
              <button
                className="outline full"
                onClick={() => {
                  updateChapter({
                    body:
                      chapter.body + (chapter.body ? "\n\n" : "") + result.text,
                  });
                  onError("已插入本章正文");
                }}
              >
                <Plus size={16} />
                插入正文
              </button>
            </div>
          )}
          <p className="helper-foot">
            <Info size={14} />
            {config.ai
              ? "AI 是你的搭档，故事由你决定。"
              : "当前展示预置示例，可在设置中查看接入方法。"}
          </p>
        </>
      ) : (
        <div className="chapter-events">
          <p className="muted">将事件关联到本章，让每一段情节都有来处。</p>
          {state.events.length ? (
            state.events.map((e) => {
              const linked = chapter.eventIds.includes(e.id);
              return (
                <article className="linked-event" key={e.id}>
                  <h3>{e.title}</h3>
                  <p>{e.content}</p>
                  <small>{e.source || "未标注来源"}</small>
                  <button
                    className={linked ? "outline full" : "primary full"}
                    onClick={() =>
                      updateChapter({
                        eventIds: linked
                          ? chapter.eventIds.filter((id) => id !== e.id)
                          : [...chapter.eventIds, e.id],
                      })
                    }
                  >
                    {linked ? <Check size={15} /> : <Plus size={15} />}{" "}
                    {linked ? "已关联 · 点击移除" : "关联到本章"}
                  </button>
                </article>
              );
            })
          ) : (
            <p>还没有事件，请先前往素材库添加。</p>
          )}
        </div>
      )}
    </aside>
  );
}
