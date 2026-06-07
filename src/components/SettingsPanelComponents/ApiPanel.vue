<template>
  <div class="api-panel">
    <div class="setting-group">
      <h4>API 连接配置</h4>
      <p class="api-notice">API Key 仅保存在浏览器本地，不会被提交到 Git。</p>
      <div v-if="stConnected" class="st-info">
        已检测到酒馆环境 — 角色名、预设和世界书已自动导入。请在下方配置 API Key。
      </div>

      <div class="setting-item">
        <label>接口地址 (Base URL)</label>
        <input v-model="localApi.baseUrl" type="text" placeholder="https://api.openai.com/v1" class="text-input" />
        <small class="help">以 <code>/v1</code> 结尾时会自动补全 <code>/chat/completions</code></small>
      </div>

      <div class="setting-item">
        <label>API Key</label>
        <input v-model="localApi.apiKey" type="password" placeholder="sk-..." class="text-input" autocomplete="off" />
      </div>

      <div class="setting-item">
        <label>模型名称</label>
        <div class="model-select-row">
          <input v-model="localApi.model" type="text" placeholder="gpt-4" class="text-input flex1" />
          <button class="action-btn" @click="fetchModels" :disabled="fetchingModels">
            {{ fetchingModels ? '获取中...' : '拉取模型' }}
          </button>
        </div>
        <select v-if="availableModels.length > 0" v-model="localApi.model" class="model-select">
          <option value="">-- 选择模型 --</option>
          <option v-for="m in availableModels" :key="m.id" :value="m.id">
            {{ m.id }}
          </option>
        </select>
      </div>

      <div class="setting-item">
        <label>超时 (毫秒)</label>
        <input v-model.number="localApi.timeout" type="number" min="5000" max="300000" step="5000" class="text-input" />
      </div>
    </div>

    <div class="btn-group">
      <button class="action-btn" @click="testConnection" :disabled="testing">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <button class="action-btn" @click="sendTestMessage" :disabled="sendingTest">
        {{ sendingTest ? '发送中...' : '发送测试消息' }}
      </button>
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
import { isInSillyTavern } from '../../sillytavern/st-integration';
import { saveApiConfig, loadApiConfig, type ApiConfig } from '../../stores/apiStorage';

const stConnected = ref(isInSillyTavern());

const localApi = ref<ApiConfig>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4',
  timeout: 60000,
});

const isSaving = ref(false);
const statusText = ref('');
const testing = ref(false);
const sendingTest = ref(false);
const fetchingModels = ref(false);
const availableModels = ref<{ id: string }[]>([]);

onMounted(async () => {
  const saved = await loadApiConfig();
  if (saved) {
    localApi.value = { ...saved };
  }
});

async function saveConfig() {
  isSaving.value = true;
  statusText.value = '保存中...';
  try {
    await saveApiConfig({ ...localApi.value });
    statusText.value = '配置已保存到本地';
    setTimeout(() => { statusText.value = ''; }, 2000);
  } catch (err) {
    statusText.value = '保存失败: ' + String(err);
  } finally {
    isSaving.value = false;
  }
}

function getFetchUrl(path: string): string {
  let base = localApi.value.baseUrl;
  if (base.endsWith('/v1')) {
    base += path;
  } else if (base.endsWith('/')) {
    base = base.slice(0, -1) + path;
  } else {
    base += path;
  }
  return base;
}

async function testConnection() {
  testing.value = true;
  statusText.value = '正在测试连接...';
  try {
    const url = getFetchUrl('/models');
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localApi.value.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(localApi.value.timeout),
    });
    if (res.ok) {
      statusText.value = '连接成功 ✅';
    } else {
      statusText.value = `服务器返回错误 ${res.status}`;
    }
  } catch (err) {
    statusText.value = '连接失败: ' + String(err);
  } finally {
    testing.value = false;
  }
}

async function fetchModels() {
  fetchingModels.value = true;
  statusText.value = '正在获取模型列表...';
  try {
    const url = getFetchUrl('/models');
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${localApi.value.apiKey}`,
      },
      signal: AbortSignal.timeout(localApi.value.timeout),
    });
    const data = await res.json();
    availableModels.value = data.data ?? [];
    statusText.value = `获取到 ${availableModels.value.length} 个模型`;
  } catch (err) {
    statusText.value = '获取失败: ' + String(err);
  } finally {
    fetchingModels.value = false;
  }
}

async function sendTestMessage() {
  sendingTest.value = true;
  statusText.value = '正在发送测试消息...';
  try {
    const url = getFetchUrl('/chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localApi.value.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: localApi.value.model,
        messages: [{ role: 'user', content: 'Hello!' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(localApi.value.timeout),
    });
    const data = await res.json();
    if (data.choices?.[0]) {
      statusText.value = '测试成功：' + data.choices[0].message?.content;
    } else {
      statusText.value = '响应异常：' + JSON.stringify(data).slice(0, 100);
    }
  } catch (err) {
    statusText.value = '发送失败: ' + String(err);
  } finally {
    sendingTest.value = false;
  }
}
</script>

<style scoped>
/* 在原有样式基础上增加以下内容 */
.help {
  font-size: 11px;
  color: #668;
  margin-top: 4px;
}
.model-select-row {
  display: flex;
  gap: 6px;
}
.flex1 {
  flex: 1;
}
.model-select {
  margin-top: 4px;
  padding: 6px;
  background: #12121f;
  border: 1px solid #334;
  border-radius: 4px;
  color: #ddd;
  font-size: 13px;
}
.action-btn {
  padding: 6px 12px;
  background: #1f2a3a;
  border: 1px solid #3a4a6a;
  border-radius: 4px;
  color: #aac;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.action-btn:hover:not(:disabled) {
  background: #2a3a5a;
  color: #fff;
}
.btn-group {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
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
/* 保留原有样式… */
</style>