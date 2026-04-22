# 知识图谱知识库

一个本地优先、单实例的知识图谱与知识问答工作台。后端基于 `FastAPI + SQLite + FAISS`，前端基于 `React + Pixi`。系统支持导入文本、文档、表格和结构化 JSON，并通过图谱浏览、来源追溯、结构化检索和问答完成知识整理。

## 主要能力

- 导入 `txt`、`pdf`、`docx`、`xlsx`、`xlsm`、`xls`
- 支持上传、粘贴、目录扫描、OpenIE JSON、转换后 JSON 导入
- 支持聊天问答、来源展开、检索 trace、引用证据查看
- 支持知识图谱浏览、节点创建、节点重命名、节点删除、边删除、手工关系创建
- 支持统一模型配置读写与连通性测试
- 支持本地运维命令：`doctor`、`backup`、`restore`、`rebuild-vectors`、`rebuild-graph`

## 当前结构

```text
src/
├─ api/                    # HTTP 路由、依赖注入、统一错误响应、Pydantic schema
├─ config/                 # 运行时配置与路径解析
├─ kb/
│  ├─ use_cases/           # 应用服务、检索、搜索、导入流水线
│  ├─ ingestion/           # 文档解析、切块、Excel 结构映射、证据渲染
│  ├─ infrastructure/      # SQLite、仓储、FAISS 向量索引、模型网关
│  └─ container.py         # 知识库运行时容器
├─ utils/                  # 日志、文件工具、密钥工具
└─ web/                    # 前端静态资源托管

frontend/
└─ src/
   ├─ app/                 # 应用级样式与入口
   ├─ features/
   │  └─ graph-workbench/
   │     ├─ components/    # 图谱、导入中心、知识问答工作区组件
   │     ├─ model/         # 图谱视图模型、布局状态、可读性规则
   │     └─ runtime/       # Pixi 图谱运行时
   └─ shared/              # API、类型与共享工具
```

## API 分组

- `/api/system/*`：健康检查与 readiness
- `/api/kb/config/model`：模型配置读取、更新、测试
- `/api/kb/imports/*`：导入任务提交、查询、取消、重试
- `/api/kb/chat/*`：会话与消息
- `/api/kb/search/*`：记录、实体、关系、来源检索
- `/api/kb/graph/*`：图谱浏览、节点管理、边管理、手工关系
- `/api/kb/sources/*`：来源列表、详情、更新、删除、段落、表格预览

## 本地运行

### 后端

```bash
uv sync --all-extras
uv run python main.py
```

默认地址：

```text
http://localhost:7999
```

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

## CLI 运维命令

```bash
uv run python main.py doctor
uv run python main.py backup --output-dir ./data/backups/manual
uv run python main.py restore ./data/backups/manual --force
uv run python main.py rebuild-vectors
uv run python main.py rebuild-graph
```

## 验证

```bash
uv run python -m compileall main.py src tests
uv run pytest -q

cd frontend
pnpm exec tsc --noEmit --pretty false
pnpm build
```
