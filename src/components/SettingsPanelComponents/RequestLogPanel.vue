<template>
  <div class="log-panel">
    <div class="log-header">
      <span>共 {{ logs.length }} 条日志</span>
      <button class="clear-btn" @click="clearLogs">清空</button>
      <button class="refresh-btn" @click="refresh">刷新</button>
    </div>
    <div class="log-list" ref="listRef">
      <div v-if="logs.length === 0" class="empty">暂无日志 — 发送一条消息后，请求和响应会出现在这里</div>
      <div v-for="entry in logs" :key="entry.id" class="log-entry" :class="entry.direction">
        <div class="log-meta">
          <span class="log-dir">{{ dirLabel(entry.direction) }}</span>
          <span class="log-label">{{ entry.label }}</span>
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
        </div>
        <pre class="log-detail">{{ entry.detail }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUpdated, nextTick } from 'vue';
import { getLogs, clearLogs } from '../../stores/requestLogger';

const logs = getLogs();
const listRef = ref<HTMLElement | null>(null);

function refresh() { /* reactive — no-op, Vue re-renders */ }

function dirLabel(d: string) {
  return d === 'request' ? '📤 请求' : d === 'response' ? '📥 响应' : '❌ 错误';
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

onUpdated(() => {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = 0;
    }
  });
});
</script>

<style scoped>
.log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 300px;
}

.log-header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2a3e;
  font-size: 13px;
  color: #889;
  flex-shrink: 0;
}

.log-header span {
  flex: 1;
}

.clear-btn, .refresh-btn {
  padding: 2px 10px;
  background: #1a1a2e;
  border: 1px solid #334;
  border-radius: 3px;
  color: #778;
  font-size: 11px;
  cursor: pointer;
}

.clear-btn:hover, .refresh-btn:hover {
  background: #2a2a3e;
  color: #aab;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
}

.empty {
  color: #445;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

.log-entry {
  margin-bottom: 8px;
  border-radius: 4px;
  overflow: hidden;
}

.log-entry.request {
  border-left: 3px solid #4a8;
}

.log-entry.response {
  border-left: 3px solid #48a;
}

.log-entry.error {
  border-left: 3px solid #a44;
}

.log-meta {
  display: flex;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  background: rgba(18, 18, 31, 0.8);
  color: #889;
}

.log-dir {
  font-weight: bold;
  min-width: 50px;
}

.log-label {
  flex: 1;
  color: #aab;
}

.log-time {
  color: #556;
  font-family: monospace;
}

.log-detail {
  margin: 0;
  padding: 8px;
  font-size: 11px;
  font-family: monospace;
  line-height: 1.4;
  color: #bbc;
  background: rgba(10, 10, 20, 0.8);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}
</style>
