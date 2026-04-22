# 前端图谱工作台 TODO

本文档只保留尚未完成或仍需验证的事项。已经落地的工作区拆分、模型配置浮层、布局持久化、节点固定、产品化错误提示和第一版导入/问答工作台不再在这里重复记录。

## 未完成任务总览

下一批继续聚焦：

1. 关系 / 标签高级筛选。
2. 图谱分组配色与图例。
3. 拼音 / 模糊搜索。
4. 物理交互细节加固。
5. 后端能力补齐：回收站、记忆控制、向量重建、模型配置语义拆分。
6. `graphRuntime.ts` 后续分层拆分。

## 1. 关系 / 标签高级筛选

### 当前缺口

现有筛选仍偏基础，主要围绕来源范围、图谱视图、密度、搜索、全局 / 局部切换。大图下还缺少更精细的控制：

- 节点类型。
- 节点标签。
- 关系类型。
- 关系标签。
- 是否只看手工关系。
- 是否只看证据关系。
- 最小证据数量。
- 最小关系权重。

### 规划

从当前 graph 数据中提取候选项：

- `node.type`
- `node.kind_label`
- `node.family`
- `edge.type`
- `edge.relation_kind_label`
- `edge.family`
- `node.evidence_count`
- `edge.weight`

新增图谱筛选状态：

- `enabled_node_types`
- `enabled_node_labels`
- `enabled_edge_types`
- `enabled_relation_labels`
- `min_evidence_count`
- `min_edge_weight`
- `manual_only`
- `evidence_only`

实现边界：

- 筛选计算放在模型层。
- React 组件只负责展示控件和更新 state。
- 对筛选模型补单元测试。

### 验收标准

- 开关节点类型后，节点数量和边数量正确变化。
- 开关关系类型后，不相关边消失，孤立节点按规则处理。
- 最小权重筛选能稳定过滤低权重边。
- 筛选逻辑有模型层测试，删除核心筛选代码时测试会失败。

## 2. 图谱分组配色

### 当前缺口

当前颜色主要按 `node.type` 和 `edge.type` 固定映射。它能区分基础类型，但不能表达来源簇、语义簇、结构簇或社群。

### 规划

新增配色模式：

- 按节点类型。
- 按来源。
- 按 family：`semantic` / `evidence` / `structure`。
- 按前端社群分组。

社群分组第一版可以采用轻量算法：

- 基于当前可见边构建无向连通分量。
- 每个连通分量分配一种颜色。
- 对超大连通分量后续再考虑 Louvain / label propagation。

UI 增加：

- 配色依据选择。
- 图例 legend。
- 保留默认低干扰配色。

### 验收标准

- 切换配色模式后，节点和图例同步变化。
- 同一来源的节点颜色一致。
- 同一连通分量的节点颜色一致。
- 颜色不影响选中、高亮、hover 的可读性。

## 3. 拼音 / 模糊搜索

### 当前缺口

当前搜索主要依赖：

- `toLowerCase()`
- `includes()`
- 多字段拼接搜索

这对中文、拼音、错字、缩写不够友好。

### 规划

第一版先做无依赖模糊搜索：

- 多字段归一化：
  - label
  - display_label
  - id
  - kind_label
  - source_name
- 连续子串匹配。
- 字符序列匹配。
- 简单编辑距离或评分排序。
- 返回命中原因。

搜索结果展示：

- 名称命中。
- 类型命中。
- 来源命中。
- ID 命中。

拼音能力分两步：

1. 如果后端或数据 metadata 已有 alias / pinyin 字段，优先使用已有字段。
2. 如果没有，再评估引入轻量拼音库，避免无必要地增加包体积。

### 验收标准

- 搜索结果按匹配质量排序。
- 精确名称命中优先于模糊命中。
- ID 命中可以稳定定位节点。
- 搜索逻辑有测试覆盖。

## 4. 物理交互后续加固

### slider 变更节流

连接距离、斥力变化会重建 force simulation。后续需要对 slider 增加 debounce，或拆分为“预览值”和“应用值”，用户松手后再重建 simulation，避免大图下连续重建造成卡顿。

### 固定节点过多的释放策略

固定大量节点后，剩余节点可能被挤压。后续需要补充更细的释放命令：

- 释放当前邻域。
- 释放非选中节点。
- 固定核心节点、释放叶子节点。
- 图例中明确 fixed 节点视觉含义。

### hover 标签数量上限

全局标签关闭时，hover/选中上下文标签仍会临时显示。大图 hub 节点可能瞬间生成大量 Pixi Text，后续需要：

- 限制 hover 标签数量，例如最多 80 个。
- 按 degree、距离、是否一度邻居排序。
- 二度邻居只高亮点，不默认显示所有标签。

### 大图自动冻结分级

后续策略需要继续细化：

- 小图：持续物理，用户手动暂停。
- 中图：短时间运行，自动冻结。
- 大图：默认静态，只允许用户手动短时运行。
- 超大图：只做局部布局，不跑全图 simulation。

### 布局 key 是否包含 density

当前布局恢复策略仍需要产品确认是否应跨密度复用：

- 包含 `density`：不同节点集合更安全。
- 不包含 `density`：用户调整密度后更容易复用整理好的布局。

可选方向：

- 从 key 中移除 `density`。
- 恢复布局时只应用当前图谱中存在的节点。
- 对缺失节点忽略，对新增节点继续用默认初始位置。

## 5. 待后端补齐的功能

前端不应伪造尚未开放的 HTTP API。以下能力需要后端接口稳定后再接入：

- 回收站。
- 记忆强化 / 保护 / 冷冻。
- 向量重建任务接口与索引状态轮询。
- 自动迁移记忆。
- 时序回填。
- 导入文档或导入指南接口。
- 导入兼容页能力探测。

## 6. 模型配置语义拆分

当前前端已经把导入中心和知识问答的模型配置入口分开，但底层仍复用全局模型配置接口。后续需要后端和前端共同拆分语义。

### 后端任务

- 新增 `/api/kb/config/model/chat`：持久化问答 LLM、默认 `top_k`、引用数量、检索模式、引用策略。
- 新增 `/api/kb/config/model/import`：持久化 embedding、解析模型、默认导入策略、分块参数、索引策略。
- 保留 `/api/kb/config/model` 作为兼容入口或全局 provider/base URL/API Key 配置入口。
- 数据库存储区分全局连接配置、问答运行配置、导入/索引配置。
- `ConversationService` 读取问答专属配置。
- `ImportService`、向量索引和 `VectorParagraphRetriever` 读取导入/索引专属配置。
- embedding 模型变更继续触发索引失效/重建提示，不能在问答侧静默切换。

### 前端任务

- 问答模型配置聚焦 LLM、检索参数和引用策略。
- 导入模型配置聚焦 embedding、解析模型、分块策略和索引策略。
- 全局配置只保留 provider、base URL、API Key、默认模型组等公共设置。
- 后端接口拆分完成后，替换当前浮层内复用全局配置的临时实现。

## 7. runtime 后续拆分

`graphRuntime.ts` 仍然承担 Pixi 初始化、命中检测、物理模拟、拖拽、渲染、标签、viewport 控制。继续加功能前建议按以下方向拆分：

- `simulation`
- `hit testing`
- `layout persistence adapter`
- `rendering helpers`
- `viewport commands`

拆分原则：

- 每次只抽一个稳定边界。
- 不在拆分时改变运行时行为。
- 每次拆分后跑 TypeScript、单测和构建。

## 建议实施顺序

1. 关系 / 标签高级筛选。
2. 图谱分组配色 + 图例。
3. 拼音 / 模糊搜索。
4. 物理交互细节加固。
5. 后端接口补齐后接入回收站、记忆控制、向量重建和模型配置拆分。
6. 在功能稳定后拆 `graphRuntime.ts`。

## 技术边界

### 应优先修改

- `frontend/src/features/graph-workbench/runtime/graphRuntime.ts`
- `frontend/src/features/graph-workbench/model/*`
- `frontend/src/features/graph-workbench/components/GraphWorkbench.tsx`
- `frontend/src/features/graph-workbench/components/panels/*`
- `frontend/src/features/graph-workbench/components/workspaces/*`
- `frontend/src/app/app.css`

### 应避免

- 不应恢复旧 `frontend_backup` 里的单文件 HTML 实现。
- 不应重新引入 vis-network。
- 不应把筛选、配色、搜索算法直接塞进 React JSX。
- 不应为尚未开放的后端能力伪造 API 调用。

## 验证要求

每批完成后至少运行：

```bash
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm build
```

涉及核心算法时，需要补充单元测试。测试必须断言具体业务结果，例如可见节点 ID、边 ID、固定状态、搜索排序，而不是只判断结果非空。
