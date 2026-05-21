# Knowledge Graph KB

本项目是一个本地优先的知识图谱知识库工作台。它把文档导入、图谱浏览、来源追溯、结构化检索和知识问答放在同一个单实例应用里，适合个人或小团队在本机整理私有资料。

后端使用 `FastAPI + SQLite + FAISS`，前端使用 `React + Pixi.js`。默认数据写入本地 `data/kb`，模型服务配置通过前端页面保存，不通过 `.env` 写入 API key。

## 功能概览

- **图谱工作区**：查看语义图、证据图和结构图，支持全局/局部图、聚焦、重排、布局保存。
- **导入中心**：支持上传文件、粘贴文本、扫描目录，导入任务可查看进度、取消、重试和追踪文件结果。
- **知识问答**：基于当前来源范围做检索增强问答，展示引用证据、检索 trace 和结构化检索结果。
- **来源管理**：查看来源详情、段落、表格预览，支持来源更新和删除。
- **图谱编辑**：支持节点创建、重命名、删除，关系删除和手工关系维护。
- **本地运维**：提供健康检查、备份、恢复、向量重建和图谱修复命令。

## 项目结构

```text
.
├─ main.py                  # 本地兼容入口，转发到 src.cli
├─ src/
│  ├─ app.py                # FastAPI 应用工厂、CORS、路由和前端静态资源注册
│  ├─ cli.py                # serve / doctor / backup / restore / rebuild-* 命令
│  ├─ api/                  # HTTP 路由、schema、错误处理和依赖注入
│  ├─ config/               # 运行时配置、路径解析、根 .env 自动创建
│  ├─ kb/                   # 导入、检索、图谱、存储、模型网关等核心逻辑
│  ├─ utils/                # 日志、文件和密钥工具
│  └─ web/                  # 前端 dist 托管与缺失构建产物提示页
├─ frontend/
│  ├─ src/app/              # React 入口和应用样式
│  ├─ src/features/         # 图谱工作台、导入中心、问答页面
│  ├─ src/shared/           # 前端 API client、类型和共享工具
│  └─ tests/                # 前端组件和交互测试
└─ data/kb/                 # 默认本地数据目录，运行时自动创建
```

## 环境要求

- Python `3.12+`
- `uv`
- Node.js
- `pnpm`，前端包声明使用 `pnpm@10.15.1`

## 快速启动

### 1. 安装后端依赖

```bash
uv sync --all-extras
```

### 2. 启动后端

```bash
uv run python main.py
```

等价命令：

```bash
uv run python main.py serve
```

默认监听：

```text
http://127.0.0.1:8000
```

第一次加载配置时，程序会在项目根目录自动创建 `.env`。如果 `frontend/dist` 还没有构建，访问 `/` 会看到中文提示页；API 仍然可用。

### 3. 启动前端开发服务器

另开一个终端：

```bash
cd frontend
pnpm install
pnpm dev
```

前端开发服务器如果需要代理 `/api` 到后端，设置：

```bash
KB_FRONTEND_API_PROXY_TARGET=http://127.0.0.1:8000 pnpm dev
```

Windows PowerShell：

```powershell
$env:KB_FRONTEND_API_PROXY_TARGET="http://127.0.0.1:8000"
pnpm dev
```

## 单服务运行前端页面

如果想让后端直接托管前端页面，先构建前端：

```bash
cd frontend
pnpm install
pnpm build
cd ..
uv run python main.py
```

后端会从 `FRONTEND_DIST_DIR` 指向的目录读取构建产物，默认是：

```text
./frontend/dist
```

## 配置规则

配置分为后端运行配置和前端开发配置，不要混在一起。

### 后端 `.env`

后端只读取项目根目录 `.env` 和 shell 环境变量。根目录 `.env` 缺失时会自动创建，默认内容来自 `src/config/settings.py`。

常用字段：

```text
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
KB_DATA_DIR=./data/kb
FRONTEND_DIST_DIR=./frontend/dist
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

根目录 `.env.example` 只是字段参考，不会被应用加载，也不需要复制成 `.env`。

### 前端 `frontend/.env`

Vite 只从 `frontend/.env` 和 shell 环境变量读取前端开发配置。不要把 `KB_FRONTEND_*` 写到根目录 `.env`。

常用字段：

```text
KB_FRONTEND_API_PROXY_TARGET=http://127.0.0.1:8000
KB_FRONTEND_DEV_HOST=
KB_FRONTEND_DEV_PORT=
```

`frontend/.env.example` 也是参考文件，不参与运行时加载。

### 模型和 API key

模型 provider、base URL、模型名和 API key 在前端“模型配置”里保存。API key 不应该写进 `.env` 或 `.env.example`。

## CLI 运维命令

```bash
uv run python main.py doctor
uv run python main.py backup --output-dir ./data/backups/manual
uv run python main.py restore ./data/backups/manual --force
uv run python main.py rebuild-vectors
uv run python main.py rebuild-graph
```

说明：

- `doctor`：检查本地运行状态和数据完整性。
- `backup`：备份本地知识库数据。
- `restore`：从备份目录恢复数据，`--force` 会覆盖非空目标目录。
- `rebuild-vectors`：根据已存段落重建 FAISS 向量索引。
- `rebuild-graph`：修复图谱完整性并清理孤立记录。

## API 分组

- `/api/system/*`：健康检查和 readiness。
- `/api/kb/config/model`：模型配置读取、更新和连通性测试。
- `/api/kb/imports/*`：导入任务提交、查询、取消和重试。
- `/api/kb/chat/*`：问答会话和消息。
- `/api/kb/search/*`：段落/表格记录、实体、关系和来源检索。
- `/api/kb/graph/*`：图谱浏览、节点管理、边管理和手工关系。
- `/api/kb/sources/*`：来源列表、详情、更新、删除、段落和表格预览。

## 验证命令

后端：

```bash
uv run python -m compileall main.py src tests
uv run pytest -q
```

前端：

```bash
cd frontend
pnpm test
pnpm build
```

## 数据与安全边界

- 默认数据目录是 `./data/kb`。
- SQLite 数据库默认是 `data/kb/kb.sqlite3`。
- FAISS 索引默认在 `data/kb/vector_index`。
- 上传文件默认在 `data/kb/uploads`。
- 模型配置密钥默认在 `data/kb/secrets/model_config.key`。
- `.env`、本地数据库、上传文件、索引和密钥都属于本地运行状态，不应提交到仓库。
