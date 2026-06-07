<template>
  <div class="log-panel">
    <div class="log-header">
      <span>共 {{ logs.length }} 条日志</span>
      <button class="action-btn" @click="expandAll">展开全部</button>
      <button class="action-btn" @click="collapseAll">折叠全部</button>
      <button class="action-btn" @click="clearLogs">清空</button>
    </div>
    <div class="log-list" ref="listRef">
      <div v-if="logs.length === 0" class="empty">暂无日志 — 发送消息或使用 API 测试后记录会出现在这里</div>
      <details v-for="entry in logs" :key="entry.id" class="log-entry" :class="entry.direction" :open="!entry.collapsed" @toggle="entry.collapsed = !($event.target as HTMLDetailsElement).open">
        <summary class="log-summary">
          <span class="log-dir">{{ dirLabel(entry.direction) }}</span>
          <span class="log-label">{{ entry.label }}</span>
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
        </summary>
        <pre class="log-detail">{{ entry.detail }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getLogs, clearLogs } from '../../stores/requestLogger';

const logs = getLogs();

function dirLabel(d: string) {
  return d === 'request' ? '请求' : d === 'response' ? '响应' : '错误';
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(new Date(ts).getMilliseconds()).padStart(3, '0');
}
function expandAll() { logs.forEach(e => e.collapsed = false); }
function collapseAll() { logs.forEach(e => e.collapsed = true); }
</script>

<style scoped>
.log-panel { display: flex; flex-direction: column; height: 100%; min-height: 300px; }
.log-header { display: flex; gap: 6px; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #2a2a3e; font-size: 13px; color: #889; flex-shrink: 0; }
.log-header span { flex: 1; }
.action-btn { padding: 2px 10px; background: #1a1a2e; border: 1px solid #334; border-radius: 3px; color: #778; font-size: 11px; cursor: pointer; }
.action-btn:hover { background: #2a2a3e; color: #aab; }
.log-list { flex: 1; overflow-y: auto; margin-top: 8px; }
.empty { color: #445; font-size: 13px; padding: 24px; text-align: center; }

.log-entry { margin-bottom: 4px; border-radius: 4px; overflow: hidden; }
.log-entry.request { border-left: 3px solid #4a8; }
.log-entry.response { border-left: 3px solid #48a; }
.log-entry.error { border-left: 3px solid #a44; }

.log-summary { display: flex; gap: 6px; padding: 5px 8px; font-size: 12px; background: rgba(18,18,31,0.9); cursor: pointer; user-select: none; list-style: none; }
.log-summary::-webkit-details-marker { display: none; }
.log-summary::before { content: '▸'; display: inline-block; width: 12px; font-size: 10px; color: #667; transition: transform 0.15s; }
details[open] > .log-summary::before { transform: rotate(90deg); }

.log-dir { font-weight: bold; min-width: 28px; font-size: 11px; color: #aab; }
.log-label { flex: 1; color: #bbc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-time { color: #556; font-family: monospace; font-size: 11px; flex-shrink: 0; }

.log-detail { margin: 0; padding: 8px 10px; font-size: 11px; font-family: 'Consolas', 'Courier New', monospace; line-height: 1.4; color: #bbc; background: rgba(10,10,20,0.9); white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
</style>
