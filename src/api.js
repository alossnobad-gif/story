export async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("服务器响应异常，请确认后端已启动");
  }
  if (!res.ok)
    throw Object.assign(new Error(data.error || "请求失败"), {
      status: res.status,
    });
  return data;
}
