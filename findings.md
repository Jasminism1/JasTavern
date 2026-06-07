# findings.md — 研究发现与关键信息

## 项目环境

- **框架**：Vue 3.4 + Vite 5 + TypeScript 5.3 + Pinia 2.1
- **构建模式**：IIFE 库 (`st-custom-ui.js`)，注入 SillyTavern 页面
- **包管理器**：npm
- **IndexedDB 现状**：`src/services/db.ts` 使用原生 IndexedDB（DB 名 `st-ui-conversations`），管理 conversation tree 节点
- **无** ESLint/Prettier 配置

## 现有架构

### Stores (Pinia)
| Store | 文件 | 职责 |
|-------|------|------|
| `useAppStore` | `src/stores/app.ts` | UI 控制、模态窗口、角色状态、生成状态 |
| `useConversationTreeStore` | `src/stores/conversationTree.ts` | 树形对话 + IndexedDB + JSONL + 上下文构建 |
| `useBackgroundStore` | `src/stores/background.ts` | 背景管理 |
| `useSettingsStore` | `src/stores/settings.ts` | 设置管理 |

### Components
- **TopBar** — 顶部导航栏
- **PortraitLayer** — 立绘/Live2D 层
- **DialoguePanel** — 对话 + 输入（mock 回复，需改造）
- **StatusPanel** — 角色状态面板
- **MapPanel** — 地图面板
- **EventLogPanel** — 事件日志面板
- **CharDetailPanel** — 角色详情面板
- **OthersPanel** — 其他功能面板
- **SettingsPanel** + 子组件 — 设置面板

### Bridge 层（将被删除）
| 文件 | 状态 |
|------|------|
| `index.ts` | `sendMessageToST()` 标记 TODO，未完成 |
| `eventBus.ts` | 简单 EventBus 类，仅被 bridge 使用 |
| `types.ts` | ST 环境类型声明 |
| `env.d.ts` | Window 全局类型扩展 |
| `loader.js` | JS-Slash-Runner 加载脚本 |
| `slash_runner_script.js` | Slash Runner 脚本 |

## SillyTavern Web Skill 模板分析

### 可复制的框架无关文件（React templates → Vue 直接可用）
全部位于 `templates/react/sillytavern/`：

| 模板文件 | 大小 | 依赖 | 说明 |
|----------|------|------|------|
| `types.ts` | 9.3KB | 无 | 全部类型定义 + 默认预设 + 默认设置 |
| `database.ts` | 4.3KB | Dexie | IndexedDB 层（DB 名 `SillyTavernWebDB` v3） |
| `lorebook-engine.ts` | 4.9KB | types.ts | 关键词匹配引擎 + 递归扫描 |
| `prompt-assembler.ts` | 6.2KB | types.ts, lorebook-engine, variables | Prompt 组装 + macro 替换 |
| `importer.ts` | 7.6KB | types.ts | ST JSON 导入/导出 |
| `variables.ts` | 3.2KB | types.ts, stream-parser, vars-merger | 变量提取/合并/branch/truncate |
| `stream-parser.ts` | 5.3KB | 无 | XML 流式标签解析器 |
| `vars-merger.ts` | 1.1KB | types.ts | JSON 深合并 |
| `api-router.ts` | 2.1KB | types.ts | 主/次 API 路由 |
| `editor-utils.ts` | 2.4KB | types.ts | 纯函数编辑器工具 |
| `index.ts` | 0.3KB | 所有子模块 | 统一导出 |

### Vue Composable（skill 内联代码）
Skill 提供了完整的 `useSillytavern.ts` Vue composable 代码（约 180 行），需直接写入 `src/composables/`。

### 关键差异：Vue v2 vs React v3
Skill 标记 Vue 为 v2，缺少：
- Game 模式 (GameView, MainTextPane, OptionList, ThinkingFold)
- Stream parsing 集成
- 多 API routing
这些作为后续增强。

## 数据库命名空间

| 数据库 | 使用方 | 存储内容 |
|--------|--------|----------|
| `SillyTavernWebDB` (v3) | sillytavern/database.ts (Dexie) | lorebooks, presets, settings, chats |
| `st-ui-conversations` (v1) | services/db.ts (原生 IDB) | tree-nodes (TreeNode) |

两者不冲突，但需注意 useSillytavern 需同时操作两个数据库。

## 待解决问题

1. **conversationTree 与 ChatSession 同步**：tree 的对话节点如何映射到 ChatSession.messages？
   - 方案：useSillytavern.sendMessage() 同时写入 tree（via onNewMessage）和 ChatSession（via saveChat）
2. **Root node 初始化**：conversationTree.ensureRoot() 需要早于任何对话操作
3. **sendMessage 的 userInput 参数**：DialoguePanel 目前用 sendMessage → onNewMessage，需改为 sendMessage → useSillytavern.sendMessage
