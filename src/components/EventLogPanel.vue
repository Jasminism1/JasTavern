<template>
  <div class="log-panel">
    <!-- 日志标题栏 -->
    <div class="log-header">
      <h3>故事记录簿</h3>
      <button @click="clearLog">清空日志</button>
    </div>

    <!-- 日志列表（核心扩展区） -->
    <div class="log-list">
      <div v-for="(log, index) in logs" :key="index" class="log-item">
        <span class="log-time">{{ log.time }}</span>
        <span class="log-content">{{ log.content }}</span>
      </div>
      <div v-if="logs.length === 0" class="log-empty">暂无记录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 日志数据（后续可扩展为持久化存储）
const logs = ref([
  { time: '14:30', content: '你进入了新手村庄' },
  { time: '14:31', content: '获得道具：生命药水×1' },
  { time: '14:32', content: '遇到NPC：村长' }
])

// 清空日志
function clearLog() {
  logs.value = []
}
</script>

<style scoped>
.log-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #eee;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.log-header h3 {
  margin: 0;
  font-size: 16px;
}

.log-header button {
  padding: 4px 8px;
  background: #311;
  border: 1px solid #633;
  border-radius: 4px;
  color: #f88;
  cursor: pointer;
}
.log-header button:hover {
  background: #422;
}

/* 日志容器（自动滚动） */
.log-list {
  flex: 1;
  background: #0f0f1a;
  border: 1px solid #334;
  border-radius: 6px;
  padding: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-item {
  padding: 6px 8px;
  background: #1a1a2e;
  border-radius: 4px;
  display: flex;
  gap: 8px;
}

.log-time {
  color: #667;
  font-size: 12px;
  white-space: nowrap;
}

.log-content {
  color: #ccc;
  flex: 1;
}

.log-empty {
  color: #667;
  text-align: center;
  padding: 20px;
}
</style>