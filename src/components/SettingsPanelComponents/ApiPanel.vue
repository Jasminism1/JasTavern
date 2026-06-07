<template>
  <div class="api-panel">
    <div class="setting-group">
      <h4>API 连接配置</h4>
      <p class="api-notice">API Key 仅保存在浏览器本地，不会被提交到 Git。请放心使用。</p>

      <div v-if="stConnected" class="st-info">
        已检测到酒馆环境 — 角色名、预设和世界书已自动导入。请在下方配置 API Key 以启用 AI 回复。
      </div>

      <div class="setting-item">
        <label>接口地址 (Base URL)</label>
        <input v-model="localApi.baseUrl" type="text" placeholder="https://api.openai.com/v1" class="text-input" />
      </div>

      <div class="setting-item">
        <label>API Key</label>
        <input v-model="localApi.apiKey" type="password" placeholder="sk-..." class="text-input" autocomplete="off" />
      </div>

      <div class="setting-item">
        <label>模型名称</label>
        <input v-model="localApi.model" type="text" placeholder="gpt-4" class="text-input" />
      </div>

      <div class="setting-item">
        <label>超时 (毫秒)</label>
        <input v-model.number="localApi.timeout" type="number" min="5000" max="300000" step="5000" class="text-input" />
      </div>
    </div>

    <div class="status-bar">
      <span class="status-dot" :class="{ active: isSaving }"></span>
      <span>{{ statusText }}</span>
    </div>

    <button class="save-btn" @click="saveConfig" :disabled="isSaving">
      {{ isSaving ? '保存中...' : '保存 API 配置' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSillytavern } from '../../composables/useSillytavern';
import { isInSillyTavern } from '../../sillytavern/st-integration';
import type { ApiSettings } from '../../sillytavern/types';

const st = useSillytavern();
const stConnected = ref(isInSillyTavern());

const localApi = ref<ApiSettings>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4',
  timeout: 60000,
});

const isSaving = ref(false);
const statusText = ref('');

onMounted(() => {
  const s = st.settings.value;
  if (s?.api) {
    localApi.value = { ...s.api };
  }
});

async function saveConfig() {
  isSaving.value = true;
  statusText.value = '保存中...';
  try {
    // The api object is plain data — safe for IndexedDB
    await st.updateSettings({ api: { ...localApi.value } });
    statusText.value = '已保存';
    setTimeout(() => { statusText.value = ''; }, 2000);
  } catch (err) {
    statusText.value = '保存失败: ' + String(err);
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.api-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  background: rgba(18, 18, 31, 0.6);
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  padding: 12px 14px;
}

.setting-group h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #aac;
}

.api-notice {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: #8a8;
  line-height: 1.5;
  padding: 8px;
  background: rgba(40, 40, 20, 0.4);
  border-radius: 4px;
  border-left: 3px solid #8a8;
}

.st-info {
  margin: 0 0 12px 0;
  padding: 8px;
  background: rgba(20, 40, 60, 0.4);
  border-radius: 4px;
  border-left: 3px solid #4a8;
  font-size: 12px;
  color: #8c8;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.setting-item label {
  font-size: 12px;
  color: #889;
}

.text-input {
  padding: 8px 10px;
  background: #12121f;
  border: 1px solid #334;
  border-radius: 4px;
  color: #ddd;
  font-size: 13px;
  font-family: monospace;
}

.text-input:focus { outline: none; border-color: #558; }
.text-input::placeholder { color: #445; }

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #667;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #444;
}

.status-dot.active {
  background: #5a8;
  animation: pulse 0.8s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.save-btn {
  padding: 8px 20px;
  background: #2a3a5a;
  border: 1px solid #4a6a9a;
  border-radius: 4px;
  color: #aac;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  align-self: center;
}

.save-btn:hover:not(:disabled) {
  background: #3a4a7a;
  color: #fff;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
