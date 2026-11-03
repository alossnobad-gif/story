# 运维交接

核对日期：2026-11-03。代码基线 `d242cf5a8c55da82984dea3a01d3d04f3f41e0df`；文档整理开始时工作区干净。当前未登录生产服务器，无生产变更。构思流程提交 44678a83324a9c169316c76b327a0f836b4439f5 已推送（发布命令见 RELEASES.md），Node 测试已增至 8 项，构建和桌面/手机交互检查通过。

## 事实、证据与未知

| 项目 | 现有证据 | 状态 |
| --- | --- | --- |
| 技术栈 | package.json、源码：React 19、Vite 6、Express 5、Node 内置 SQLite | 已实现；要求 Node 24.5+ 的 24.x |
| 本地开发 | /workspace/story，Node 24.19.0、npm 11.9.0；npm ci、6 项 Node 测试、build、两端口页面与 API 请求 | 本会话云环境验证通过；真实 AI 未验证 |
| 服务器 | 用户提供 Ubuntu ECS 123.57.60.66；历史 40 GiB 系统盘、3 Mbps 公网带宽 | 当前 CPU/内存/空间/带宽套餐待核实 |
| 自然图鉴 | 用户提供 /opt/photo、nature-photo、默认 127.0.0.1:3000、Nginx HTTPS/登录保护、真实数据 /opt/photo/.data | 必须保护；当前运行状态未实查 |
| story 线上 | 没有服务器执行回执、健康结果或浏览器验收 | 是否安装、提交版本、实际路径/端口/服务均未知 |
| 旧部署文档 | 曾记录 Ubuntu 22.04、x86_64、1.7 GiB 内存等 | 历史信息，不能当作当前实测 |

云环境安装脚本及启动说明已保存为环境配置草稿；发布快照和新任务恢复未验证。这与 ECS 部署无关。

## 仓库部署方案，须先与实机比对

| 用途 | 脚本预设位置 |
| --- | --- |
| 独立用户及 systemd 服务 | story-writing |
| 代码、当前指针 | /opt/story/releases/、/opt/story/current |
| Node | /opt/story/runtime → runtimes/node-v24.22.1-linux-x64 |
| Git 缓存及运维工具 | /opt/story/repository.git、/opt/story/bin/ |
| 数据库、预留上传目录 | /var/lib/story-writing/data/story.sqlite、/var/lib/story-writing/uploads（尚无上传功能） |
| 配置、证书、私钥 | /etc/story-writing/story.env、/etc/story-writing/tls/ |
| 备份与最近指针 | /var/backups/story-writing、/opt/story/last-backup |
| 后端、公网入口 | 127.0.0.1:3101、https://123.57.60.66:8443 |
| Nginx 站点、日志 | sites-available/story-writing、sites-enabled/story-writing；/var/log/nginx/story-writing.*.log |

实际配置不同则先记录差异、理解原因并沿用；不能直接以表格覆盖实机。详细预设行为见 [部署说明](../DEPLOY_ALIYUN.md)。Docker/Compose 只作为其他服务器的可选方案，不拿它替换当前 ECS 上的已有服务。

本地默认无 .env 也可启动；数据库在忽略的 data/。AI 默认 qwen-plus，接口默认 dashscope.aliyuncs.com/compatible-mode/v1；无密钥显示示例。systemd 的环境文件不能用 source 执行。只在服务器安全编辑配置，不回传内容。

构思接口 `/api/plan` 复用现有模型设置、登录、同源检查、90 秒超时及串行生成限制。作品 JSON 的可选 planning 字段保存输入与方案，无新增数据表或依赖；生成的章梗概随现有 chapters 保存。真实模型输出可能不符合结构，前端显示错误并保留输入，建议减少本次章节数重试。旧软件不保证保留 planning，回退前先备份。

## 当前限制与排障

- deploy/update.sh 当前始终 npm ci、build、test、prune，没有依赖不变复用，也没有 codeload 回退；这些是待单独实现的改进，不能宣称已满足。更新仅从已核验的固定 SHA 获取代码。
- bootstrap 预设 Node 24.22.1 及固定 SHA256，本次未验证官方归档与校验值，当前云开发使用的是 24.19.0。首次部署前需单独核实工具链可获取性。
- snapshot.py 在数据库路径不存在时会跳过数据库备份，现有测试未覆盖此情况；已有部署更新前必须确认实际数据库路径和备份文件存在，不能仅凭“备份已保存”认定数据库已备份。
- 发布脚本只备份 SQLite 和环境配置，不备份预留 uploads、TLS 私钥或整个系统；当前无上传功能。若实际存在文件数据，应先补充明确的一致性备份和恢复方案。
- 不自动清理 release、缓存和备份；先检查空间，不混淆代码清理与业务数据删除。
- 启动失败：先查 story-writing 状态及退出码，再在服务器本地检查日志。日志可能包含业务信息，分享前脱敏；不输出完整环境或配置。
- 401 先核对登录；409 先导出未保存内容再刷新，不强行覆盖。无 Key 时 503 属于明确的未配置提示。
- 健康 revision 不匹配，核对 current/REVISION 与 systemd 实际运行路径；不能仅因端口开放就宣布成功。
- 不用旧单作品代码继续编辑书架数据。代码回滚不恢复数据库；数据恢复必须另行核对范围和备份，先在副本演练。

## 集中只读服务器检查

在阿里云 Workbench 复制执行以下完整 Bash。它不安装、不重启、不改权限、不读取正文/照片/密钥或完整 Nginx 配置；只请求本机健康接口。缺失项明确输出，不把缺失当成已部署。命令不会核实公网安全组和套餐带宽，后者需在 ECS 控制台核对。输出分享前仍需检查是否含敏感路径。

```bash
sudo bash <<'STORY_INSPECT'
set -uo pipefail
section() { printf '\n== %s ==\n' "$1"; }
section '时间、系统与资源（当前值）'
date -Is
uname -m
cat /etc/os-release
lscpu | awk -F: '/^CPU\(s\):|^Model name:|^Architecture:/{print}'
free -h
df -hT / /opt /var
section '服务元数据（不输出环境变量或命令行）'
for service in nature-photo story-writing nginx; do
  printf '\n%s\n' "$service"
  systemctl show "$service" -p LoadState -p ActiveState -p SubState -p MainPID -p FragmentPath -p WorkingDirectory -p User -p MemoryCurrent || true
done
section '相关监听端口（数字地址）'
ss -ltnp | awk 'NR==1 || /:(3000|3001|3101|5173|8443|80|443)[[:space:]]/'
section 'story 路径元数据（不读取文件内容）'
for item in /opt/story /opt/story/current /opt/story/runtime /opt/story/bin/update.sh /opt/story/last-backup /var/lib/story-writing/data /var/lib/story-writing/data/story.sqlite /var/lib/story-writing/uploads /etc/story-writing/story.env /etc/story-writing/tls /var/backups/story-writing /etc/nginx/sites-enabled/story-writing; do
  if [ -e "$item" ] || [ -L "$item" ]; then
    stat -c '%A %U:%G %n' "$item"
    if [ -L "$item" ]; then readlink -f "$item"; fi
  else
    printf '未发现：%s\n' "$item"
  fi
done
section '当前 story 版本（仅严格 SHA）'
if [ -f /opt/story/current/REVISION ]; then
  if ! grep -Ex '[0-9a-f]{40}' /opt/story/current/REVISION; then printf 'REVISION 格式异常，不输出内容\n'; fi
else
  printf '没有预设路径的 REVISION，需按实际服务路径继续核实\n'
fi
section 'story 独立 Node 版本'
if [ -x /opt/story/runtime/bin/node ]; then /opt/story/runtime/bin/node --version; else printf '未发现预设独立运行时\n'; fi
section 'Nginx 配置有效性（不展开配置）'
nginx -t || true
section '候选后端健康接口（只读，不含登录或业务数据）'
for port in 3101 3001; do
  printf '\n端口 %s\n' "$port"
  curl --noproxy 127.0.0.1 --fail --silent --show-error --connect-timeout 2 --max-time 5 "http://127.0.0.1:$port/api/health" || printf '该候选地址未通过健康请求\n'
  printf '\n'
done
section 'story HTTPS（仅当已有独立证书）'
if [ -f /etc/story-writing/tls/server.crt ]; then
  openssl x509 -in /etc/story-writing/tls/server.crt -noout -dates -fingerprint -sha256
  curl --noproxy 127.0.0.1 --cacert /etc/story-writing/tls/server.crt --fail --silent --show-error --connect-timeout 2 --max-time 5 https://127.0.0.1:8443/api/health || printf '预设 HTTPS 未通过，需核实实际站点和证书\n'
else
  printf '未发现预设独立证书\n'
fi
section '检查结束；未执行发布或业务数据操作'
STORY_INSPECT
```

请回传上述脱敏输出，以及控制台显示的当前公网带宽套餐；如果实际服务名或目录不同，集中提供实际值。不需要提供密码、AI Key、环境文件、证书私钥或业务数据库。
