#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID -eq 0 ]] || { echo '请用 sudo 执行。' >&2; exit 1; }
TARGET=${1:-}
[[ $TARGET == /opt/story/releases/* && -d $TARGET && ! -L $TARGET ]] || { echo '回滚目标必须是保留的叙事 release 目录。' >&2; exit 1; }
TARGET=$(realpath -e "$TARGET")
[[ $TARGET == /opt/story/releases/* && -f $TARGET/REVISION && -f $TARGET/dist/index.html ]] || exit 1
REVISION=$(cat "$TARGET/REVISION")
[[ $REVISION =~ ^[0-9a-f]{40}$ ]] || exit 1
exec 9>/run/lock/story-writing-deploy.lock
flock -n 9 || { echo '叙事部署任务正在执行。' >&2; exit 1; }
systemctl is-active --quiet nature-photo
PHOTO_PID=$(systemctl show nature-photo -p MainPID --value)
BACKUP="/var/backups/story-writing/$(date -u +%Y%m%dT%H%M%SZ)-rollback-$$"
timeout 90s python3 /opt/story/bin/snapshot.py "$BACKUP"
ln -s "$TARGET" "/opt/story/.rollback-next-$$"
mv -Tf "/opt/story/.rollback-next-$$" /opt/story/current
if ! systemctl restart story-writing; then
    systemctl stop story-writing || true
    echo '回滚启动失败，已停止叙事；请反馈错误。' >&2
    exit 1
fi
READY=0
for ((i=0;i<30;i++)); do
    if systemctl is-active --quiet story-writing && python3 /opt/story/bin/verify.py "$REVISION" >/dev/null 2>&1; then READY=1; break; fi
    if systemctl is-failed --quiet story-writing; then break; fi
    sleep 1
done
if [[ $READY != 1 ]] || ! python3 /opt/story/bin/verify.py "$REVISION" --https; then
    systemctl stop story-writing || true
    echo '回滚校验失败，已停止叙事；请反馈错误。' >&2
    exit 1
fi
systemctl is-active --quiet nature-photo
[[ $(systemctl show nature-photo -p MainPID --value) == "$PHOTO_PID" ]] || exit 1
printf '代码已回滚至 %s。数据库、上传文件及当前配置未被替换。\n回滚前备份：%s\n' "$REVISION" "$BACKUP"
