#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
ROOT=/opt/story
REPO=https://github.com/alossnobad-gif/story.git
REVISION=${1:-}
MODE=${2:-update}
STEP=检查参数
on_error() {
    local exit_code=$?
    trap - ERR
    printf '\n部署失败，步骤：%s，退出码：%s。请反馈错误；未继续执行后续步骤。\n' "$STEP" "$exit_code" >&2
    exit "$exit_code"
}
trap on_error ERR
[[ $EUID -eq 0 ]] || { echo '请使用 sudo 执行。' >&2; exit 1; }
[[ $REVISION =~ ^[0-9a-f]{40}$ ]] || { echo '需要完整的 40 位提交 SHA。' >&2; exit 1; }
[[ $MODE == update || $MODE == initial ]] || exit 1
[[ -f $ROOT/.managed-by-story-writing && $(cat "$ROOT/.managed-by-story-writing") == story-writing-v1 ]] || exit 1
exec 9>/run/lock/story-writing-deploy.lock
flock -n 9 || { echo '另一个叙事部署任务正在执行。' >&2; exit 1; }
[[ -x $ROOT/runtime/bin/node && -f /etc/story-writing/story.env ]] || exit 1
[[ ! -e $ROOT/current || -L $ROOT/current ]] || { echo 'current 不是符号链接，拒绝替换。' >&2; exit 1; }
PREVIOUS=
if [[ -L $ROOT/current ]]; then
    PREVIOUS=$(readlink -f "$ROOT/current")
    [[ $PREVIOUS == "$ROOT/releases/"* && -d $PREVIOUS ]] || exit 1
fi
if [[ $MODE == initial ]]; then
    [[ -z $PREVIOUS ]] || { echo '已有部署版本，不能再次使用 initial。' >&2; exit 1; }
else
    [[ -n $PREVIOUS && -L /etc/nginx/sites-enabled/story-writing ]] || { echo '首次部署尚未完成，请反馈错误；不要直接执行更新。' >&2; exit 1; }
    systemctl is-active --quiet story-writing
    systemctl is-active --quiet nature-photo
    nginx -t
fi
AVAILABLE_KB=$(df -Pk /opt | awk 'NR==2 {print $4}')
MEMORY_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
(( AVAILABLE_KB >= 1048576 )) || { echo '可用磁盘不足 1 GiB，保留旧版并停止更新。' >&2; exit 1; }
(( MEMORY_KB >= 524288 )) || { echo '当前可用内存不足 512 MiB，保留旧版并停止更新。' >&2; exit 1; }
PHOTO_PID=$(systemctl show nature-photo -p MainPID --value)
STEP=获取固定提交
if [[ ! -d $ROOT/repository.git ]]; then
    git init --bare "$ROOT/repository.git"
    git --git-dir="$ROOT/repository.git" remote add origin "$REPO"
fi
[[ $(git --git-dir="$ROOT/repository.git" remote get-url origin) == "$REPO" ]] || exit 1
git --git-dir="$ROOT/repository.git" fetch --no-tags --depth=1 origin "$REVISION"
[[ $(git --git-dir="$ROOT/repository.git" rev-parse --verify 'FETCH_HEAD^{commit}') == "$REVISION" ]] || exit 1
RELEASE=$(mktemp -d "$ROOT/releases/${REVISION}.XXXXXX")
git --git-dir="$ROOT/repository.git" archive "$REVISION" | tar -x -C "$RELEASE"
chown -hR story-writing:story-writing "$RELEASE"
STEP=限额安装依赖和构建测试
UNIT="story-writing-build-$(date +%s)-$$"
systemd-run --quiet --wait --collect --pipe --unit="$UNIT" \
    -p User=story-writing -p Group=story-writing -p WorkingDirectory="$RELEASE" \
    -p MemoryMax=640M -p CPUQuota=75% -p Nice=10 -p TasksMax=96 \
    --setenv="PATH=$ROOT/runtime/bin:/usr/bin:/bin" \
    --setenv=HOME=/var/cache/story-writing \
    --setenv=NODE_OPTIONS=--max-old-space-size=384 \
    /bin/bash -c 'set -Eeuo pipefail
      npm ci --include=dev --cache /var/cache/story-writing/npm --maxsockets=2 --no-audit --no-fund
      npm run build
      npm test
      npm prune --omit=dev --ignore-scripts --cache /var/cache/story-writing/npm --maxsockets=2 --no-audit --no-fund'
[[ -f $RELEASE/dist/index.html ]]
printf '%s\n' "$REVISION" > "$RELEASE/REVISION"
chown -hR root:story-writing "$RELEASE"
chmod -R u=rwX,g=rX,o= "$RELEASE"
STEP=备份数据库和环境配置
BACKUP="/var/backups/story-writing/$(date -u +%Y%m%dT%H%M%SZ)-${REVISION:0:12}-$$"
timeout 90s python3 "$ROOT/bin/snapshot.py" "$BACKUP"
[[ ! -e $ROOT/last-backup || -L $ROOT/last-backup ]] || exit 1
ln -s "$BACKUP" "$ROOT/.last-backup-next-$$"
mv -Tf "$ROOT/.last-backup-next-$$" "$ROOT/last-backup"
STEP=切换叙事版本
ln -s "$RELEASE" "$ROOT/.current-next-$$"
mv -Tf "$ROOT/.current-next-$$" "$ROOT/current"
failed_after_switch() {
    systemctl stop story-writing || true
    printf '\n新版本检查失败，已停止叙事；自然图鉴未执行停止或重启。\n' >&2
    if [[ -n $PREVIOUS ]]; then
        printf '旧版本保留在：%s\n回滚命令：sudo /opt/story/bin/rollback.sh %q\n' "$PREVIOUS" "$PREVIOUS" >&2
    fi
    printf '备份位置：%s\n' "$BACKUP" >&2
    exit 1
}
STEP=启动叙事并核验版本
if ! systemctl restart story-writing; then failed_after_switch; fi
READY=0
for ((i=0;i<30;i++)); do
    if systemctl is-active --quiet story-writing && python3 "$ROOT/bin/verify.py" "$REVISION" >/dev/null 2>&1; then READY=1; break; fi
    if systemctl is-failed --quiet story-writing; then break; fi
    sleep 1
done
[[ $READY == 1 ]] || failed_after_switch
python3 "$ROOT/bin/verify.py" "$REVISION"
if [[ $MODE == update ]]; then
    if ! python3 "$ROOT/bin/verify.py" "$REVISION" --https; then failed_after_switch; fi
fi
STEP=核验原有项目状态
systemctl is-active --quiet nature-photo
[[ $(systemctl show nature-photo -p MainPID --value) == "$PHOTO_PID" ]] || { echo '自然图鉴 PID 在部署期间发生变化；停止成功声明，请检查原项目。' >&2; exit 1; }
STEP=更新叙事专属辅助脚本
for script in update.sh rollback.sh verify.py snapshot.py; do
    install -o root -g root -m 0750 "$RELEASE/deploy/$script" "$ROOT/bin/.$script.next-$$"
    mv -Tf "$ROOT/bin/.$script.next-$$" "$ROOT/bin/$script"
done
printf '\n当前叙事提交：%s\n当前代码目录：%s\n备份：%s\n' "$REVISION" "$RELEASE" "$BACKUP"
if [[ $MODE == update ]]; then
    printf '更新通过本机 HTTP/HTTPS 核验；公网访问仍请浏览器确认。\n'
else
    printf '应用本机 HTTP 核验通过，继续配置独立 HTTPS 站点。\n'
fi
