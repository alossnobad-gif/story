# 发布记录与命令管理

真实仓库：https://github.com/alossnobad-gif/story.git 。保持手动发布，无自动部署。当前工作区包括协作文档及构思流程改动，不执行生产操作。

## 当前发布（2026-11-03）

应用版本：`44678a83324a9c169316c76b327a0f836b4439f5`，已正常推送至 main，并用 git ls-remote 核实。后续发布记录提交仅补充文档，不改变此应用版本。此前基线为 d242cf5a8c55da82984dea3a01d3d04f3f41e0df。

本地验证：Node 8/8、Python 部署辅助 2/2、Vite 构建、桌面/手机 Playwright 完整交互通过。依赖声明及数据库表结构未变。真实 AI 未调用；服务器命令尚未执行，线上版本和公网验收未知。

以下命令由用户在 Workbench 手动执行。先检查预设部署与实际配置、旧版本 HTTP/HTTPS、已有辅助工具内容；不匹配立即停止，不重装或覆盖配置。固定 codeload 归档已下载并与 Git 提交逐文件比对，命令校验 SHA256 后使用其中的更新脚本。应用获取仍由现有更新脚本通过 Git fetch 完成；如 Git 获取失败即中止，不宣称已有 codeload 应用下载回退。既有 release 已裁剪开发依赖，当前工具会在新目录恢复构建依赖；本次不扩大为部署工具重构。

### 完整手动更新命令

```bash
sudo bash <<'STORY_UPDATE'
set -Eeuo pipefail
umask 077
trap 'printf "更新中止（退出码 %s），请保留错误输出；没有继续执行后续步骤。\n" "$?" >&2' ERR
STORY_REV=44678a83324a9c169316c76b327a0f836b4439f5
STORY_REPO=https://github.com/alossnobad-gif/story.git
[[ -f /opt/story/.managed-by-story-writing ]]
[[ $(cat /opt/story/.managed-by-story-writing) == story-writing-v1 ]]
[[ -L /opt/story/current && -s /var/lib/story-writing/data/story.sqlite ]]
[[ $(systemctl show story-writing -p WorkingDirectory --value) == /opt/story/current ]]
systemctl is-active --quiet story-writing
systemctl is-active --quiet nature-photo
nginx -t
python3 - <<'PY'
import shlex
from pathlib import Path
expected = {'NODE_ENV': 'production', 'HOST': '127.0.0.1', 'PORT': '3101', 'DATA_DIR': '/var/lib/story-writing/data'}
found = {}
for line in Path('/etc/story-writing/story.env').read_text().splitlines():
    key, sep, raw = line.partition('=')
    if sep and key in expected:
        values = shlex.split(raw)
        if len(values) == 1:
            found[key] = values[0]
if found != expected:
    raise SystemExit('实际部署配置与仓库预设不同，已停止；未改动配置或数据。')
PY
STORY_TMP=$(mktemp -d /tmp/story-update.XXXXXX)
trap 'rm -rf -- "$STORY_TMP"' EXIT
curl --proto '=https' --tlsv1.2 --fail --location --retry 2 --connect-timeout 20 --max-time 300 \
  "https://codeload.github.com/alossnobad-gif/story/tar.gz/$STORY_REV" -o "$STORY_TMP/source.tar.gz"
printf '%s  %s\n' dab97d2e1aa29bb9034486f6ce61c757a3eff1a041eda79f3b8dfe0354a558be "$STORY_TMP/source.tar.gz" | sha256sum --check --strict
tar -xzf "$STORY_TMP/source.tar.gz" -C "$STORY_TMP" --no-same-owner
STORY_SOURCE="$STORY_TMP/story-$STORY_REV"
for tool in snapshot.py verify.py; do
  cmp -- "$STORY_SOURCE/deploy/$tool" "/opt/story/bin/$tool"
done
STORY_PREVIOUS=$(readlink -f /opt/story/current)
[[ $STORY_PREVIOUS == /opt/story/releases/* ]]
STORY_OLD_REV=$(cat /opt/story/current/REVISION)
[[ $STORY_OLD_REV =~ ^[0-9a-f]{40}$ ]]
python3 "$STORY_SOURCE/deploy/verify.py" "$STORY_OLD_REV"
python3 "$STORY_SOURCE/deploy/verify.py" "$STORY_OLD_REV" --https
printf '仓库：%s\n目标提交：%s\n' "$STORY_REPO" "$STORY_REV"
# 原更新工具完成固定提交下载、新目录依赖/构建/测试、一致性备份、切换、重启和健康检查。
# 旧发行版已裁剪开发依赖，构建工具需在新目录恢复；不修改旧目录和系统 Node。
bash "$STORY_SOURCE/deploy/update.sh" "$STORY_REV"
[[ -s /opt/story/last-backup/story.sqlite && -s /opt/story/last-backup/story.env ]]
printf '本机更新检查通过；公网功能请在浏览器验收。\n旧代码保留：%s\n' "$STORY_PREVIOUS"
printf '仅代码回滚命令（先核对版本兼容，不恢复旧数据库）：sudo /opt/story/bin/rollback.sh %q\n' "$STORY_PREVIOUS"
STORY_UPDATE
```

备份与旧版本的实际路径由运行结果输出，用户回传后再记录实测状态。上述命令仅在临时下载目录清理文件，不删除业务数据、已有 release、备份、配置或上传目录，不操作自然图鉴的服务与配置。保留数据不等于备份覆盖了所有文件：现有工具备份 SQLite 与环境文件，未覆盖 uploads/TLS；当前应用没有上传功能，若实际存在额外业务文件，应先补齐备份方案。

## 本次构思流程验证与回退范围

2026-11-03：Node 8/8、Vite 构建、桌面与手机 Playwright 交互通过（合成数据、本地模拟模型），真实 AI 未调用，生产未验证。新增 planning 为作品 JSON 的可选字段，无依赖与表结构改动。旧应用未必保留该字段，回退前应导出含构思信息的 JSON 和数据库一致性备份；保留现有章节，不恢复旧库覆盖新写作内容。

## 下一次发布必须记录

记录日期、完整固定 SHA、变更范围、依赖是否变化、远程存在性证据、实际服务器目录/服务/端口、完整命令、备份目录、切换前后 release、检查结果和用户线上验收。命令应包含必要下载、备份、依赖处理、构建、重启和健康检查；失败立即停止，不能打印成功。

现有 /opt/story/bin/update.sh 方案：固定 SHA fetch → 新 release 中全量 npm ci/build/test/prune → SQLite backup API 一致性备份及配置备份 → 原子切换 current → 只重启 story-writing → HTTP/HTTPS 版本、首页、401 和 nature-photo 状态/PID 核验。其安装状态和内容需先与实机比对；不能认为仓库脚本就是已安装脚本。当前尚未实现依赖不变复用或 codeload 回退。若更新路径需要这些能力，先单独实现并验证后再生成该次命令。保留 TLS、校验与原始权限。

## 备份、失败与回退合同

- 构建或切换前备份失败：停止，保留旧服务和 current，不继续切换。
- 现有 snapshot.py 使用 SQLite backup API、quick_check，保存 story.sqlite、环境配置和 previous-release。备份目录仅 root 可用；不要提交或回传内容。uploads 和 TLS 不在当前快照范围内，实机若有额外数据必须补充备份。
- 切换后失败：现有脚本停止新的 story-writing，保留旧 release 与备份，输出真实旧路径；不得自动恢复旧数据库或操作自然图鉴。
- 代码回滚：先验证真实目标为保留的 /opt/story/releases 内目录，核对其 REVISION、兼容性和工具内容；rollback.sh 会先备份当前数据再切换代码，只重启 story-writing，校验 HTTP/HTTPS 和自然图鉴状态。数据库、上传文件、密钥不会被还原。
- 本次未知实机 previous-release，故不提供可误执行的回滚目标。发生实际发布时将脚本输出的具体旧路径及完整回退命令记入该次记录。
- 书架版降级到单作品版看不到升级后的编辑，不得继续在旧版创作；优先恢复兼容书架版本。数据库恢复是独立操作，必须核对范围、当前数据备份与副本恢复演练。
