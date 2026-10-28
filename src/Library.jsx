import { useRef, useState } from "react";
import {
  Plus,
  Upload,
  Search,
  ArrowUpRight,
  Trash2,
  Check,
  BookOpen,
} from "lucide-react";
import { uid, download } from "./data";
export default function Library({ state, setState, chapter, onNotify }) {
  const [search, setSearch] = useState(""),
    [form, setForm] = useState(null);
  const file = useRef();
  function add(e) {
    e.preventDefault();
    setState((s) => ({ ...s, events: [...s.events, { id: uid(), ...form }] }));
    setForm(null);
    onNotify("事件已收入素材库");
  }
  async function importFile(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return onNotify("导入文件不能超过 2MB");
    try {
      const text = await f.text();
      let items;
      if (f.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        items = Array.isArray(parsed) ? parsed : parsed.events;
        if (!Array.isArray(items))
          throw Error("JSON 需要是事件数组，或包含 events 数组");
        items = items.map((x) => {
          if (
            typeof x.title !== "string" ||
            typeof x.content !== "string" ||
            !x.title.trim() ||
            x.content.length > 20000
          )
            throw Error("每个事件需要 title 和 content 字段");
          return {
            id: uid(),
            title: x.title.slice(0, 200),
            content: x.content,
            source:
              typeof x.source === "string" ? x.source.slice(0, 1000) : f.name,
          };
        });
      } else {
        items = text
          .split(/\n\s*---\s*\n/)
          .filter((x) => x.trim())
          .map((x) => ({
            id: uid(),
            title: x
              .trim()
              .split("\n")[0]
              .replace(/^#+\s*/, "")
              .slice(0, 200),
            content: x.trim().slice(0, 20000),
            source: f.name,
          }));
      }
      if (!items.length || items.length + state.events.length > 2000)
        throw Error("事件数量应为 1–2000 条");
      setState((s) => ({ ...s, events: [...s.events, ...items] }));
      onNotify(`已导入 ${items.length} 个事件，请确认素材授权与来源`);
    } catch (err) {
      onNotify(err.message || "导入失败");
    }
  }
  function link(id) {
    const linked = chapter.eventIds.includes(id);
    setState((s) => ({
      ...s,
      chapters: s.chapters.map((c) =>
        c.id === chapter.id
          ? {
              ...c,
              eventIds: linked
                ? c.eventIds.filter((x) => x !== id)
                : [...c.eventIds, id],
            }
          : c,
      ),
    }));
    onNotify(linked ? "已解除关联" : "事件已关联到当前章节");
  }
  return (
    <section className="page-content">
      <div className="page-title">
        <div>
          <span className="overline">让灵感有迹可循</span>
          <h1>事件素材库</h1>
          <p>收藏故事的种子，重新长成你的情节。</p>
        </div>
        <button
          className="primary"
          onClick={() => setForm({ title: "", content: "", source: "" })}
        >
          <Plus size={17} />
          新建事件
        </button>
      </div>
      <div className="library-tools">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="搜索事件"
            placeholder="搜索事件、情节或来源"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="outline" onClick={() => file.current.click()}>
          <Upload size={16} />
          导入素材
        </button>
        <button
          className="text-button"
          onClick={() =>
            download(
              "事件导入模板.json",
              JSON.stringify(
                [
                  {
                    title: "意外的重逢",
                    content: "人物目标、冲突、转折与结果…",
                    source: "原创 / 已授权来源",
                  },
                ],
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          下载模板
          <ArrowUpRight size={14} />
        </button>
        <input
          type="file"
          ref={file}
          hidden
          accept=".json,.txt,.md"
          onChange={importFile}
        />
      </div>
      <div className="info-band">
        <BookOpen size={18} />
        <div>
          支持 JSON、TXT、Markdown。文本以独占一行的 --- 分隔事件。
          <br />
          <small>
            请仅导入原创、已授权或可合法使用的素材，保留来源信息；不会自动抓取他人小说。
          </small>
        </div>
      </div>
      <div className="event-list">
        {state.events
          .filter((e) => (e.title + e.content + e.source).includes(search))
          .map((e, i) => (
            <article className="event-item" key={e.id}>
              <div className="event-number">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <span className="overline">故事事件</span>
                <h2>{e.title}</h2>
                <p>{e.content}</p>
                <small>来源 · {e.source || "未标注"}</small>
                <div className="event-actions">
                  <button className="outline" onClick={() => link(e.id)}>
                    {chapter.eventIds.includes(e.id) ? (
                      <Check size={15} />
                    ) : (
                      <Plus size={15} />
                    )}{" "}
                    {chapter.eventIds.includes(e.id)
                      ? "已关联本章"
                      : "用于当前章节"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (confirm(`删除事件「${e.title}」？`))
                        setState((s) => ({
                          ...s,
                          events: s.events.filter((x) => x.id !== e.id),
                          chapters: s.chapters.map((c) => ({
                            ...c,
                            eventIds: c.eventIds.filter((id) => id !== e.id),
                          })),
                        }));
                    }}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
      </div>
      {!state.events.filter((e) =>
        (e.title + e.content + e.source).includes(search),
      ).length && (
        <div className="empty">没有找到事件，换个关键词或添加一个新灵感。</div>
      )}
      {form && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={add}>
            <h2>收藏一个故事事件</h2>
            <label>
              事件名称
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              事件内容
              <textarea
                required
                rows={6}
                maxLength={20000}
                placeholder="谁想得到什么？遇到什么阻碍？最后发生什么转折？"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </label>
            <label>
              来源与授权说明
              <input
                maxLength={1000}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="outline"
                onClick={() => setForm(null)}
              >
                取消
              </button>
              <button className="primary">保存事件</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
