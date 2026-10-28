#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
ROOT=/opt/story
REVISION=${1:-}
SOURCE=${2:-}
STEP=初始检查
exec 8>/run/lock/story-writing-bootstrap.lock
flock -n 8 || { echo "另一个首次部署任务正在执行。" >&2; exit 1; }
on_error() {
    local exit_code=$?
    trap - ERR
    printf '\n首次部署中止，步骤：%s，退出码：%s。请反馈错误；未继续执行后续步骤。\n' "$STEP" "$exit_code" >&2
    exit "$exit_code"
}
trap on_error ERR
[[ $EUID -eq 0 ]] || { echo '请使用 sudo 执行。' >&2; exit 1; }
[[ $REVISION =~ ^[0-9a-f]{40}$ && -d $SOURCE/deploy ]] || exit 1
[[ $(git -C "$SOURCE" rev-parse --verify 'HEAD^{commit}') == "$REVISION" ]] || exit 1
git -C "$SOURCE" diff --quiet HEAD -- deploy
for command in git curl openssl python3 tar xz sha256sum systemctl systemd-run systemd-analyze nginx runuser useradd flock timeout ss nice; do
    command -v "$command" >/dev/null || { printf '缺少工具：%s。未安装或修改系统，请反馈。\n' "$command" >&2; exit 1; }
done
[[ $(uname -m) == x86_64 ]] || { echo '当前固定的独立 Node 包只适用于 x86_64。' >&2; exit 1; }
[[ -d /etc/nginx/sites-enabled && -d /etc/nginx/sites-available ]] || exit 1
nginx -t
systemctl is-active --quiet nginx
systemctl is-active --quiet nature-photo
PHOTO_PID=$(systemctl show nature-photo -p MainPID --value)
AVAILABLE_KB=$(df -Pk /opt | awk 'NR==2 {print $4}')
MEMORY_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
(( AVAILABLE_KB >= 1572864 )) || { echo '可用磁盘不足 1.5 GiB，部署已停止。' >&2; exit 1; }
(( MEMORY_KB >= 524288 )) || { echo '当前可用内存不足 512 MiB，部署已停止。' >&2; exit 1; }
for port in 3101 8443; do
    [[ -z $(ss -H -ltn "sport = :$port") ]] || { printf '端口 %s 已被占用，未执行部署。\n' "$port" >&2; exit 1; }
done
if [[ -e $ROOT || -L $ROOT ]]; then
    [[ -f $ROOT/.managed-by-story-writing && $(cat "$ROOT/.managed-by-story-writing") == story-writing-v1 ]] || { echo '/opt/story 已存在且不是本脚本管理的目录，拒绝修改。' >&2; exit 1; }
    [[ ! -e $ROOT/current && ! -L $ROOT/current ]] || { echo '已有版本或部分部署，请反馈状态；不要重新执行首次部署。' >&2; exit 1; }
else
    for path in /var/lib/story-writing /var/cache/story-writing /var/backups/story-writing /etc/story-writing /etc/systemd/system/story-writing.service /etc/nginx/sites-available/story-writing /etc/nginx/sites-enabled/story-writing /etc/nginx/conf.d/story-writing.conf; do
        [[ ! -e $path && ! -L $path ]] || { printf '保留路径已被占用：%s，拒绝覆盖。\n' "$path" >&2; exit 1; }
    done
    ! getent passwd story-writing >/dev/null || { echo '用户 story-writing 已存在，拒绝改动其权限。' >&2; exit 1; }
    ! getent group story-writing >/dev/null || { echo '组 story-writing 已存在，拒绝复用未知组。' >&2; exit 1; }
    [[ $(systemctl show story-writing.service -p LoadState --value) == not-found ]] || exit 1
    install -d -o root -g root -m 0755 "$ROOT"
    printf '%s\n' story-writing-v1 > "$ROOT/.managed-by-story-writing"
fi
STEP=创建叙事专属目录和账号
if ! getent passwd story-writing >/dev/null; then
    useradd --system --user-group --home-dir /var/lib/story-writing --no-create-home --shell /usr/sbin/nologin story-writing
fi
install -d -o root -g root -m 0755 "$ROOT/releases" "$ROOT/runtimes"
install -d -o root -g root -m 0700 "$ROOT/bin" /etc/story-writing /etc/story-writing/tls /var/backups/story-writing
install -d -o story-writing -g story-writing -m 0750 /var/lib/story-writing /var/lib/story-writing/data /var/lib/story-writing/uploads /var/cache/story-writing
STEP=安装独立且校验过的Node运行时
NODE_VERSION=v24.22.1
NODE_ARCHIVE="node-$NODE_VERSION-linux-x64.tar.xz"
NODE_SHA256=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6
NODE_DIR="$ROOT/runtimes/node-$NODE_VERSION-linux-x64"
if [[ ! -d $NODE_DIR ]]; then
    DOWNLOAD=$(mktemp -d "$ROOT/runtimes/.download.XXXXXX")
    curl --proto '=https' --tlsv1.2 --fail --location --retry 2 --connect-timeout 20 --max-time 900 --limit-rate 256K \
        "https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE" -o "$DOWNLOAD/$NODE_ARCHIVE"
    (cd "$DOWNLOAD"; printf '%s  %s\n' "$NODE_SHA256" "$NODE_ARCHIVE" | sha256sum --check --strict)
    tar --extract --xz --file="$DOWNLOAD/$NODE_ARCHIVE" --directory="$ROOT/runtimes" --no-same-owner
    rm -- "$DOWNLOAD/$NODE_ARCHIVE"
    rmdir "$DOWNLOAD"
fi
chown -hR root:story-writing "$NODE_DIR"
chmod -R u=rwX,g=rX,o= "$NODE_DIR"
[[ $("$NODE_DIR/bin/node" --version) == "$NODE_VERSION" ]] || exit 1
if [[ -e $ROOT/runtime || -L $ROOT/runtime ]]; then
    [[ -L $ROOT/runtime && $(readlink -f "$ROOT/runtime") == "$NODE_DIR" ]] || exit 1
else
    ln -s "$NODE_DIR" "$ROOT/runtime"
fi
STEP=保存独立登录密码和可选AI配置
if [[ ! -e /etc/story-writing/story.env ]]; then
    python3 "$SOURCE/deploy/configure.py"
else
    echo '保留已有的叙事环境配置，不读取或回显其值。'
fi
STEP=生成叙事专属自签名证书
if [[ ! -e /etc/story-writing/tls/server.crt && ! -e /etc/story-writing/tls/server.key ]]; then
    openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
        -keyout /etc/story-writing/tls/server.key -out /etc/story-writing/tls/server.crt \
        -subj '/CN=123.57.60.66' -addext 'subjectAltName=IP:123.57.60.66,IP:127.0.0.1'
    chmod 0600 /etc/story-writing/tls/server.key
    chmod 0644 /etc/story-writing/tls/server.crt
fi
openssl x509 -in /etc/story-writing/tls/server.crt -checkend 86400 -noout
[[ -s /etc/story-writing/tls/server.key ]] || exit 1
STEP=安装独立服务和叙事辅助脚本
for script in update.sh rollback.sh verify.py snapshot.py; do
    install -o root -g root -m 0750 "$SOURCE/deploy/$script" "$ROOT/bin/$script"
done
UNIT=/etc/systemd/system/story-writing.service
if [[ -e $UNIT || -L $UNIT ]]; then
    cmp --silent "$SOURCE/deploy/story-writing.service" "$UNIT" || { echo '已有同名服务配置与模板不同，拒绝覆盖。' >&2; exit 1; }
else
    (set -o noclobber; cat "$SOURCE/deploy/story-writing.service" > "$UNIT")
    chmod 0644 "$UNIT"
fi
systemd-analyze verify "$UNIT"
systemctl daemon-reload
STEP=安装构建和启动叙事
"$ROOT/bin/update.sh" "$REVISION" initial
STEP=新增叙事HTTPS站点
SITE=/etc/nginx/sites-available/story-writing
if [[ -e $SITE || -L $SITE ]]; then
    cmp --silent "$SOURCE/deploy/story-writing.nginx" "$SITE" || { echo '已有同名 Nginx 配置不同，拒绝覆盖。' >&2; exit 1; }
else
    (set -o noclobber; cat "$SOURCE/deploy/story-writing.nginx" > "$SITE")
    chmod 0644 "$SITE"
fi
[[ ! -e /etc/nginx/sites-enabled/story-writing && ! -L /etc/nginx/sites-enabled/story-writing ]] || exit 1
ln -s "$SITE" /etc/nginx/sites-enabled/story-writing
if ! nginx -t; then
    rm -- /etc/nginx/sites-enabled/story-writing
    echo '新增站点未通过检查，已取消它的启用；没有重载 Nginx。' >&2
    exit 1
fi
systemctl reload nginx
STEP=核验独立HTTPS和原有项目
python3 "$ROOT/bin/verify.py" "$REVISION" --https
systemctl is-active --quiet story-writing
systemctl is-active --quiet nature-photo
[[ $(systemctl show nature-photo -p MainPID --value) == "$PHOTO_PID" ]] || { echo '原项目 PID 发生变化，请反馈检查结果。' >&2; exit 1; }
systemctl enable story-writing
printf '\n服务器本机核验通过，提交：%s\n访问地址：https://123.57.60.66:8443\n请在阿里云安全组放行 TCP 8443，再从浏览器验证公网访问。\n' "$REVISION"
printf '自然图鉴保持运行，PID：%s；其代码、数据、账号和证书未修改。\n' "$PHOTO_PID"
printf '叙事自签名证书指纹（浏览器首次访问会提示不受信任）：\n'
openssl x509 -in /etc/story-writing/tls/server.crt -noout -fingerprint -sha256
