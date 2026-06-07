# task_plan.md — safe-v1 → 通信修复 + API 安全

> **Base**: `safe-v1` tag (commit `4c6cc44`), all features intact
> **Rule**: 绝对不修改任何 CSS 样式

## 修改清单（4个任务，7个文件微调）

### Task 1: 移除 st-builtin，只允许自定义 API key

| 文件 | 操作 | 行号范围 |
|------|------|----------|
| `types.ts` | 删除 `ApiSource`、`StConnectionProfile` 类型 | L312-L325 |
| `types.ts` | 从 `AppSettings` 删除 `apiSource` 字段 | ~L156 |
| `types.ts` | 从 `DEFAULT_SETTINGS` 删除 `apiSource` | ~L190 |
| `st-integration.ts` | 删除 `detectStConnection()` 函数（~60行） | 保留注释说明 ST 不暴露 key |
| `ApiPanel.vue` | 删除 st-builtin 切换 UI；只留自定义配置表单 | 全部 script + template |
| `useSillytavern.ts` | 删除 `detectStConnection` import | L11 |
| `useSillytavern.ts` | `sendMessage()` 中 `apiSource` 分支 → 直接 `s.api.baseUrl` / `s.api.apiKey` | L189-L206 |

### Task 2: 修复通信逻辑

| 文件 | 操作 |
|------|------|
| `useSillytavern.ts` | `sendMessage()` 已有正确的 fetch + prompt assembly 逻辑，只需确保无 apiSource 分支后路径正确 |

### Task 3: 不修改 CSS

| 文件 | 操作 |
|------|------|
| 所有 .vue 文件 | **不修改** `<style>` / `<style scoped>` 任何内容 |
| `App.vue` | **不修改**（保持原始全局重置） |

### Task 4: 修复 DataCloneError

| 文件 | 操作 |
|------|------|
| `st-integration.ts` | `syncFromSt()` 写 IndexedDB 前 `JSON.parse(JSON.stringify(data))` 消毒 |
| `useSillytavern.ts` | `updateSettings()` 写 IndexedDB 前 `JSON.parse(JSON.stringify(newSettings))` 消毒 |
| `useSillytavern.ts` | `sendMessage()` 中 `saveChat(updatedChat)` 前消毒 ChatSession |
| `ApiPanel.vue` | `saveConfig()` 中 `localApi` 已经是纯数据，无需额外处理 |

### 验证

- [ ] `npm run build` 无 TypeScript 错误
- [ ] `npm run dev` 独立模式正常（布局不坏）
- [ ] 在设置 → API 只能看到自定义配置表单
- [ ] 配置 API key 后发送消息不报 DataCloneError
- [ ] 发送消息能成功调用 API
- [ ] Git commit + push + Vercel deploy

---

## 之前失败原因回顾

| 问题 | 根因 | 本次如何避免 |
|------|------|-------------|
| 黑屏 | CSS 选择器 `body:has(#app)` 失效 + `pointer-events:none` 删除 | **不修改 App.vue CSS** |
| 布局错位 | `html,body` 重置被移除 | **不修改 App.vue CSS** |
| DataCloneError | ST preset 含不可克隆对象直接写入 IndexedDB | 所有写 DB 操作前 JSON saniti ze |
