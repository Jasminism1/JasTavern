<template>
  <!-- ============================================================
    DialoguePanel.vue
    中部主舞台：
      - 上方：AI 消息楼层滚动列表（接近酒馆原样式）
      - 中部：消息楼层内嵌入选项区
      - 底部：仅保留快捷/记忆/其他选项卡 + 输入框
  ============================================================ -->
  <section class="dialogue-panel">

    <!-- ① 消息楼层区 -->
    <div class="message-list" ref="listRef">
      <!-- 生成中：流式输出预览 -->
      <div class="message-bubble assistant streaming" v-if="isGenerating && streamText">
        <div class="bubble-role">AI</div>
        <div class="bubble-text">{{ streamText }}<span class="cursor">▍</span></div>
      </div>

      <!-- 历史消息 -->
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-bubble"
        :class="msg.role"
      >
        <div class="bubble-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="bubble-text">{{ msg.text }}</div>
      </div>

      <!-- 空状态 -->
      <div class="empty-hint" v-if="!messages.length && !isGenerating">
        <p>对话开始后，消息将显示在这里。</p>
      </div>

      <!-- 选项区：嵌入到消息楼层底部 -->
      <div class="embedded-choices" v-if="activeTab === 'choices'">
        <p class="choices-placeholder">选项区（AI 返回 choices 后显示）</p>
      </div>
    </div>

      <div class="quick-nav-tools">
        <button class="nav-btn" @click="scrollToTop" title="回顶">▲</button>
        <button class="nav-btn" @click="scrollToBottom" title="回底">▼</button>
      </div>

    <!-- ② 底部简化选项卡（仅保留快捷/记忆/其他） -->
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 选项卡内容区（仅快捷/记忆有占位，其他无内容） -->
    <div class="tab-content">
      <div v-if="activeTab === 'quick'">
        <p class="tab-placeholder">快捷行动（待配置）</p>
      </div>
      <div v-else-if="activeTab === 'memory'">
        <p class="tab-placeholder">记忆摘要（待实现）</p>
      </div>
    </div>

    <!-- ③ 输入框区 -->
    <div class="input-area">
      <textarea
        v-model="inputText"
        class="input-box"
        placeholder="输入行动或对话…"
        rows="2"
        @keydown.enter.exact.prevent="sendMessage"
        @keydown.enter.shift.exact="inputText += '\n'"
      />
      <button
        class="send-btn"
        :disabled="isGenerating || !inputText.trim()"
        @click="sendMessage"
      >
        {{ isGenerating ? '…' : '发送' }}
      </button>
    </div>

  </section>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const listRef = ref<HTMLElement | null>(null)
const inputText = ref('')
const activeTab = ref('choices')

// --- 回弹与滚动逻辑 ---
const bounceOffset = ref(0)
const isBouncing = ref(false)
let bounceTimer: any = null

const messages = computed(() => store.messages)
const isGenerating = computed(() => store.isGenerating)
const streamText = computed(() => store.streamText)
const tabs = [{ id: 'quick', label: '快捷' }, { id: 'memory', label: '记忆' }, { id: 'other', label: '其他' }]

// 1. 全局滚轮监听
const handleGlobalWheel = (e: WheelEvent) => {
  if (!listRef.value) return
  
  // 如果当前鼠标不在 listRef 上，手动同步滚动
  const isOverList = e.composedPath().includes(listRef.value)
  if (!isOverList) {
    listRef.value.scrollTop += e.deltaY
  }

  // 2. 顶部回弹检测
  if (listRef.value.scrollTop <= 0 && e.deltaY < 0) {
    applyBounceEffect()
  }
}

// 模拟顶部拉伸惯性
function applyBounceEffect() {
  if (isBouncing.value) return
  isBouncing.value = true
  bounceOffset.value = 20 // 拉伸高度
  
  clearTimeout(bounceTimer)
  bounceTimer = setTimeout(() => {
    bounceOffset.value = 0
    setTimeout(() => { isBouncing.value = false }, 300) // 对应 CSS 过渡时间
  }, 150)
}

function scrollToTop() {
  listRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
}

// 挂载全局监听
onMounted(() => {
  window.addEventListener('wheel', handleGlobalWheel, { passive: false })
})
onUnmounted(() => {
  window.removeEventListener('wheel', handleGlobalWheel)
})

// 自动回底
watch([messages, streamText], async () => {
  await nextTick()
  scrollToBottom()
})

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isGenerating.value) return
  store.pushMessage({ id: Date.now(), role: 'user', text, raw: text, timestamp: Date.now() })
  inputText.value = ''
  // 模拟 AI
  store.isGenerating = true
  await new Promise(r => setTimeout(r, 800))
  store.pushMessage({ id: Date.now(), role: 'assistant', text: `（回复：${text}）`, raw: '', timestamp: Date.now() })
  store.isGenerating = false
}
</script>

<style scoped>
.dialogue-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100vh;
  max-width: 700px;
  margin: 0 auto;
  background: rgba(18, 18, 31, 0.9);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  position: relative; /* 必须为 relative 以便定位导航按钮 */
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 回弹动画：整体面板微弱下移 */
.dialogue-panel.is-bouncing {
  transform: translateY(4px);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
  /* 隐藏原生滚动条，使用自定义样式 */
  scrollbar-width: thin;
}

.bounce-gap {
  transition: height 0.3s ease;
  flex-shrink: 0;
}

/* 快速导航按钮组 */
.quick-nav-tools {
  position: absolute;
  right: -40px; /* 放在对话框外侧 */
  bottom: 80px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.nav-btn {
  width: 28px;
  height: 28px;
  background: rgba(30, 30, 45, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #889;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.nav-btn:hover {
  background: rgba(74, 144, 226, 0.4);
  color: #fff;
  border-color: rgba(74, 144, 226, 0.6);
}

/* 滚动条美化 */
.message-list::-webkit-scrollbar {
  width: 6px;
}
.message-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}
.message-list::-webkit-scrollbar-thumb {
  background: rgba(85, 85, 119, 0.5);
  border-radius: 3px;
}
.message-list::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 102, 153, 0.7);
}

/* 嵌入到消息楼层的选项区 */
.embedded-choices {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(15, 15, 26, 0.8);
  border-radius: 6px;
  border: 1px solid rgba(34, 34, 34, 0.8);
}
.choices-placeholder {
  color: #444;
  font-size: 12px;
  margin: 0;
}

.message-bubble {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 85%;
}

.message-bubble.user     { align-self: flex-end; }
.message-bubble.assistant { align-self: flex-start; }

.bubble-role {
  font-size: 11px;
  color: #666;
  padding: 0 4px;
}

.bubble-text {
  background: rgba(30, 30, 48, 0.8);
  border: 1px solid rgba(46, 46, 68, 0.8);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: #ddd;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-bubble.user .bubble-text {
  background: rgba(26, 37, 53, 0.8);
  border-color: rgba(42, 58, 85, 0.8);
}

.cursor {
  display: inline-block;
  animation: blink 0.8s step-end infinite;
  color: #7eb8ff;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #444;
  font-size: 13px;
}

/* 底部简化选项卡（仅快捷/记忆/其他） */
.tab-bar {
  display: flex;
  border-top: 1px solid rgba(34, 34, 34, 0.8);
  border-bottom: 1px solid rgba(34, 34, 34, 0.8);
  background: rgba(15, 15, 26, 0.85);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 6px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
}
.tab-btn.active {
  color: #aac;
  border-bottom-color: #557;
  background: rgba(18, 18, 30, 0.9);
}
.tab-btn:hover { color: #aaa; }

.tab-content {
  min-height: 48px;
  max-height: 80px;
  overflow-y: auto;
  padding: 6px 12px;
  background: rgba(15, 15, 26, 0.85);
  flex-shrink: 0;
}

.tab-placeholder {
  color: #444;
  font-size: 12px;
  padding: 8px 0;
  margin: 0;
}

/* 输入区 */
.input-area {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(34, 34, 34, 0.8);
  background: rgba(15, 15, 26, 0.85);
  flex-shrink: 0;
  border-radius: 0 0 12px 12px; /* 底部圆角 */
}

.input-box {
  flex: 1;
  background: rgba(26, 26, 46, 0.8);
  border: 1px solid rgba(51, 51, 51, 0.8);
  border-radius: 4px;
  color: #ddd;
  font-size: 14px;
  padding: 6px 10px;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
}
.input-box:focus { outline: none; border-color: #557; }

.send-btn {
  padding: 0 16px;
  background: rgba(42, 58, 90, 0.8);
  border: 1px solid rgba(74, 106, 154, 0.8);
  border-radius: 4px;
  color: #aac;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-end;
  height: 36px;
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn:hover:not(:disabled) { background: rgba(58, 74, 122, 0.8); }
</style>