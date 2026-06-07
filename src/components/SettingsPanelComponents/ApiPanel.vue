<template>
  <div class="api-panel">
    <!-- API 来源选择 -->
    <div class="setting-group">
      <h4>API 连接来源</h4>
      <div class="source-toggle">
        <button
          class="source-btn"
          :class="{ active: localSource === 'st-builtin' }"
          @click="localSource = 'st-builtin'"
        >
          使用酒馆连接
        </button>
        <button
          class="source-btn"
          :class="{ active: localSource === 'custom' }"
          @click="localSource = 'custom'"
        >
          自定义 API
        </button>
      </div>
      <p class="source-hint" v-if="localSource === 'st-builtin'">
        {{ stConnected ? '已检测到酒馆连接，将使用酒馆的 API 配置发送请求' : '未检测到酒馆环境，请使用自定义 API 或确认已在酒馆中打开此页面' }}
      </p>
    </div>

    <!-- ST 连接信息（只读） -->
    <div class="setting-group" v-if="localSource === 'st-builtin' && stProfile">
      <h4>酒馆连接信息（只读）</h4>
      <div class="info-row">
        <span class="info-label">接口地址</span>
        <span class="info-value">{{ stProfile.baseUrl || '（未检测到）' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">模型</span>
        <span class="info-value">{{ stProfile.model || '（未检测到）' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">API Key</span>
        <span class="info-value">{{ stProfile.apiKey ? '已检测到 (••••' + stProfile.apiKey.slice(-4) + ')' : '（未检测到）' }}</span>
      </div>
    </div>

    <!-- 自定义 API 配置 -->
    <div class="setting-group" v-if="localSource === 'custom'">
      <h4>自定义 API 配置</h4>

      <div class="setting-item">
        <label>接口地址 (Base URL)</label>
        <input v-model="localApi.baseUrl" type="text" placeholder="https://api.openai.com/v1" class="text-input" />
      </div>

      <div class="setting-item">
        <label>API Key</label>
        <input v-model="localApi.apiKey" type="password" placeholder="sk-..." class="text-input" />
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

    <!-- 状态栏 -->
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
import { isInSillyTavern, detectStConnection } from '../../sillytavern/st-integration';
import type { ApiSettings, ApiSource, StConnectionProfile } from '../../sillytavern/types';

const st = useSillytavern();

const stConnected = ref(isInSillyTavern());
const stProfile = ref<StConnectionProfile | null>(null);

const localSource = ref<ApiSource>('st-builtin');
const localApi = ref<ApiSettings>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4',
  timeout: 60000,
});

const isSaving = ref(false);
const statusText = ref('');

// Init from existing settings
onMounted(() => {
  const s = st.settings.value;
  if (s) {
    localSource.value = s.apiSource || (stConnected.value ? 'st-builtin' : 'custom');
    if (s.api) {
      localApi.value = { ...s.api };
    }
  }

  if (stConnected.value) {
    stProfile.value = detectStConnection();
  }
});

async function saveConfig() {
  isSaving.value = true;
  statusText.value = '保存中...';
  try {
    await st.updateSettings({
      apiSource: localSource.value,
      api: { ...localApi.value },
    });
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

.source-toggle {
  display: flex;
  gap: 8px;
}

.source-btn {
  flex: 1;
  padding: 10px 12px;
  background: #16213e;
  border: 1px solid #334;
  border-radius: 4px;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.source-btn.active {
  background: #1e2d4a;
  border-color: #5a8;
  color: #aea;
}

.source-btn:hover { background: #1a2840; }

.source-hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #778;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}

.info-label { color: #889; }

.info-value {
  color: #bbc;
  font-family: monospace;
  font-size: 12px;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
