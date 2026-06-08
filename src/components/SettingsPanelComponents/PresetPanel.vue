<template>
  <div class="preset-panel">
    <!-- ==== List View ==== -->
    <div v-if="!editingId" class="list-view">
      <div class="list-header">
        <h4>预设管理</h4>
        <div class="header-actions">
          <button class="btn" @click="createNewPreset">＋ 新建预设</button>
          <label class="btn file-btn">
            📥 导入 JSON
            <input type="file" accept=".json" @change="handleImportFile" hidden />
          </label>
        </div>
      </div>

      <div v-if="store.presets.length === 0" class="empty-state">
        <p>暂无预设。点击"新建预设"或"导入 JSON"开始。</p>
      </div>
      <div v-if="importMsg" class="import-msg">{{ importMsg }}</div>

      <div v-for="p in store.presets" :key="p.id" class="preset-card"
        :class="{ active: p.id === store.activePresetId }">
        <div class="card-info">
          <div class="card-name">
            {{ p.name }}
            <span v-if="p.id === store.activePresetId" class="active-badge">已激活</span>
          </div>
          <div class="card-desc">{{ p.description || '无描述' }}</div>
          <div class="card-meta">
            <span>{{ p.settings?._structuredPreset?.promptBlocks?.length || 0 }} 个提示词块</span>
            <span>·</span>
            <span>{{ getTemplateLabel(p) }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button v-if="p.id !== store.activePresetId" class="btn-sm btn-activate" @click="store.setActive(p.id)">激活</button>
          <button class="btn-sm" @click="startEdit(p.id)">编辑</button>
          <button class="btn-sm" @click="exportPresetJson(p)">导出</button>
          <button class="btn-sm btn-danger" @click="store.remove(p.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- ==== Edit View ==== -->
    <div v-else class="edit-view">
      <div class="edit-header">
        <button class="btn-back" @click="editingId = null">← 返回列表</button>
        <h4>编辑预设：{{ editData.name }}</h4>
        <button class="btn btn-primary" @click="saveEdit">💾 保存</button>
      </div>

      <div class="edit-tabs">
        <button v-for="tab in editTabs" :key="tab.key" class="tab-btn"
          :class="{ active: editTab === tab.key }"
          @click="editTab = tab.key">{{ tab.label }}</button>
      </div>

      <!-- Tab: 基础信息 -->
      <div v-if="editTab === 'basic'" class="tab-content">
        <div class="field">
          <label>预设名称</label>
          <input v-model="editData.name" class="text-input" />
        </div>
        <div class="field">
          <label>描述</label>
          <textarea v-model="editData.description" class="text-input" rows="3" />
        </div>
        <div class="field">
          <label>上下文模板</label>
          <select v-model="editData.contextTemplate" class="text-input">
            <option v-for="t in contextTemplates" :key="t.name" :value="t.name">{{ t.label }}</option>
          </select>
        </div>
      </div>

      <!-- Tab: 采样参数 -->
      <div v-if="editTab === 'sampling'" class="tab-content">
        <div class="param-grid">
          <div v-for="param in samplingParamsList" :key="param.key" class="field param-field">
            <label :title="param.help">{{ param.label }}</label>
            <div class="param-input-row">
              <input type="number" v-model.number="(editData.sampling as any)[param.key]"
                :min="param.min" :max="param.max" :step="param.step" class="text-input param-num" />
              <span v-if="param.localOnly" class="badge-local">本地</span>
            </div>
          </div>
        </div>
        <div class="field">
          <label>停止符 (stop)</label>
          <div class="stop-editor">
            <div v-for="(s, i) in editData.sampling.stop" :key="i" class="stop-item">
              <input v-model="editData.sampling.stop[i]" class="text-input flex1" placeholder="如 \nUser:" />
              <button class="btn-sm btn-danger" @click="editData.sampling.stop.splice(i, 1)">✕</button>
            </div>
            <button class="btn-sm" @click="editData.sampling.stop.push('')">＋ 添加停止符</button>
          </div>
        </div>
      </div>

      <!-- Tab: 提示词块 -->
      <div v-if="editTab === 'blocks'" class="tab-content">
        <div v-if="editData.promptBlocks.length === 0" class="empty-state">
          <p>暂无提示词块。点击下方按钮添加。</p>
        </div>
        <div v-for="(block, i) in editData.promptBlocks" :key="block.identifier" class="block-card">
          <div class="block-header">
            <div class="block-summary">
              <label class="toggle-label">
                <input type="checkbox" v-model="block.enabled" />
                <span class="block-name">{{ block.name || '未命名块' }}</span>
              </label>
              <span class="block-role">{{ block.role }}</span>
            </div>
            <div class="block-actions">
              <button class="btn-sm" @click="toggleExpand(block as any)">{{ (block as any)._expanded ? '收起' : '展开' }}</button>
              <button class="btn-sm btn-danger" @click="editData.promptBlocks.splice(i, 1)">删除</button>
            </div>
          </div>
          <div v-if="(block as any)._expanded" class="block-detail">
            <div class="field"><label>名称</label><input v-model="block.name" class="text-input" /></div>
            <div class="field">
              <label>角色 (role)</label>
              <select v-model="block.role" class="text-input">
                <option value="system">system</option>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
              </select>
            </div>
            <div class="field">
              <label>注入位置</label>
              <select v-model.number="block.injection_position" class="text-input">
                <option :value="0">before_char</option>
                <option :value="1">after_char</option>
                <option :value="2">before_example</option>
                <option :value="3">after_example</option>
                <option :value="4">at_depth</option>
              </select>
            </div>
            <div v-if="block.injection_position === 4" class="field">
              <label>注入深度 (0-4)</label>
              <input v-model.number="block.injection_depth" type="number" min="0" max="4" class="text-input" />
            </div>
            <div class="field">
              <label>内容（支持 &#123;&#123;user&#125;&#125;, &#123;&#123;char&#125;&#125; 等宏）</label>
              <textarea v-model="block.content" class="text-input mono" rows="6" />
            </div>
          </div>
        </div>
        <button class="btn" @click="addBlock">＋ 新增提示词块</button>
      </div>

      <!-- Tab: 消息收发 -->
      <div v-if="editTab === 'messaging'" class="tab-content">
        <div class="param-grid">
          <div v-for="param in messagingParamsList" :key="param.key" class="field param-field">
            <label :title="param.help">{{ param.label }}</label>
            <input v-if="param.type === 'checkbox'" type="checkbox"
              :checked="!!(editData.messaging as any)[param.key]"
              @change="(e: any) => (editData.messaging as any)[param.key] = e.target.checked" />
            <input v-else :type="param.type || 'number'"
              :value="(editData.messaging as any)[param.key]"
              @input="(e: any) => { const v = param.type === 'text' ? e.target.value : Number(e.target.value); (editData.messaging as any)[param.key] = v; }"
              :min="param.min" :max="param.max" :step="param.step" class="text-input param-num" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { usePresetStore } from '../../stores/presetStore';
import { exportPreset, createEmptyPreset } from '../../sillytavern/preset-importer';
import { listBuiltinTemplates } from '../../sillytavern/context-template';
import type { ChatPreset, StructuredPreset, PromptBlock } from '../../sillytavern/types';

const store = usePresetStore();

const editingId = ref<string | null>(null);
const editTab = ref('basic');
const importMsg = ref('');
const contextTemplates = listBuiltinTemplates();

const editTabs = [
  { key: 'basic', label: '基础信息' },
  { key: 'sampling', label: '采样参数' },
  { key: 'messaging', label: '消息收发' },
  { key: 'blocks', label: '提示词块' },
];

const samplingParamsList = [
  { key: 'temperature', label: 'Temperature 温度', min: 0, max: 2, step: 0.05, help: '控制随机性，越高越随机' },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05 },
  { key: 'top_k', label: 'Top K', min: 0, max: 200, step: 1, localOnly: true },
  { key: 'min_p', label: 'Min P', min: 0, max: 1, step: 0.05, localOnly: true },
  { key: 'top_a', label: 'Top A', min: 0, max: 1, step: 0.05, localOnly: true },
  { key: 'frequency_penalty', label: '频率惩罚', min: -2, max: 2, step: 0.1 },
  { key: 'presence_penalty', label: '存在惩罚', min: -2, max: 2, step: 0.1 },
  { key: 'repetition_penalty', label: '重复惩罚', min: 1, max: 2, step: 0.05, localOnly: true },
];

const messagingParamsList = [
  { key: 'max_context', label: '上下文长度 (max_context)', type: 'number', min: 1024, max: 2097152, step: 1024, help: '默认 128000' },
  { key: 'max_tokens', label: '最大回复长度 (max_tokens)', type: 'number', min: 1, max: 131072, step: 1, help: '默认 10000' },
  { key: 'num_generations', label: '备选回复数', type: 'number', min: 1, max: 8, step: 1 },
  { key: 'stream', label: '流式传输 (stream)', type: 'checkbox' },
  { key: 'continue_prefill', label: '续写预填充', type: 'checkbox' },
  { key: 'truncate_on_overflow', label: '超出上下文截断', type: 'checkbox' },
  { key: 'request_thinking', label: '请求思维链', type: 'checkbox' },
  { key: 'reasoning_effort', label: '推理强度', type: 'text', help: 'low/medium/high，留空表示默认' },
];

interface EditableData extends StructuredPreset {
  promptBlocks: (PromptBlock & { _expanded?: boolean })[];
}

const editData = reactive<EditableData>({
  ...createEmptyPreset(),
  promptBlocks: [],
});

function getTemplateLabel(p: ChatPreset): string {
  const tpl = p.settings?._structuredPreset?.contextTemplate || 'openai';
  return contextTemplates.find(t => t.name === tpl)?.label || tpl;
}

function createNewPreset() {
  editingId.value = '__new__';
  const sp = createEmptyPreset();
  Object.assign(editData, { ...sp, promptBlocks: [] });
  editTab.value = 'basic';
}

function startEdit(presetId: string) {
  editingId.value = presetId;
  const cp = store.presets.find(p => p.id === presetId);
  const sp: StructuredPreset = cp?.settings?._structuredPreset || createEmptyPreset();
  Object.assign(editData, {
    name: sp.name,
    description: sp.description,
    sampling: { ...sp.sampling },
    messaging: { ...sp.messaging },
    promptBlocks: (sp.promptBlocks || []).map(b => ({ ...b, _expanded: false })),
    contextTemplate: sp.contextTemplate || 'openai',
  });
  editTab.value = 'basic';
}

function toggleExpand(b: any) { b._expanded = !b._expanded; }

function addBlock() {
  editData.promptBlocks.push({
    name: '新提示词块',
    identifier: `block_${Date.now()}`,
    content: '',
    enabled: true,
    role: 'system',
    injection_position: 1,
    injection_depth: 0,
    order: editData.promptBlocks.length,
    _expanded: true,
  });
}

async function saveEdit() {
  const sp: StructuredPreset = {
    name: editData.name,
    description: editData.description,
    sampling: { ...editData.sampling },
    messaging: { ...editData.messaging },
    promptBlocks: editData.promptBlocks.map(({ _expanded, ...b }: any) => ({ ...b })),
    contextTemplate: editData.contextTemplate,
  };
  await store.save(sp, editingId.value === '__new__' ? undefined : editingId.value!);
  editingId.value = null;
}

function deleteThisPreset(id: string) { store.remove(id); }

async function exportPresetJson(p: ChatPreset) {
  const sp = p.settings?._structuredPreset || createEmptyPreset();
  const json = exportPreset(sp);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sp.name.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await store.importFromJson(await file.text(), file.name);
    importMsg.value = '✓ 导入成功';
    setTimeout(() => { importMsg.value = ''; }, 3000);
  } catch (err: any) {
    importMsg.value = '导入失败: ' + (err.message || String(err));
  }
}
</script>

<style scoped>
.preset-panel { display: flex; flex-direction: column; gap: 12px; color: #ccc; max-height: 100%; overflow-y: auto; }
h4 { margin: 0; font-size: 14px; color: #aac; }
.list-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 8px; }
.btn { padding: 6px 14px; background: #1a2535; border: 1px solid #3a5a8a; border-radius: 4px; color: #7ab; cursor: pointer; font-size: 12px; white-space: nowrap; }
.btn:hover { background: #253545; color: #fff; }
.btn-primary { background: #2a4a3a; border-color: #4a8a6a; }
.btn-primary:hover { background: #3a5a4a; }
.file-btn { cursor: pointer; display: inline-flex; align-items: center; }
.import-msg { font-size: 12px; color: #8a8; padding: 4px 0; }
.preset-card { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(18,18,31,0.5); border: 1px solid #2a2a3e; border-radius: 6px; }
.preset-card.active { border-color: #4a8; }
.card-info { flex: 1; min-width: 0; }
.card-name { font-size: 13px; color: #ddd; display: flex; align-items: center; gap: 8px; }
.active-badge { font-size: 10px; padding: 1px 6px; background: #2a4a3a; color: #4a8; border-radius: 3px; }
.card-desc { font-size: 11px; color: #667; margin-top: 2px; }
.card-meta { font-size: 10px; color: #556; margin-top: 4px; }
.card-actions { display: flex; gap: 4px; flex-shrink: 0; }
.btn-sm { padding: 3px 8px; font-size: 11px; background: #1a2535; border: 1px solid #3a5a8a; border-radius: 3px; color: #7ab; cursor: pointer; }
.btn-sm:hover { background: #253545; color: #fff; }
.btn-activate { border-color: #4a8; color: #4a8; }
.btn-danger { border-color: #a44; color: #a44; }
.btn-danger:hover { background: #3a1a1a; }
.empty-state { text-align: center; padding: 24px; color: #556; }
.edit-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.btn-back { background: none; border: none; color: #7ab; cursor: pointer; font-size: 12px; }
.edit-tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.tab-btn { padding: 4px 12px; background: #16213e; border: 1px solid #556; border-radius: 4px; color: #ccc; cursor: pointer; font-size: 12px; }
.tab-btn.active { background: #2a2a3a; color: #fff; border-color: #889; }
.tab-content { display: flex; flex-direction: column; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; color: #889; }
.text-input { padding: 6px 8px; background: #12121f; border: 1px solid #334; border-radius: 4px; color: #ddd; font-size: 12px; }
.text-input:focus { outline: none; border-color: #558; }
.mono { font-family: monospace; }
.flex1 { flex: 1; }
.param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.param-field { display: flex; flex-direction: column; gap: 4px; }
.param-input-row { display: flex; align-items: center; gap: 6px; }
.param-num { width: 100%; }
.badge-local { font-size: 9px; padding: 0 4px; background: #332; color: #a83; border-radius: 2px; }
.stop-editor { display: flex; flex-direction: column; gap: 4px; }
.stop-item { display: flex; gap: 4px; align-items: center; }
.block-card { background: rgba(18,18,31,0.5); border: 1px solid #2a2a3e; border-radius: 6px; padding: 8px 10px; }
.block-header { display: flex; justify-content: space-between; align-items: center; }
.block-summary { display: flex; align-items: center; gap: 10px; }
.block-name { font-size: 12px; color: #ccc; }
.block-role { font-size: 10px; color: #667; padding: 1px 6px; background: #1a1a2e; border-radius: 3px; }
.block-actions { display: flex; gap: 4px; }
.block-detail { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.toggle-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; }
.toggle-label input { accent-color: #4a8; }
</style>
