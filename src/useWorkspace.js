import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useWorkspace(bookId) {
  const [state, renderState] = useState(null),
    [status, setStatus] = useState("正在载入"),
    [error, setError] = useState("");
  const revision = useRef(0),
    latest = useRef(null),
    saved = useRef(null),
    inFlight = useRef(null),
    blocked = useRef(false);
  const setState = useCallback((value) => {
    const next = typeof value === "function" ? value(latest.current) : value;
    latest.current = next;
    renderState(next);
    setStatus("等待保存");
  }, []);
  useEffect(() => {
    let active = true;
    api("/books/" + encodeURIComponent(bookId))
      .then((data) => {
        if (!active) return;
        revision.current = data.revision;
        latest.current = data.state;
        saved.current = data.state;
        renderState(data.state);
        setStatus("已自动保存");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [bookId]);
  const flush = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const saveAll = async () => {
      if (blocked.current)
        throw new Error("作品已发生版本冲突，请先导出当前内容，再刷新页面");
      while (latest.current && latest.current !== saved.current) {
        const snapshot = latest.current;
        setStatus("正在保存");
        try {
          const data = await api("/books/" + encodeURIComponent(bookId), {
            method: "PUT",
            body: JSON.stringify({
              state: snapshot,
              revision: revision.current,
            }),
          });
          revision.current = data.revision;
          saved.current = snapshot;
          setStatus(latest.current === snapshot ? "已自动保存" : "等待保存");
          setError("");
        } catch (e) {
          setStatus("保存失败");
          setError(e.message);
          if ([404, 409].includes(e.status)) blocked.current = true;
          throw e;
        }
      }
    };
    inFlight.current = saveAll().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [bookId]);
  useEffect(() => {
    const timer = setInterval(() => {
      flush().catch(() => {});
    }, 900);
    const unload = (e) => {
      if (latest.current !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
    };
  }, [flush]);
  return { state, setState, status, error, flush };
}
