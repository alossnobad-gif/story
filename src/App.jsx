import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Folder,
  Lightbulb,
  Settings,
  Home,
  Check,
  Maximize,
  Minimize,
  Download,
  Plus,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Users,
  ArrowLeft,
  LogOut,
  Shield,
  Feather,
  Trash2,
} from "lucide-react";
import { api } from "./api";
import { SettingsPage, Characters } from "./Preferences";
import { count, download, uid } from "./data";
import { useWorkspace } from "./useWorkspace";
import Assistant from "./Assistant";
import Library from "./Library";
function Login({ onLogin }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="login-screen">
      <form
        className="modal"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/login", {
              method: "POST",
              body: JSON.stringify({ password }),
            });
            onLogin();
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <div className="login-brand">叙事</div>
        <h1>故事，等你继续。</h1>
        <p className="muted">进入你的私人写作空间</p>
        <label>
          访问密码
          <input
            autoFocus
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary full">进入工作室</button>
      </form>
    </div>
  );
}
function Workspace() {
  const { state, setState, status, error } = useWorkspace();
  const [page, setPage] = useState("write"),
    [sideTab, setSideTab] = useState("章节"),
    [selected, setSelected] = useState("c3"),
    [focus, setFocus] = useState(false),
    [mobile, setMobile] = useState(false),
    [fontSize, setFontSize] = useState(20),
    [serif, setSerif] = useState(true),
    [toast, setToast] = useState(""),
    [config, setConfig] = useState({ ai: false, model: "qwen-plus" }),
    [exportOpen, setExportOpen] = useState(false);
  const notification = useRef();
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch((e) => notify(e.message));
  }, []);
  function notify(message) {
    setToast(message);
    clearTimeout(notification.current);
    notification.current = setTimeout(() => setToast(""), 5000);
  }
  if (!state)
    return <div className="loading">{error || "正在打开你的写作空间…"}</div>;
  const chapter =
    state.chapters.find((c) => c.id === selected) || state.chapters[0];
  function updateChapter(patch) {
    setState((s) => ({
      ...s,
      chapters: s.chapters.map((c) =>
        c.id === chapter.id ? { ...c, ...patch } : c,
      ),
    }));
  }
  function addChapter() {
    const id = uid();
    setState((s) => ({
      ...s,
      chapters: [
        ...s.chapters,
        {
          id,
          title: `第${s.chapters.length + 1}章 未命名章节`,
          summary: "",
          body: "",
          eventIds: [],
        },
      ],
    }));
    setSelected(id);
    setPage("write");
    setMobile(false);
  }
  function exportText(ext) {
    download(
      `${state.title || "未命名作品"}.${ext}`,
      `# ${state.title}\n\n` +
        state.chapters.map((c) => `## ${c.title}\n\n${c.body}`).join("\n\n"),
    );
    setExportOpen(false);
  }
  const words = count(chapter.body),
    total = state.chapters.reduce((n, c) => n + count(c.body), 0);
  return (
    <div className={`app ${focus ? "focused" : ""}`}>
      <nav className="rail">
        <button
          className="brand"
          onClick={() => {
            setPage("write");
            setFocus(false);
          }}
          aria-label="叙事首页"
        >
          叙事
        </button>
        <div className="rail-links">
          {[
            { id: "write", icon: BookOpen, label: "作品" },
            { id: "library", icon: Folder, label: "素材" },
            { id: "characters", icon: Users, label: "角色" },
            { id: "ideas", icon: Lightbulb, label: "灵感" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setFocus(false);
              }}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          className={page === "settings" ? "active rail-bottom" : "rail-bottom"}
          onClick={() => {
            setPage("settings");
            setFocus(false);
          }}
        >
          <Settings size={20} />
          <span>设置</span>
        </button>
      </nav>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="打开章节目录"
          onClick={() => setMobile(!mobile)}
        >
          <Menu size={20} />
        </button>
        <div className="breadcrumb">
          <Home size={16} />
          <span>我的作品</span>
          <span className="slash">/</span>
          <strong>{state.title || "未命名作品"}</strong>
        </div>
        <div className="top-actions">
          <span className={`save-status ${error ? "save-error" : ""}`}>
            <Check size={14} />
            {status}
          </span>
          {page === "write" && (
            <button
              className="outline focus-button"
              onClick={() => setFocus(!focus)}
            >
              {focus ? <Minimize size={15} /> : <Maximize size={15} />}
              <span>{focus ? "退出专注" : "专注模式"}</span>
            </button>
          )}
          <div className="export-menu">
            <button
              className="primary"
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Download size={15} />
              导出
            </button>
            {exportOpen && (
              <div className="dropdown">
                {["txt", "md"].map((ext) => (
                  <button key={ext} onClick={() => exportText(ext)}>
                    导出 {ext.toUpperCase()} 正文
                  </button>
                ))}
                <button
                  onClick={() => {
                    download(
                      `${state.title}-备份.json`,
                      JSON.stringify(state, null, 2),
                      "application/json",
                    );
                    setExportOpen(false);
                  }}
                >
                  完整 JSON 备份
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}。未保存的内容可通过右上角导出备份。
        </div>
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="book-heading">
          <div>
            <h2>{state.title || "未命名作品"}</h2>
            <p>{state.genre}</p>
          </div>
          <button
            className="icon-button"
            title="作品设置"
            onClick={() => setPage("settings")}
          >
            <Settings size={16} />
          </button>
        </div>
        <div className="tabs sidebar-tabs">
          {["章节", "大纲", "角色"].map((t) => (
            <button
              key={t}
              className={sideTab === t ? "active" : ""}
              onClick={() => {
                setSideTab(t);
                if (t === "角色") setPage("characters");
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {sideTab === "大纲" ? (
          <div className="outline-list">
            {state.chapters.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setPage("write");
                  setMobile(false);
                }}
              >
                <strong>{c.title}</strong>
                <p>{c.summary || "尚未填写章节梗概"}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="chapter-list">
            {state.chapters.map((c, i) => (
              <button
                key={c.id}
                className={c.id === chapter.id ? "selected" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setPage("write");
                  setMobile(false);
                }}
              >
                <span className="chapter-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="chapter-name">{c.title}</span>
                <small>{count(c.body)}字</small>
              </button>
            ))}
            <button className="add-chapter" onClick={addChapter}>
              <Plus size={16} />
              新建章节
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <Feather size={17} />
          <span>慢慢写，好故事值得等待。</span>
          <small>
            {state.chapters.length} 章 · {total.toLocaleString()} 字
          </small>
        </div>
      </aside>
      <main className={`main ${page === "write" ? "writing-layout" : ""}`}>
        {page === "write" ? (
          <>
            <section className="editor">
              <div className="document-meta">
                <span>
                  第 {state.chapters.indexOf(chapter) + 1} 章 ·{" "}
                  {words.toLocaleString()} 字
                </span>
                <span>每一页，都是新的可能</span>
              </div>
              <input
                className="chapter-title"
                aria-label="章节标题"
                value={chapter.title}
                maxLength={200}
                onChange={(e) => updateChapter({ title: e.target.value })}
              />
              <div className="editor-toolbar">
                <span>正文</span>
                <span className="toolbar-divider" />
                <button onClick={() => setSerif(!serif)}>
                  {serif ? "宋体" : "黑体"}
                  <ChevronDown size={13} />
                </button>
                <span className="toolbar-divider" />
                <select
                  aria-label="正文字号"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                >
                  {[16, 18, 20, 22, 24].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <div className="toolbar-spacer" />
                <button
                  className="text-button"
                  onClick={() => {
                    if (!chapter.summary)
                      notify("在大纲栏填写本章梗概，帮助 AI 理解章节目标");
                    setSideTab("大纲");
                  }}
                >
                  章节梗概
                </button>
                <button
                  className="icon-button"
                  aria-label="删除当前章节"
                  disabled={state.chapters.length === 1}
                  onClick={() => {
                    if (
                      confirm(
                        `删除「${chapter.title}」？此操作不可撤销，请先导出备份。`,
                      )
                    )
                      setState((s) => ({
                        ...s,
                        chapters: s.chapters.filter((c) => c.id !== chapter.id),
                      }));
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {sideTab === "大纲" && (
                <label className="summary-field">
                  本章梗概
                  <textarea
                    aria-label="本章梗概"
                    value={chapter.summary}
                    onChange={(e) => updateChapter({ summary: e.target.value })}
                    rows={3}
                    maxLength={20000}
                    placeholder="本章人物目标、冲突、转折与结尾悬念…"
                  />
                </label>
              )}
              <textarea
                className={`manuscript ${serif ? "serif" : ""}`}
                aria-label="小说正文"
                spellCheck={false}
                style={{ fontSize }}
                value={chapter.body}
                placeholder="故事，从这里开始。写下一句话，或者让右侧的灵感助手陪你打开这一章。"
                onChange={(e) => updateChapter({ body: e.target.value })}
              />
              <footer className="editor-footer">
                <span>{words.toLocaleString()} 字</span>
                <span>
                  作品目标 {total.toLocaleString()} /{" "}
                  {(state.goal || 3000).toLocaleString()} 字{" "}
                  <progress
                    value={Math.min(total, state.goal || 3000)}
                    max={state.goal || 3000}
                  />
                </span>
              </footer>
            </section>
            <Assistant
              key={chapter.id}
              state={state}
              chapter={chapter}
              updateChapter={updateChapter}
              config={config}
              onError={notify}
            />
          </>
        ) : page === "library" ? (
          <Library
            state={state}
            setState={setState}
            chapter={chapter}
            onNotify={notify}
          />
        ) : page === "characters" ? (
          <Characters state={state} setState={setState} />
        ) : page === "settings" ? (
          <SettingsPage
            config={config}
            state={state}
            setState={setState}
            onNotify={notify}
          />
        ) : (
          <section className="page-content">
            <div className="page-title">
              <div>
                <span className="overline">把偶然的念头，变成故事的起点</span>
                <h1>灵感工作台</h1>
                <p>一个好故事，常常始于一个“如果”。</p>
              </div>
            </div>
            <div className="idea-sheet">
              <h2>如果，那封信来自未来的自己？</h2>
              <p>
                把宏大的设定缩小成一个人物必须面对的选择。试着用下面三个问题，找到你的下一章。
              </p>
              {[
                "他最想得到的东西是什么？",
                "如果得到它，他必须失去什么？",
                "谁知道一个他不知道的秘密？",
              ].map((t, i) => (
                <div className="idea-question" key={t}>
                  <span>0{i + 1}</span>
                  <h3>{t}</h3>
                </div>
              ))}
              <button className="primary" onClick={() => setPage("library")}>
                <Plus size={16} />
                去素材库收藏你的答案
              </button>
            </div>
            <div className="info-band">
              这些是创作引导示例。要生成真实的场景、动作或对白，请打开章节右侧的灵感助手。
            </div>
          </section>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const [auth, setAuth] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/session")
      .then((x) => setAuth(x.authenticated))
      .catch((e) => setError(e.message));
  }, []);
  return error ? (
    <div className="loading">{error}</div>
  ) : auth === null ? (
    <div className="loading">正在连接工作室…</div>
  ) : auth ? (
    <Workspace />
  ) : (
    <Login onLogin={() => setAuth(true)} />
  );
}
