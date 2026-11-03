import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Check,
  BookOpen,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import { uid } from "./data";
import { validPlan } from "../server/planning";

const empty = {
  ideas: "",
  timeline: "",
  chapterCount: 3,
  proposal: null,
  applied: false,
  demo: false,
};
const example = {
  synopsis:
    "【固定示例，与你的输入无关】修钟师林舟在父亲失踪十年后收到一只停摆的怀表。她循着修理记录回到旧车站，在查找父亲下落的过程中，发现一场被隐瞒的救援。她必须在公开真相与保护证人之间作出选择。",
  timeline:
    "十年前：父亲在车站事故后失踪。\n第一天早晨：林舟收到怀表。\n第一天晚上：前往旧车站寻找记录。\n第二天：找到证人，决定如何公开真相。",
  questions: "【示例】父亲是否仍然活着？你希望结局更温暖，还是保留悬念？",
  chapters: [
    {
      title: "停摆的怀表",
      time: "第一天早晨",
      summary:
        "林舟收到匿名包裹，认出父亲的怀表。她想知道寄件人是谁，却发现寄件地址是一座早已关闭的车站。结尾：表盖里藏着一个储物柜编号。",
    },
    {
      title: "车站的夜访者",
      time: "第一天晚上",
      summary:
        "林舟到旧车站寻找储物柜，被守夜人阻拦。她凭怀表取得信任，发现事故记录存在矛盾。结尾：守夜人承认见过父亲，但要求她先听完一个故事。",
    },
    {
      title: "被留下的名字",
      time: "第二天",
      summary:
        "守夜人讲出隐瞒救援的原因。林舟核对证据，在保护证人与公开真相之间寻找办法。【建议结局】她隐去证人身份公布记录，并收到一封新的来信。",
    },
  ],
};

export default function StoryPlanner({
  state,
  setState,
  config,
  onNotify,
  onWrite,
}) {
  const draft = state.planning || empty;
  const sourceChanged =
    !draft.demo &&
    draft.source &&
    (draft.source.ideas !== draft.ideas ||
      draft.source.timeline !== draft.timeline ||
      draft.source.chapterCount !== draft.chapterCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  function patch(value) {
    setState((s) => ({
      ...s,
      planning: { ...(s.planning || empty), ...value },
    }));
  }
  function updatePlan(value) {
    patch({ proposal: { ...draft.proposal, ...value } });
  }
  function updateChapter(index, field, value) {
    updatePlan({
      chapters: draft.proposal.chapters.map((c, i) =>
        i === index ? { ...c, [field]: value } : c,
      ),
    });
  }
  async function generate() {
    if (!config.ai) {
      if (
        draft.proposal &&
        !confirm("查看固定示例会替换当前待审阅方案，已有章节不会改变。继续吗？")
      )
        return;
      patch({
        proposal: structuredClone(example),
        applied: false,
        demo: true,
        source: null,
        chapterIds: [],
      });
      setError("");
      return;
    }
    if (!draft.ideas.trim()) {
      setError("先写一点你的想法，一两句话也可以。");
      return;
    }
    if (
      draft.proposal &&
      !confirm("重新整理将替换当前待审阅方案，已有章节不会改变。继续吗？")
    )
      return;
    setBusy(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    try {
      const data = await api("/plan", {
        method: "POST",
        signal: request.signal,
        body: JSON.stringify({
          ideas: draft.ideas,
          timeline: draft.timeline,
          chapterCount: draft.chapterCount,
          title: state.title,
          genre: state.genre,
        }),
      });
      if (!request.signal.aborted)
        patch({
          proposal: data.plan,
          applied: false,
          demo: false,
          source: {
            ideas: draft.ideas,
            timeline: draft.timeline,
            chapterCount: draft.chapterCount,
          },
          chapterIds: [],
        });
    } catch (e) {
      if (!request.signal.aborted) setError(e.message);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function apply() {
    if (draft.applied || sourceChanged || !validPlan(draft.proposal)) return;
    if (state.chapters.length + draft.proposal.chapters.length > 500) {
      setError("章节总数不能超过 500，请减少本次方案的章节数量。");
      return;
    }
    if (
      draft.demo &&
      !confirm(
        "这是固定示例，不是根据你的想法生成的内容。仍要将示例追加为章节吗？",
      )
    )
      return;
    const chapters = draft.proposal.chapters.map((c) => ({
      id: uid(),
      title: c.title,
      body: "",
      summary: `${c.time ? "故事时间：" + c.time + "\n" : ""}${c.summary}`,
      eventIds: [],
    }));
    setState((s) => ({
      ...s,
      chapters: [...s.chapters, ...chapters],
      planning: {
        ...s.planning,
        applied: true,
        chapterIds: chapters.map((c) => c.id),
      },
    }));
    onNotify(
      `已追加 ${chapters.length} 章，原有章节和正文已保留；等待自动保存`,
    );
  }
  const plan = draft.proposal;
  return (
    <section className="page-content planner-page">
      <header className="planner-heading">
        <span className="overline">从一个念头，到一部小说</span>
        <h1>
          你来讲想法，
          <br className="planner-mobile-break" />
          我们一起把故事理顺。
        </h1>
        <p>
          不用先会写小说。告诉我发生了什么、在什么时候，我帮你梳理剧情，再拆成可以慢慢写的章节。
        </p>
      </header>
      <ol className="planner-steps" aria-label="创作步骤">
        <li className="current">
          <span>1</span> 说想法、记时间
        </li>
        <li className={plan ? "current" : ""}>
          <span>2</span> 审阅剧情与分章
        </li>
        <li className={draft.applied ? "current" : ""}>
          <span>3</span> 逐章生成与修改
        </li>
      </ol>
      <div className="planner-columns">
        <div className="planner-inputs">
          <div className="planner-section-title">
            <Sparkles size={19} />
            <h2>先随便说说</h2>
            <span>随作品自动保存</span>
          </div>
          <fieldset disabled={busy}>
            <label htmlFor="story-ideas">
              你脑海里的故事 <small>不用组织语言，想到哪里写到哪里</small>
            </label>
            <textarea
              id="story-ideas"
              rows={6}
              maxLength={12000}
              value={draft.ideas}
              onChange={(e) => patch({ ideas: e.target.value })}
              placeholder={
                "比如：一个修钟的女孩，父亲十年前失踪了。某天她收到父亲的怀表。我想写她寻找真相，但不想太黑暗，最后希望有一点温暖。"
              }
            />
            <label htmlFor="story-timeline">
              <Clock3 size={15} /> 故事的时间和先后{" "}
              <small>选填，不确定的可以留给系统提问</small>
            </label>
            <textarea
              id="story-timeline"
              rows={4}
              maxLength={8000}
              value={draft.timeline}
              onChange={(e) => patch({ timeline: e.target.value })}
              placeholder={
                "十年前：父亲失踪\n第一天早晨：收到怀表\n当天晚上：去旧车站\n结局还没想好，也可以写在这里"
              }
            />
            <div className="planner-count">
              <label htmlFor="plan-count">这次先整理几章</label>
              <select
                id="plan-count"
                value={draft.chapterCount}
                onChange={(e) =>
                  patch({ chapterCount: Number(e.target.value) })
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} 章
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <button
            className="primary full planner-generate"
            disabled={busy || (config.ai && !draft.ideas.trim())}
            onClick={generate}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Sparkles size={18} />
            )}
            {busy
              ? "正在梳理剧情与时间线…"
              : config.ai
                ? "帮我整理剧情和章节"
                : "预览固定分章示例"}
          </button>
          <p className="planner-note">
            {config.ai
              ? "会将本页想法、时间、作品名称和题材发送给模型。先生成建议，采纳后才追加章节。"
              : "尚未配置 AI 密钥。你的想法可以正常保存；示例与输入无关，接入 AI 后才能为你整理。"}
          </p>
          {error && (
            <p role="alert" className="planner-error">
              {error}
            </p>
          )}
        </div>
        <div className="planner-preview" aria-live="polite" aria-busy={busy}>
          {!plan ? (
            <div className="planner-empty">
              <div className="planner-empty-icon">
                <BookOpen size={30} />
              </div>
              <h2>故事会在这里慢慢成形</h2>
              <p>
                先写下一个人物、一个念头，
                <br />
                或者你已经想好的结局。
              </p>
              <div>剧情大纲 → 时间线 → 章节梗概</div>
              <p className="planner-note">
                你始终可以改建议。
                <br />
                已有正文不会被覆盖。
              </p>
            </div>
          ) : (
            <>
              <div className="planner-section-title">
                <BookOpen size={19} />
                <h2>{draft.demo ? "固定示例 · 非你的故事" : "你的故事方案"}</h2>
              </div>
              <p className="planner-note">
                {draft.applied
                  ? "本方案已追加为章节。后续请在章节中修改；这里的修改不会同步到已创建章节。"
                  : "先读一遍，不合心意的地方直接改。补充想法后也可以重新整理。"}
              </p>
              {sourceChanged && !draft.applied && (
                <p className="planner-questions">
                  想法、时间或章节数已修改，请重新整理后再采纳，避免使用旧方案。
                </p>
              )}
              <label>
                剧情大纲
                <textarea
                  aria-label="剧情大纲"
                  disabled={busy || draft.applied}
                  rows={5}
                  maxLength={6000}
                  value={plan.synopsis}
                  onChange={(e) => updatePlan({ synopsis: e.target.value })}
                />
              </label>
              <label>
                整理后的时间线
                <textarea
                  aria-label="整理后的时间线"
                  disabled={busy || draft.applied}
                  rows={4}
                  maxLength={8000}
                  value={plan.timeline}
                  onChange={(e) => updatePlan({ timeline: e.target.value })}
                />
              </label>
              {plan.questions && (
                <div className="planner-questions">
                  <strong>还有几处想听听你的决定</strong>
                  <p>{plan.questions}</p>
                  <small>
                    把答案补充到左侧想法，再重新整理；也可先修改下方梗概。
                  </small>
                </div>
              )}
              <h3 className="planner-chapters-heading">
                分成 {plan.chapters.length} 章 · 可以直接修改
              </h3>
              {plan.chapters.map((c, i) => (
                <article className="planner-chapter" key={i}>
                  <span className="planner-chapter-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <label>
                      章节名称
                      <input
                        aria-label={`建议章节 ${i + 1} 名称`}
                        value={c.title}
                        maxLength={200}
                        disabled={busy || draft.applied}
                        onChange={(e) =>
                          updateChapter(i, "title", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      故事时间
                      <input
                        aria-label={`建议章节 ${i + 1} 时间`}
                        value={c.time}
                        maxLength={300}
                        disabled={busy || draft.applied}
                        onChange={(e) =>
                          updateChapter(i, "time", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      这一章发生什么
                      <textarea
                        aria-label={`建议章节 ${i + 1} 梗概`}
                        rows={4}
                        maxLength={4000}
                        value={c.summary}
                        disabled={busy || draft.applied}
                        onChange={(e) =>
                          updateChapter(i, "summary", e.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
              <button
                className="primary full"
                onClick={apply}
                disabled={
                  busy || draft.applied || sourceChanged || !validPlan(plan)
                }
              >
                {draft.applied ? <Check size={17} /> : <PlusIcon />}
                {draft.applied
                  ? "本方案已追加，不会重复创建"
                  : `采纳方案，追加 ${plan.chapters.length} 章`}
              </button>
              <p className="planner-note">
                追加空正文和梗概，保留已有 {state.chapters.length}{" "}
                章。剧情大纲与整理后的时间线保存在本页，JSON 备份也会包含。
              </p>
              {draft.applied && (
                <button className="outline full" onClick={onWrite}>
                  去章节，按梗概写正文 <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
function PlusIcon() {
  return <ArrowRight size={17} />;
}
