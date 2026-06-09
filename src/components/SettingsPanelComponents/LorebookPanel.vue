<template>
  <div class="lorebook-panel">
    <!-- ==== List View ==== -->
    <div v-if="!editingId" class="list-view">
      <div class="list-header">
        <h4>世界书</h4>
        <div class="header-actions">
          <button class="btn" @click="createNew">＋ 新建</button>
          <label class="btn file-btn">
            📥 导入 JSON
            <input type="file" accept=".json" @change="handleImport" hidden />
          </label>
        </div>
      </div>
      <div v-if="msg" class="msg">{{ msg }}</div>

      <div v-if="store.books.length === 0" class="empty-state">
        <p>暂无世界书。点击新建或导入 JSON 开始。</p>
      </div>

      <div v-for="b in store.books" :key="b.id" class="book-card"
        :class="{ 'st-global': b.id === store.globalId, 'st-active': store.isActive(b.id) }">
        <div class="card-info">
          <div class="card-name">
            {{ b.name }}
            <span v-if="b.id === store.globalId" class="badge-global">全局</span>
            <span v-if="store.isActive(b.id) && b.id !== store.globalId" class="badge-active">已激活</span>
          </div>
          <div class="card-meta">
            {{ b.entries?.length || 0 }} 个条目
            <span v-if="store.globalBook && b.id === store.globalBook.id">· 应用于全部角色</span>
          </div>
        </div>
        <div class="card-actions">
          <button v-if="b.id !== store.globalId" class="btn-sm btn-global" @click="store.setGlobal(b.id)">设为全局</button>
          <button v-else class="btn-sm btn-unglobal" @click="store.setGlobal(null)">取消全局</button>
          <button class="btn-sm" @click="store.toggleActive(b.id)">{{ store.isActive(b.id) ? '取消激活' : '激活' }}</button>
          <button class="btn-sm" @click="startEdit(b.id)">编辑</button>
          <button class="btn-sm" @click="exportOne(b)">导出</button>
          <button class="btn-sm btn-danger" @click="store.remove(b.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- ==== Edit View ==== -->
    <div v-else class="edit-view">
      <div class="edit-header">
        <button class="btn-back" @click="closeEdit">← 返回</button>
        <h4>{{ editTab === 'settings' ? '世界书设置' : '编辑条目' }}：{{ editingBook?.name || '' }}</h4>
        <button class="btn btn-primary" @click="saveBook">💾 保存</button>
      </div>

      <div class="edit-tabs">
        <button class="tab-btn" :class="{ active: editTab === 'settings' }" @click="editTab = 'settings'">基础设置</button>
        <button class="tab-btn" :class="{ active: editTab === 'entries' }" @click="editTab = 'entries'">条目列表</button>
      </div>

      <!-- Tab: Settings -->
      <div v-if="editTab === 'settings'" class="tab-content">
        <div class="field">
          <label>名称</label>
          <input v-model="editBook.name" class="text-input" />
        </div>
        <div class="field">
          <label>描述</label>
          <textarea v-model="editBook.description" class="text-input" rows="2" />
        </div>
        <div class="field">
          <label>扫描深度 (scanDepth) — 扫描最近N条消息</label>
          <input v-model.number="editBook.scanDepth" type="number" min="1" max="10" class="text-input" style="width:80px" />
          <small class="help">默认 2。1=仅扫描用户输入+上一条AI回复。</small>
        </div>
        <div class="field">
          <label class="toggle-label">
            <input type="checkbox" v-model="editBook.recursiveScanning" />
            <span>允许递归扫描</span>
          </label>
          <small class="help">条目可在自己的 content 中包含其他条目的关键词，触发链条激活。注意token消耗。</small>
        </div>
      </div>

      <!-- Tab: Entries -->
      <div v-if="editTab === 'entries'" class="tab-content">
        <button class="btn" @click="addEntry" style="margin-bottom:8px">＋ 新增条目</button>
        <div v-if="editBook.entries.length === 0" class="empty-state"><p>暂无条目。</p></div>

        <div v-for="(entry, i) in editBook.entries" :key="entry.id" class="entry-card">
          <div class="entry-header">
            <div class="entry-summary">
              <label class="toggle-label">
                <input type="checkbox" :checked="!(entry as any)._disabled" @change="(e: any) => (entry as any)._disabled = !e.target.checked" />
              </label>
              <span class="entry-name">{{ (entry as any).name || (entry as any)._name || '条目 ' + (i+1) }}</span>
              <span class="entry-type-tag" :class="{ constant: entry.constant }">
                {{ entry.constant ? '恒定' : '触发' }}
              </span>
              <span class="entry-pos">{{ positionLabel(entry.position) }}{{ entry.position === 'at_depth' ? ' #'+entry.depth : '' }}</span>
            </div>
            <div class="entry-actions">
              <button class="btn-sm" @click="moveEntry(i, 'up')" :disabled="i === 0">↑</button>
              <button class="btn-sm" @click="moveEntry(i, 'down')" :disabled="i === editBook.entries.length - 1">↓</button>
              <button class="btn-sm" @click="(entry as any)._open = !(entry as any)._open">{{ (entry as any)._open ? '收起' : '展开' }}</button>
              <button class="btn-sm btn-danger" @click="removeEntry(entry.id)">删除</button>
            </div>
          </div>
          <div v-if="(entry as any)._open" class="entry-detail">
            <div class="field">
              <label>条目名称</label>
              <input :value="(entry as any).name || (entry as any)._name || ''" @input="(e: any) => (entry as any)._name = e.target.value" class="text-input" />
            </div>
            <div class="field">
              <label>关键词（逗号分隔）</label>
              <input :value="(entry.keys || []).join(', ')" @input="(e: any) => entry.keys = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)" class="text-input" placeholder="如: 背景故事, 角色经历" />
            </div>
            <div class="field">
              <label>内容（支持 {{user}}, {{char}} 等宏）</label>
              <textarea v-model="entry.content" class="text-input mono" rows="5" />
            </div>
            <div class="param-row">
              <div class="field" style="flex:1">
                <label>位置</label>
                <select v-model="entry.position" class="text-input">
                  <option value="before_char">before_char</option>
                  <option value="after_char">after_char</option>
                  <option value="before_example">before_example</option>
                  <option value="after_example">after_example</option>
                  <option value="at_depth">at_depth</option>
                </select>
              </div>
              <div class="field" style="flex:1" v-if="entry.position === 'at_depth'">
                <label>深度 (0-4)</label>
                <input v-model.number="entry.depth" type="number" min="0" max="4" class="text-input" />
              </div>
              <div class="field" style="flex:1">
                <label>权重</label>
                <input v-model.number="entry.weight" type="number" min="0" max="9999" class="text-input" />
              </div>
            </div>
            <div class="inline-checks">
              <label class="toggle-label">
                <input type="checkbox" v-model="entry.constant" />
                <span>恒定条目（始终注入）</span>
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="entry.recursive" />
                <span>递归扫描</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useLorebookStore, createEmptyEntry } from '../../stores/lorebookStore';
import type { Lorebook } from '../../sillytavern/types';

const store = useLorebookStore();
const editingId = ref<string | null>(null);
const editTab = ref('entries');
const msg = ref('');

const STORED_KEYS = ['id', 'name', 'description', 'entries', 'recursiveScanning', 'caseSensitive', 'matchWholeWords', 'createdAt', 'updatedAt', 'scanDepth'];

const editBook = reactive<Lorebook & { scanDepth?: number }>({
  id: '', name: '', entries: [], recursiveScanning: false, caseSensitive: false, matchWholeWords: false,
  createdAt: Date.now(), updatedAt: Date.now(), scanDepth: 2,
});

const editingBook = computed(() => store.books.find(b => b.id === editingId.value) || null);

function createNew() {
  const book = store.create();
  editingId.value = book.id;
  openBookForEdit(book);
}

function startEdit(id: string) {
  editingId.value = id;
  const b = store.books.find(x => x.id === id);
  if (b) openBookForEdit(b);
}

function openBookForEdit(b: Lorebook) {
  const plain = JSON.parse(JSON.stringify(b));
  plain.scanDepth = (plain as any).scanDepth ?? 2;
  for (const e of (plain.entries || [])) {
    (e as any)._open = false;
    (e as any)._name = e.comment || '';
    (e as any)._disabled = !e.enabled && e.enabled !== undefined ? true : false;
  }
  Object.assign(editBook, plain);
  editTab.value = 'entries';
}

function closeEdit() {
  editingId.value = null;
  editBook.entries = [];
}

async function saveBook() {
  // Deep-clone to strip Vue reactive proxies before IndexedDB write
  const saved = JSON.parse(JSON.stringify({
    id: editBook.id,
    name: editBook.name,
    description: editBook.description,
    entries: editBook.entries.map((e: any) => ({
      id: e.id,
      keys: e.keys || [],
      secondaryKeys: e.secondaryKeys || [],
      content: e.content || '',
      comment: e._name || e.comment || '',
      enabled: e._disabled ? false : (e.enabled ?? true),
      order: e.order ?? 0,
      position: e.position || 'after_char',
      depth: e.depth ?? 0,
      constant: e.constant ?? false,
      selective: e.selective ?? false,
      selectiveLogic: e.selectiveLogic || 'and_any',
      probability: e.probability ?? 100,
      useProbability: e.useProbability ?? false,
      addMemo: e.addMemo ?? false,
      recursive: e.recursive ?? false,
      weight: e.weight ?? 100,
    })),
    recursiveScanning: editBook.recursiveScanning,
    caseSensitive: editBook.caseSensitive,
    matchWholeWords: editBook.matchWholeWords,
    createdAt: editBook.createdAt,
    updatedAt: Date.now(),
    scanDepth: (editBook as any).scanDepth || 2,
  })) as Lorebook;

  await store.save(saved);
  editingId.value = null;
}

function addEntry() {
  const entry: any = { ...createEmptyEntry(), id: crypto.randomUUID(), _open: true };
  editBook.entries.push(entry);
}

function removeEntry(entryId: string) {
  editBook.entries = editBook.entries.filter(e => e.id !== entryId);
}

function moveEntry(idx: number, dir: 'up' | 'down') {
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= editBook.entries.length) return;
  const arr = editBook.entries.slice();
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  editBook.entries = arr;
}

function positionLabel(pos: string): string {
  const map: Record<string, string> = { before_char: 'before_char', after_char: 'after_char', before_example: 'before_example', after_example: 'after_example', at_depth: 'at_depth' };
  return map[pos] || pos;
}

async function handleImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await store.importFromJson(await file.text(), file.name);
    msg.value = '✓ 导入成功'; setTimeout(() => msg.value = '', 3000);
  } catch (err: any) {
    msg.value = '导入失败: ' + err.message;
  }
}

function exportOne(b: Lorebook) {
  const str = store.exportToJson(b);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${b.name}.json`; a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.lorebook-panel { display: flex; flex-direction: column; gap: 12px; color: #ccc; max-height: 100%; overflow-y: auto; }
h4 { margin: 0; font-size: 14px; color: #aac; }
.list-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 8px; }
.msg { font-size: 12px; color: #8a8; }
.btn { padding: 6px 14px; background: #1a2535; border: 1px solid #3a5a8a; border-radius: 4px; color: #7ab; cursor: pointer; font-size: 12px; white-space: nowrap; }
.btn:hover { background: #253545; color: #fff; }
.btn-primary { background: #2a4a3a; border-color: #4a8a6a; }
.file-btn { cursor: pointer; display: inline-flex; align-items: center; }

.book-card { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(18,18,31,0.5); border: 1px solid #2a2a3e; border-radius: 6px; }
.book-card.st-global { border-color: #a8a; }
.book-card.st-active { border-color: #4a8; }
.card-info { flex: 1; min-width: 0; }
.card-name { font-size: 13px; color: #ddd; display: flex; align-items: center; gap: 8px; }
.badge-global { font-size: 9px; padding: 1px 6px; background: #3a2a3a; color: #a8a; border-radius: 3px; }
.badge-active { font-size: 9px; padding: 1px 6px; background: #2a4a3a; color: #4a8; border-radius: 3px; }
.card-meta { font-size: 10px; color: #556; margin-top: 4px; }
.card-actions { display: flex; gap: 4px; flex-shrink: 0; }

.btn-sm { padding: 3px 8px; font-size: 11px; background: #1a2535; border: 1px solid #3a5a8a; border-radius: 3px; color: #7ab; cursor: pointer; white-space: nowrap; }
.btn-sm:hover { background: #253545; color: #fff; }
.btn-sm:disabled { opacity: 0.3; cursor: default; }
.btn-global { border-color: #a8a; color: #a8a; }
.btn-unglobal { border-color: #88a; color: #88a; }
.btn-danger { border-color: #a44; color: #a44; }
.btn-danger:hover { background: #3a1a1a; }

.empty-state { text-align: center; padding: 24px; color: #556; }
.help { font-size: 10px; color: #556; margin-top: 2px; }

.edit-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.btn-back { background: none; border: none; color: #7ab; cursor: pointer; font-size: 12px; }
.edit-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.tab-btn { padding: 4px 12px; background: #16213e; border: 1px solid #556; border-radius: 4px; color: #ccc; cursor: pointer; font-size: 12px; }
.tab-btn.active { background: #2a2a3a; color: #fff; border-color: #889; }
.tab-content { display: flex; flex-direction: column; gap: 10px; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; color: #889; }
.text-input { padding: 6px 8px; background: #12121f; border: 1px solid #334; border-radius: 4px; color: #ddd; font-size: 12px; }
.text-input:focus { outline: none; border-color: #558; }
.mono { font-family: monospace; }
.toggle-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; }
.toggle-label input { accent-color: #4a8; }

.entry-card { background: rgba(18,18,31,0.5); border: 1px solid #2a2a3e; border-radius: 6px; padding: 8px 10px; }
.entry-header { display: flex; justify-content: space-between; align-items: center; }
.entry-summary { display: flex; align-items: center; gap: 10px; flex:1; min-width:0; }
.entry-name { font-size: 12px; color: #ccc; white-space: nowrap; }
.entry-type-tag { font-size: 9px; padding: 1px 6px; border-radius: 3px; white-space: nowrap; background: #2a3a2a; color: #8a8; }
.entry-type-tag.constant { background: #3a2a3a; color: #a8a; }
.entry-pos { font-size: 10px; color: #556; white-space: nowrap; }
.entry-actions { display: flex; gap: 4px; flex-shrink: 0; }
.entry-detail { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }

.param-row { display: flex; gap: 8px; }
.inline-checks { display: flex; gap: 16px; flex-wrap: wrap; }
</style>
