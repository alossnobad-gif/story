# 阿里云 Ubuntu：与自然图鉴隔离部署

## 已确认的服务器与方案

目标服务器 `123.57.60.66`，Ubuntu 22.04 / x86_64。用户回传：约 1.7 GiB 内存、1 GiB 可用内存、4 GiB swap，系统盘约 27 GiB 可用；自然图鉴位于 `/opt/photo`，服务 `nature-photo`，后端 `127.0.0.1:3000`，Nginx 使用 80/443。系统 Node v22.23.3，保留不变。

叙事使用独立的 Node v24.22.1（官方 linux-x64 归档，固定 SHA256）、单个 systemd 服务和新增的独立 Nginx 站点。没有 PM2、Docker、Vite 或其他常驻构建进程。

| 用途 | 路径 / 地址 |
| --- | --- |
| 服务 | `story-writing`，系统用户同名 |
| Node 运行时 | `/opt/story/runtimes/node-v24.22.1-linux-x64`，`/opt/story/runtime` 链接到它 |
| 裸 Git 缓存 | `/opt/story/repository.git` |
| 代码版本 | `/opt/story/releases/<完整提交SHA>.<构建唯一后缀>` |
| 当前代码 | `/opt/story/current`，原子切换的符号链接 |
| 更新 / 回滚工具 | `/opt/story/bin/update.sh`、`rollback.sh` |
| 数据库 | `/var/lib/story-writing/data/story.sqlite` |
| 预留上传目录 | `/var/lib/story-writing/uploads`，当前应用没有上传功能 |
| 环境配置和密钥 | `/etc/story-writing/story.env`，root 权限 600 |
| 独立证书 | `/etc/story-writing/tls/server.crt`、`server.key` |
| 一致性备份 | `/var/backups/story-writing`，root 专用，不自动删除 |
| 最新切换前备份 | `/opt/story/last-backup` 链接到对应备份目录 |
| 后端 | `127.0.0.1:3101`，不开放安全组 |
| 公网入口 | `https://123.57.60.66:8443` |

**阿里云安全组仅新增入方向 TCP 8443。** 推荐来源限制为自己的公网 IP；如果要在多个网络访问，再根据实际需要调整来源范围。不修改已有 22/80/443 规则，不开放 3101 或 5173。主机 UFW 在检查时未启用；安装脚本不会启用或更改防火墙。

证书为叙事单独生成的自签名证书，浏览器首次访问会显示不受信任。应核对终端输出的 SHA256 指纹；它既不是自然图鉴的证书，也不是它的密码文件。证书有效期 365 天，续期需要安排单独维护。自动核验使用该证书作为显式信任锚，不使用 `curl -k`。

## 首次部署合同

用户收到的可复制命令必须包含真实仓库 `https://github.com/alossnobad-gif/story.git` 和已推送、核验过的完整提交 SHA。命令在临时目录获取该提交，核对 `HEAD` 后调用该提交的 `deploy/bootstrap.sh`。不使用浮动 main 作为部署版本。

bootstrap 在修改前重新检查：原有服务 active、现有 Nginx 配置有效、3101/8443 未占用、保留目录和用户无冲突、可用磁盘至少 1.5 GiB、MemAvailable 至少 512 MiB。它仅新建叙事的目录、用户、服务、证书和站点。不安装/升级系统 Node，不重启/停止 nature-photo，不访问其业务数据。

运行时下载限速 256 KiB/s，Node 归档固定 SHA256：`6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`。该值在准备部署时从 Node.js 官方 `v24.22.1/SHASUMS256.txt` 获取。校验不通过立即停止，绝不跳过校验。

密码和可选百炼 Key 由 `configure.py` 通过服务器 `/dev/tty` 不回显读取。密码至少 12 字符，输入两次确认，支持特殊字符；不进入命令行参数、聊天或 Git。配置是 systemd EnvironmentFile，不要用 `source` 执行它。可以先留空 AI Key 验证示例流程。

配置 unit 后仅执行 daemon-reload；新应用先完成受限资源构建和本机核验，再新增一个 Nginx 站点。现有 Nginx 配置不覆盖。只有 `nginx -t` 通过才执行平滑 reload；测试失败仅取消新站点链接，不 reload。最后核验新站点 HTTPS、正确提交版本、前端首页、未登录数据接口为 401，且 nature-photo 仍 active、PID 未变化，才开启叙事自启动并输出本机通过。

**本机检查成功不等于公网已通。** 仍需用户配置安全组并在浏览器验证。脚本中断后不要盲目重复整段，先回传失败步骤和错误（不要回传密钥或环境文件）。

## 手动更新

每次修改代码：先测试、提交、推送，核验 GitHub 上提交存在，再向用户给出包含该次真实 SHA 的完整 Bash 块。块调用已安装的 `/opt/story/bin/update.sh`，它完整执行以下步骤：

1. 检查部署锁、旧服务、Nginx、资源和路径。新的构建目录不会覆盖旧代码或业务数据。
2. 从真实 GitHub 仓库 fetch 指定 SHA，核对 FETCH_HEAD，然后导出新 release。
3. 作为 story-writing 用户，在一次性的 systemd 构建单元中运行 `npm ci`、`npm run build`、`npm test`、`npm prune --omit=dev`。Node 堆 384 MiB，整个构建单元内存上限 640 MiB，CPUQuota 75%，低调度优先级；npm 下载最多两个连接。
4. 构建退出码有任何失败即中止，**不切换 current、不重启旧服务、不宣称成功**。失败构建目录保留用于诊断。
5. 通过 Python SQLite backup API 生成一致性在线备份，并执行 quick_check；环境配置单独备份到 root 专用目录。不会直接复制正在写入的 SQLite 主文件。
6. 将新 release 设为 root 所有、服务用户只读，然后原子切换 current，仅重启 story-writing。
7. 检查 systemd active、HTTP/HTTPS 健康接口提交版本完全一致、前端页面正确、未登录数据接口为 401，并确认 nature-photo 的状态/PID。
8. 更新叙事专属辅助脚本；不自动改 Nginx、systemd unit、独立运行时或业务数据库结构。

常驻服务 Node 堆限制 192 MiB，systemd MemoryHigh 256 MiB、MemoryMax 384 MiB、CPUQuota 75%。这些是上限，不是预占资源；不更改主机 swap，不影响 photo 的服务配置。构建期间 CPU/网络仍与现有项目共享，低负载时更新更合适。

所有版本保留；目前不自动清理 release、npm 缓存或备份。后续空间不足时先列出并确认哪些旧**代码版本**可以删除；业务数据、配置和备份不能混在代码清理里。首次部署与更新命令的成功提示都以实际命令返回值为准。

## 更新失败和回滚

如果依赖、构建或备份失败，旧版本继续运行；停止后续步骤。切换后的启动或健康检查失败时，仅停止新叙事服务防止循环重启，保留旧 release、数据和备份，并输出带真实旧路径的回滚命令。不自动反复重启，也不自动用旧数据库覆盖新写作内容。

如果已经切换过版本，可以用最近一次切换前备份记录里的真实路径回滚（首次部署没有旧版本，不能用此命令）：

```bash
sudo bash <<'STORY_ROLLBACK'
set -Eeuo pipefail
previous=$(cat /opt/story/last-backup/previous-release)
/opt/story/bin/rollback.sh "$previous"
STORY_ROLLBACK
```

回滚脚本先对当前数据做一致性备份，再原子切换到保留的旧代码并重启**仅 story-writing**，完成 HTTPS 和版本检查才确认。**这是代码回滚，数据库、上传目录和当前密钥不回滚。** 未来如果代码引入不兼容的数据库结构变化，必须另行制定迁移与数据恢复步骤，不能直接运行代码回滚。

## 常用只读诊断

```bash
sudo systemctl show story-writing -p ActiveState -p SubState -p MainPID -p MemoryCurrent
sudo journalctl -u story-writing -n 60 --no-pager
sudo nginx -t
sudo readlink -f /opt/story/current
sudo cat /opt/story/current/REVISION
sudo systemctl show nature-photo -p ActiveState -p SubState -p MainPID
```

不要回传 `/etc/story-writing/story.env`、私钥文件、密码文件或完整进程环境。分享日志前检查是否包含自己写入的敏感信息。

修改 AI 配置时直接在服务器执行 `sudoedit /etc/story-writing/story.env`，保存后 `sudo systemctl restart story-writing`；不需要重新下载代码。配置默认百炼中国内地地域，其 Key 与 API_BASE_URL 必须匹配。未配置真实 Key 时只验证示例模式，不声称真实 AI 已可用。
