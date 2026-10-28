import { useEffect, useState } from "react";
import {
  BookOpen,
  Folder,
  Users,
  Lightbulb,
  Settings,
  Home,
  Search,
  Plus,
  ArrowUpRight,
  Pencil,
  Trash2,
  RotateCcw,
  X,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
const covers = [
  { id: "forest", name: "松绿" },
  { id: "clay", name: "陶棕" },
  { id: "ink", name: "墨蓝" },
  { id: "sand", name: "麦金" },
];
const blank = { title: "", genre: "", description: "", cover: "forest" };
export default function BookShelf({ onOpen }) {
  const [books, setBooks] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("updated"),
    [trash, setTrash] = useState(false),
    [form, setForm] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    try {
      const data = await api("/books" + (trash ? "?trash=1" : ""));
      setBooks(data.books);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api("/books" + (trash ? "?trash=1" : ""))
      .then((data) => {
        if (active) {
          setBooks(data.books);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [trash]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.id) {
        await api("/books/" + form.id, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        setForm(null);
        setNotice("作品信息已更新");
        await load();
      } else {
        const data = await api("/books", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setForm(null);
        onOpen(data.id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function move(book, restore = false) {
    setBusy(true);
    setError("");
    try {
      await api("/books/" + book.id + (restore ? "/restore" : ""), {
        method: restore ? "POST" : "DELETE",
        body: JSON.stringify({ revision: book.revision }),
      });
      setDeleting(null);
      setNotice(
        restore ? "作品已恢复到书架" : "作品已移入回收站，正文与素材已保留",
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = books
    .filter((b) =>
      (b.title + " " + b.genre + " " + b.description)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : sort === "words"
          ? b.words - a.words
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div className="app bookshelf-app">
      <nav className="rail">
        <button
          className="brand"
          aria-label="叙事首页"
          onClick={() => setTrash(false)}
        >
          叙事
        </button>
        <div className="rail-links">
          {[
            { icon: BookOpen, label: "作品" },
            { icon: Folder, label: "素材" },
            { icon: Users, label: "角色" },
            { icon: Lightbulb, label: "灵感" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              className={label === "作品" ? "active" : ""}
              disabled={label !== "作品"}
              title={label === "作品" ? "作品书架" : "请先打开一部作品"}
              onClick={() => setTrash(false)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          className="rail-bottom"
          disabled
          title="打开作品后可设置作品信息与 AI"
        >
          <Settings size={20} />
          <span>设置</span>
        </button>
      </nav>
      <header className="topbar">
        <div className="breadcrumb">
          <Home size={16} />
          <span>我的作品</span>
          <span className="slash">/</span>
          <strong>{trash ? "回收站" : "作品书架"}</strong>
        </div>
        <span className="private-studio">私人写作空间</span>
      </header>
      <main className="main shelf-main">
        <section className="shelf-content">
          <div className="shelf-heading">
            <div>
              <h1>{trash ? "作品回收站" : "我的书架"}</h1>
              <p>
                {trash
                  ? "故事还在，随时可以重新开始。"
                  : "把每一个故事，写成一本书。"}
              </p>
            </div>
            {!trash && (
              <button
                className="primary"
                onClick={() => {
                  setForm({ ...blank });
                  setError("");
                }}
              >
                <Plus size={17} />
                新建作品
              </button>
            )}
          </div>
          <div className="shelf-summary">
            {loading
              ? "正在打开书架…"
              : `${books.length} 部作品 · ${books.reduce((n, b) => n + b.words, 0).toLocaleString()} 字`}
          </div>
          <div className="shelf-toolbar">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="搜索作品"
                placeholder="搜索作品名称、题材或简介"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="作品排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="updated">最近更新</option>
              <option value="title">作品名称</option>
              <option value="words">字数最多</option>
            </select>
            <button
              className="text-button"
              onClick={() => {
                setTrash(!trash);
                setSearch("");
                setNotice("");
              }}
            >
              {trash ? <RotateCcw size={15} /> : <Trash2 size={15} />}{" "}
              {trash ? "返回书架" : "回收站"}
            </button>
          </div>
          {error && (
            <div className="shelf-error" role="alert">
              {error}
              <button className="text-button" disabled={loading} onClick={load}>
                刷新书架
              </button>
            </div>
          )}
          {notice && (
            <div className="shelf-notice" role="status">
              {notice}
              <button aria-label="关闭提示" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="shelf-empty">
              <LoaderCircle size={24} className="spin" />
              <p>正在整理你的故事…</p>
            </div>
          ) : filtered.length ? (
            <div className="book-grid">
              {filtered.map((book) => (
                <article
                  className="book-card"
                  key={book.id}
                  aria-label={`作品：${book.title}`}
                >
                  <div className="book-card-main">
                    <button
                      className={`book-cover cover-${book.cover}`}
                      disabled={trash}
                      aria-label={`打开《${book.title}》`}
                      onClick={() => onOpen(book.id)}
                    >
                      <span className="cover-rule" />
                      <strong>{book.title}</strong>
                      <span className="cover-brand">叙事</span>
                    </button>
                    <div className="book-details">
                      <h2>{book.title}</h2>
                      <p className="book-genre">{book.genre || "题材待定"}</p>
                      <p className="book-description">
                        {book.description ||
                          "一个新的故事，等待你写下第一句话。"}
                      </p>
                      <div className="book-stats">
                        {book.chapterCount} 章<span>·</span>
                        {book.words.toLocaleString()} 字
                      </div>
                      <time dateTime={book.updatedAt}>
                        更新于{" "}
                        {new Date(book.updatedAt).toLocaleDateString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </time>
                    </div>
                  </div>
                  <div className="book-card-actions">
                    {trash ? (
                      <button
                        className="continue-book"
                        disabled={busy}
                        onClick={() => move(book, true)}
                      >
                        <RotateCcw size={15} />
                        恢复作品
                      </button>
                    ) : (
                      <>
                        <button
                          className="continue-book"
                          onClick={() => onOpen(book.id)}
                        >
                          继续写作
                          <ArrowUpRight size={15} />
                        </button>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={`编辑《${book.title}》`}
                            onClick={() => {
                              setForm({ ...book });
                              setError("");
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`删除《${book.title}》`}
                            onClick={() => setDeleting(book)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="shelf-empty">
              <BookOpen size={36} />
              <h2>
                {search
                  ? "没有找到这部作品"
                  : trash
                    ? "回收站是空的"
                    : "你的第一本书，从这里开始"}
              </h2>
              <p>
                {search
                  ? "试试作品名称、题材或简介里的其他关键词。"
                  : trash
                    ? "从书架移除的作品会保留在这里。"
                    : "每部作品都有独立的章节、角色和事件素材。"}
              </p>
              {!search && !trash && (
                <button
                  className="primary"
                  onClick={() => setForm({ ...blank })}
                >
                  <Plus size={16} />
                  新建第一部作品
                </button>
              )}
            </div>
          )}
          <p className="shelf-footnote">作品的章节、角色和事件素材分别保存。</p>
        </section>
      </main>
      {form && (
        <div className="modal-backdrop">
          <form
            className="modal book-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-form-title"
            onSubmit={save}
          >
            <h2 id="book-form-title">
              {form.id ? "编辑作品信息" : "开始一个新故事"}
            </h2>
            <label>
              作品名称
              <input
                autoFocus
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="为你的故事起个名字"
              />
            </label>
            <label>
              题材与形式
              <input
                maxLength={100}
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                placeholder="例如：悬疑 · 长篇小说"
              />
            </label>
            <label>
              作品简介
              <textarea
                rows={3}
                maxLength={4000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="这个故事，想从哪里开始？"
              />
            </label>
            <fieldset className="cover-options">
              <legend>封面颜色</legend>
              {covers.map((c) => (
                <label
                  key={c.id}
                  className={`cover-choice cover-${c.id} ${form.cover === c.id ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="cover"
                    value={c.id}
                    checked={form.cover === c.id}
                    onChange={() => setForm({ ...form, cover: c.id })}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="outline"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                取消
              </button>
              <button className="primary" disabled={busy || !form.title.trim()}>
                {busy ? "正在保存…" : form.id ? "保存修改" : "创建并开始写作"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-book-title"
          >
            <h2 id="delete-book-title">将《{deleting.title}》移入回收站？</h2>
            <p className="muted">
              章节、正文、角色和事件素材都会保留，可以在作品回收站中恢复。
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <button
                className="outline"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => move(deleting)}
              >
                {busy ? "正在处理…" : "移入回收站"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
