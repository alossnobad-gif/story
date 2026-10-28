# 叙事 · 私人小说创作工作室

React + Vite 前端，Node.js 24 + Express + SQLite 后端。支持多作品书架，默认中文界面、通义千问接口，适合个人在阿里云 ECS 部署。产品构想和当前边界见 [产品说明](docs/PRODUCT.md)。

## 作品书架

点击现有「作品」模块进入书架，可以新建、搜索、排序和编辑作品信息。打开作品后写作，返回书架前会先保存当前正文。每部作品独立保存章节、事件与角色。删除会移入回收站，可恢复；当前不提供永久删除。

从单作品版升级时，原稿自动迁入书架一次，不覆盖原始 workspace 记录。更新前请确认旧页面已自动保存，更新后刷新页面。旧页面的保存请求会收到刷新提示，避免旧格式覆盖新书架。书架列表只读取作品摘要，不一次性载入所有正文。

当前最多同时保存 200 部作品；回收站作品不占此限额。JSON 导出和恢复针对当前打开的一部作品；服务器数据库备份包含整个书架。

## 本地开发

```bash
npm ci
cp .env.example .env
# 可选：在 .env 配置 AI_API_KEY；不配置时界面明确显示预置示例。
npm run server
# 另一个终端
npm run dev
```

开发界面端口为 5173，API 代理至 3001。后端开发默认绑定 127.0.0.1；若开放网络访问，务必设置 APP_PASSWORD。需要 Node.js 24.5 或更新的 24.x 版本（使用内置 node:sqlite，运行时可能提示实验性 API）。

```bash
npm test
npm run build
npm start
```

构建后由后端在 3001 端口提供页面。数据保存在 data/story.sqlite，不能只备份前端文件。

## 当前阿里云 Ubuntu 服务器（推荐 systemd）

针对已有自然图鉴的 `123.57.60.66`，采用独立 Node 24、systemd、3101 回环端口和 8443 HTTPS 入口，数据/密钥位于代码目录之外。完整隔离、固定提交更新、资源限制、备份和回滚约定见 [Ubuntu 部署说明](docs/DEPLOY_ALIYUN.md)。下方 Docker 方案为其他服务器的可选部署方式，不应用于覆盖现有自然图鉴配置。

## 其他服务器：可选 Docker 部署

目前没有获取到 photo 项目地址，因此本项目提供独立部署方式，未宣称与 photo 服务器配置一致。

服务器需要 Git、Docker Engine 和 Docker Compose 插件。首次部署：

```bash
git clone https://github.com/alossnobad-gif/story.git
cd story
cp .env.example .env
# 用编辑器填写 APP_PASSWORD（至少 12 字符），可选填写 AI_API_KEY。
# 当前代码需要先由你提交并推送到仓库，服务器才能拉取。
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3001/api/health
```

默认只发布到服务器回环地址，适合由 Nginx 反向代理。容器通过命名卷持久化数据库。不要执行 `docker compose down -v`，它会删除数据卷。

### 临时通过公网 IP 访问

在 .env 增加：

```dotenv
BIND_IP=0.0.0.0
PUBLISH_PORT=3001
COOKIE_SECURE=false
```

重建服务 `docker compose up -d`，并在阿里云安全组允许自己的来源 IP 访问 TCP 3001。浏览器打开 `http://服务器公网IP:3001`，使用 APP_PASSWORD 登录。HTTP 会明文传输密码，公网长期使用应配置 HTTPS；无需修改前端 API 地址或重新写死 IP。

### 域名 + HTTPS（长期使用）

域名解析到 ECS 公网 IP，按阿里云要求完成备案并配置可信 TLS 证书。保持 BIND_IP=127.0.0.1，只在安全组开放 80/443。将 .env 设置 COOKIE_SECURE=true、TRUST_PROXY=true。Nginx 站点的 HTTPS server 内配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 8m;
}
```

保存后 `docker compose up -d` 并测试 Nginx 配置后重载。不要将 TRUST_PROXY=true 与可被公网直接访问的后端同时使用。

## 通义千问

在阿里云百炼开通模型服务，使用与你选择地域一致的 API Key。在服务器 .env 设置真实密钥，不要提交到 Git：

- `AI_API_KEY`：百炼密钥。
- `AI_MODEL=qwen-plus`：可换为账户有权限的模型。
- `AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`：默认中国内地地域。其他地域请根据百炼官方文档改为对应地址和密钥。

修改后运行 `docker compose up -d --force-recreate`。模型生成会发送当前章节末尾最多 14000 字符、最多 20 条本章事件（每条内容最多 2000 字符）、最多 30 位角色（每位设定最多 1500 字符）和创作要求；产生服务商费用。当前版本串行生成，90 秒超时。服务商错误会明确提示，不会悄悄用示例代替。

## 素材导入格式

JSON 为事件数组（或 `{ "events": [...] }`）：

```json
[{"title":"雨夜赴约","content":"人物目标、冲突、选择、结果…","source":"原创 / 已授权资料"}]
```

TXT/Markdown 以独占一行的 `---` 分隔，每段第一行为事件标题。单文件最多 2MB，最多 2000 条事件。请核实来源与授权。

## 备份、恢复与更新

界面导出 JSON 包含全部章节、素材与角色，TXT/Markdown 只包含正文。服务器完整备份推荐停止容器后复制数据库与 WAL 文件：

```bash
docker compose stop story
mkdir -p backups
docker compose cp story:/app/data ./backups/data
# 将 backups 安全复制到另一台机器，再启动。
docker compose start story
```

备份目录已存在时先换一个新的日期目录，避免嵌套混淆。恢复时停止 story，将备份目录中的数据库文件复制回容器的 /app/data/，确保归属 node 用户后再启动。请先在备用环境演练恢复。

更新：先备份，再 `git pull --ff-only`，然后 `docker compose up -d --build`。当前尚无自动数据库迁移或版本历史。可在工作室设置中通过“恢复 JSON 备份”载入完整作品；恢复只替换当前打开的作品，不影响书架上的其他作品，操作前先下载当前作品备份。

## 安全与运行边界

单工作室密码保护，所有已登录会话共享书架，不适合多租户服务。会话保存在内存中，服务重启需要重新登录。冲突检测会阻止旧窗口覆盖新稿，按提示导出旧窗口内容后再刷新。离线无法保存，退出前确认“已自动保存”。不要向不可信用户开放代理 AI 调用。生产环境没有至少 12 字符密码时会拒绝启动。
