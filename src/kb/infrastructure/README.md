# Infrastructure Layer Guide

`src/kb/infrastructure/` 存放业务用例层依赖的外部系统适配。

## 目录职责

### `database/`

- SQLite 连接、事务和迁移。

### `storage/`

- 基于 SQLite 和本地文件的持久化读写。
- 对上层暴露 store，不直接承载业务用例编排。

### `providers/`

- 外部模型和第三方服务适配。
- 当前主要是 OpenAI 兼容模型网关。
