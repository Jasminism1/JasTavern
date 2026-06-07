# task_plan.md — JasTavern SillyTavern 全面接入

> **目标**：删除 src/bridge/，全量接入 SillyTavern 系统（lorebook / preset / variable / chat / prompt assembly），通过 useSillytavern composable 与现有 Vue 组件联动。
>
> **设计文档**：`.superpowers/brainstorm/1099-1780818191/content/` 中的 architecture.html / design-files.html / dataflow.html

---

## 实施阶段

### Phase 1 — 依赖安装 + 目录准备
- [x] 确认 `dexie` 是否需安装（或已安装）
- [x] `npm install dexie`（若缺失）
- [x] 创建 `src/sillytavern/` 目录
- [x] 创建 `src/composables/` 目录
- [x] 添加 `.superpowers/` 到 `.gitignore`

### Phase 2 — 核心类型 + 数据库层
- [x] 复制 `templates/react/sillytavern/types.ts` → `src/sillytavern/types.ts`
- [x] 复制 `templates/react/sillytavern/database.ts` → `src/sillytavern/database.ts`（Dexie 适配）
- [x] 复制 `templates/react/sillytavern/editor-utils.ts` → `src/sillytavern/editor-utils.ts`

### Phase 3 — 引擎与算法层
- [x] 复制 `lorebook-engine.ts`（关键词匹配引擎）
- [x] 复制 `prompt-assembler.ts`（prompt 构建 + macro 替换）
- [x] 复制 `importer.ts`（ST JSON 导入/导出）
- [x] 复制 `variables.ts`（变量提取、合并、tree/branch 辅助）
- [x] 复制 `stream-parser.ts`（XML 标签流式解析）
- [x] 复制 `vars-merger.ts`（JSON 深合并）
- [x] 复制 `api-router.ts`（主 API + 可选次要 API 路由）
- [x] 创建 `src/sillytavern/index.ts`（统一导出 + VERSION）

### Phase 4 — Vue Composable
- [x] 创建 `src/composables/useSillytavern.ts`
  - 包装所有 SillyTavern 核心 API
  - 管理响应式状态（lorebooks、presets、settings、chats、activeChat、isSending）
  - sendMessage() 集成 assemblePrompt → API 调用 → extractVariables → conversationTree 存储
  - CRUD：createChat、deleteChat、editMessage、branchFromMessage、deleteMessagesFrom
  - 独立模式 fallback（API key 未配置时使用 mock 响应）

### Phase 5 — 清理 Bridge + 更新 main.ts
- [x] 删除 `src/bridge/` 全部文件
- [x] 更新 `src/main.ts`：移除 bridge import，改用 sillytavern 初始化
- [x] 更新 `src/App.vue`：bridge import → env.ts
- [x] 创建 `src/env.ts` 替代 bridge 环境检测

### Phase 6 — DialoguePanel 改造
- [x] 替换 mock 回复为 useSillytavern.sendMessage()
- [x] 接入 isGenerating / streamText 状态
- [x] 保持现有 UI 结构不变

### Phase 7 — 验证与收尾
- [x] `npm run build` 构建成功
- [x] 独立模式 fallback 就绪（无 API key 时使用 mock）
- [ ] Git commit + push

---

## 关键决策记录

| 决策 | 内容 | 日期 |
|------|------|------|
| D1 | 删除 src/bridge/，全部走 sillytavern 核心层 | 2026-06-07 |
| D2 | 核心 .ts 文件从 React 模板复制（框架无关） | 2026-06-07 |
| D3 | conversationTree 保留，与 sillytavern ChatSession 并存 | 2026-06-07 |
| D4 | useSillytavern 协调两层数据（ST store + conversationTree） | 2026-06-07 |
| D5 | 先实现 v2 功能集，流式解析 / 多 API 作为后续增强 | 2026-06-07 |

---

## 风险与注意事项

- **Dexie**：ST database.ts 使用 Dexie，与现有 `src/services/db.ts`（原生 IndexedDB）使用不同的数据库名（`SillyTavernWebDB` vs `st-ui-conversations`），不冲突。
- **conversationTree 共存**：tree 管理树形对话图 + JSONL 导入导出；sillytavern ChatSession 管理平面消息列表 + 变量 + 预设。useSillytavern 需双向同步。
- **API Router**：Vue 版本暂不使用 api-router（single API mode only），但保留文件以备后用。
- **stream-parser**：可用于游戏模式 tag 解析，Vue 版默认不启用，后续增强。
