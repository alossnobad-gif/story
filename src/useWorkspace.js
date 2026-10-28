import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { seed } from "./data";
export function useWorkspace() {
  const [state, setState] = useState(null),
    [status, setStatus] = useState("正在载入"),
    [error, setError] = useState("");
  const revision = useRef(0),
    latest = useRef(null),
    saved = useRef(null),
    busy = useRef(false),
    blocked = useRef(false);
  useEffect(() => {
    let active = true;
    api("/workspace")
      .then((data) => {
        if (!active) return;
        revision.current = data.revision;
        const value = data.state || structuredClone(seed);
        latest.current = value;
        saved.current = data.state;
        setState(value);
        setStatus(data.state ? "已自动保存" : "正在保存示例作品");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (state) {
      latest.current = state;
      if (state !== saved.current) setStatus("等待保存");
    }
  }, [state]);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (
        !latest.current ||
        latest.current === saved.current ||
        busy.current ||
        blocked.current
      )
        return;
      busy.current = true;
      const snapshot = latest.current;
      setStatus("正在保存");
      try {
        const data = await api("/workspace", {
          method: "PUT",
          body: JSON.stringify({ state: snapshot, revision: revision.current }),
        });
        revision.current = data.revision;
        saved.current = snapshot;
        setStatus(latest.current === snapshot ? "已自动保存" : "等待保存");
        setError("");
      } catch (e) {
        setStatus("保存失败");
        setError(e.message);
        if (e.status === 409) blocked.current = true;
      } finally {
        busy.current = false;
      }
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
  }, []);
  return { state, setState, status, error };
}
