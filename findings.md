# findings.md — 关键发现

## 当前版本状态 (safe-v1 / 4c6cc44)

- ST 集成正常（iframe 加载，CSS 无污染）
- st-builtin 检测存在但不可用（ST 不暴露真实 API key）
- DataCloneError 待修复
- 通信逻辑框架已有但 st-builtin 分支会拿到空 key

## DataCloneError 根因分析

### 触发链路
1. `ApiPanel.saveConfig()` → `st.updateSettings({ apiSource, api })` → `saveSettings(newSettings)`
2. `syncFromSt()` → `context.savePreset(preset)` → `db.presets.put(preset)`
3. 对象来自 ST 环境（可能含循环引用、不可克隆对象）→ IndexedDB `put()` 失败

### 为什么之前不报这个错
- `updateSettings` 合并 `{ ...settings.value, ...updates }` 时 `settings.value` 可能已从 DB 读取（纯数据），但如果 `settings.value` 是从 `syncFromSt` 写入的未消毒数据，则合并结果仍不可克隆
- 最关键的是 `syncFromSt` 中直接 `{ ...stPreset.preset }` — stPreset 来自 `window.SillyTavern`，可能含 live objects

### 修复原则
**所有写 IndexedDB 的入口**必须经过 `JSON.parse(JSON.stringify())` 消毒：
1. `syncFromSt()` — 写 preset / lorebook / settings 前
2. `updateSettings()` — 合并后写前
3. `saveChat()` — sendMessage 中构建 updatedChat 后（虽然通常来自我们自己的数据，但在 ST 环境中可能有变量引用问题）

## ST API Key 不可用的原因

SillyTavern 的 API key 存储在：
- ST 服务端 settings 文件（不暴露给前端）
- ST 加密存储（secrets.js）
- localStorage 中可能只存 baseUrl 和 model 名称，key 被隐藏

`window.SillyTavern.getContext()` 返回的对象中：
- `characters` ✅ 可读
- `chat` ✅ 可读
- `worldInfo` ✅ 可能可读
- API credentials ❌ 从不暴露
