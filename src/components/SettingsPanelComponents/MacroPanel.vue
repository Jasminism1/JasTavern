<template>
  <div class="macro-panel">
    <div class="macro-header">
      <h4>宏系统（Macro）</h4>
      <div class="global-toggle">
        <label class="toggle-label">
          <input type="checkbox" :checked="registryEnabled" @change="toggleRegistry" />
          <span>全局启用宏替换</span>
        </label>
      </div>
      <p class="macro-hint">宏可以在预设、世界书条目和用户输入中使用。格式：<code>{<!-- -->{宏名}}</code></p>
    </div>

    <div class="macro-quick-actions">
      <button class="action-btn-sm" @click="enableAll">启用全部</button>
      <button class="action-btn-sm" @click="disableAll">禁用全部</button>
    </div>

    <!-- Group by category -->
    <div v-for="group in groupedMacros" :key="group.category" class="macro-group">
      <h5 class="category-title">{{ categoryLabels[group.category] || group.category }}</h5>
      <div v-for="macro in group.macros" :key="macro.name" class="macro-item">
        <div class="macro-info">
          <code class="macro-name"><!--{{ macro.name }}--></code>
          <span class="macro-desc">{{ macro.description }}</span>
        </div>
        <div class="macro-preview">
          <span class="preview-val">{{ resolvePreview(macro) }}</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" :checked="macro.enabled" @change="toggleMacro(macro.name)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { macroRegistry } from '../../composables/useSillytavern';
import type { MacroCategory } from '../../sillytavern/macros';

const categoryLabels: Record<MacroCategory, string> = {
  character: '角色信息',
  context: '对话上下文',
  system: '系统信息',
  custom: '自定义宏',
};

const categoryOrder: MacroCategory[] = ['character', 'context', 'system', 'custom'];

const registryEnabled = ref(macroRegistry.enabled);

const groupedMacros = computed(() => {
  const map = new Map<MacroCategory, any[]>();
  for (const m of macroRegistry.list()) {
    if (!map.has(m.category)) map.set(m.category, []);
    map.get(m.category)!.push({
      name: m.name,
      description: m.description,
      enabled: m.enabled,
      category: m.category,
    });
  }
  return categoryOrder
    .filter(cat => map.has(cat))
    .map(cat => ({
      category: cat,
      macros: map.get(cat)!,
    }));
});

function resolvePreview(macro: { name: string }): string {
  try {
    const val = macroRegistry.resolve(macro.name, {
      userName: '用户',
      characterName: '角色',
      userInput: '',
      variables: {},
    });
    if (val === `{{${macro.name}}}`) {
      const m = macroRegistry.get(macro.name);
      return m?.enabled ? '（无数据）' : '（已禁用）';
    }
    return val.length > 40 ? val.slice(0, 40) + '…' : val;
  } catch {
    return '—';
  }
}

function toggleRegistry() {
  const next = !macroRegistry.enabled;
  macroRegistry.setEnabled(next);
  registryEnabled.value = next;
}

function toggleMacro(name: string) {
  macroRegistry.toggle(name);
  // Trigger reactivity by toggling the registryEnabled ref
  registryEnabled.value = macroRegistry.enabled;
}

function enableAll() {
  macroRegistry.enableAll();
  registryEnabled.value = macroRegistry.enabled;
}

function disableAll() {
  macroRegistry.disableAll();
  registryEnabled.value = macroRegistry.enabled;
}
</script>

<style scoped>
.macro-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #ccc;
}

.macro-header h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: #aac;
}

.macro-hint {
  font-size: 11px;
  color: #668;
  margin: 4px 0 0 0;
}

.macro-hint code {
  background: #1a1a2e;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.global-toggle {
  margin: 8px 0;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #aac;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  accent-color: #4a8;
}

.macro-quick-actions {
  display: flex;
  gap: 8px;
}

.action-btn-sm {
  padding: 4px 10px;
  font-size: 11px;
  background: #1a2535;
  border: 1px solid #3a5a8a;
  border-radius: 3px;
  color: #7ab;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn-sm:hover {
  background: #253545;
  color: #fff;
}

.macro-group {
  background: rgba(18, 18, 31, 0.5);
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  padding: 10px 12px;
}

.category-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #78aaff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.macro-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.macro-item:last-child {
  border-bottom: none;
}

.macro-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.macro-name {
  font-size: 12px;
  color: #ddd;
  background: #12121f;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
  white-space: nowrap;
  align-self: flex-start;
}

.macro-desc {
  font-size: 11px;
  color: #667;
}

.macro-preview {
  flex: 1;
  min-width: 0;
}

.preview-val {
  font-size: 11px;
  color: #889;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #333;
  border-radius: 20px;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #4a8;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background: #ccc;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(16px);
}
</style>
