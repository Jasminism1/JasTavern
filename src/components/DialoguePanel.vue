<template>
  <section class="dialogue-panel" :class="{ 'is-bouncing': isBouncing }">

    <div class="message-list" ref="listRef">
      <div class="bounce-gap" :style="{ height: bounceOffset + 'px' }"></div>

      <div class="message-bubble assistant streaming" v-if="isGenerating && streamText">
        <div class="bubble-role">AI</div>
        <div class="bubble-text">{{ streamText }}<span class="cursor">▍</span></div>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-bubble"
        :class="msg.type"
      >
        <div class="bubble-role">{{ msg.type === 'user' ? '你' : 'AI' }}</div>
        <div class="bubble-text">{{ msg.content }}</div>
      </div>

      <div class="empty-hint" v-if="!messages.length && !isGenerating">
        <p>对话开始后，消息将显示在这里。</p>
      </div>

      <div id="mobile-panels-container"></div>

      <div class="embedded-choices" v-if="activeTab === 'choices'">
        <p class="choices-placeholder">选项区（AI 返回 choices 后显示）</p>
      </div>
    </div>

    <div class="quick-nav-tools">
      <button class="nav-btn" @click="scrollToTop" title="回顶">▲</button>
      <button class="nav-btn" @click="scrollToBottom" title="回底">▼</button>
    </div>

    <div class="tab-bar">
      <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </div>

    <div class="tab-content">
      <div v-if="activeTab === 'quick'"><p class="tab-placeholder">快捷行动（待配置）</p></div>
      <div v-else-if="activeTab === 'memory'"><p class="tab-placeholder">记忆摘要（待实现）</p></div>
    </div>

    <div class="input-area">
      <textarea v-model="inputText" class="input-box" placeholder="输入行动或对话…" rows="2" @keydown.enter.exact.prevent="sendMessage" />
      <button class="send-btn" :disabled="isGenerating || !inputText.trim()" @click="sendMessage">
        {{ isGenerating ? '…' : '发送' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useConversationTreeStore } from '../stores/conversationTree'
import { useSillytavern } from '../composables/useSillytavern'

const store = useAppStore()
const tree = useConversationTreeStore()
const st = useSillytavern()
const listRef = ref<HTMLElement | null>(null)
const inputText = ref('')
const activeTab = ref('choices')

const bounceOffset = ref(0)
const isBouncing = ref(false)
let bounceTimer: ReturnType<typeof setTimeout> | undefined

const messages = computed(() => tree.activePathMessages)
const isGenerating = computed(() => store.isGenerating)
const streamText = computed(() => store.streamText)
const tabs = [{ id: 'quick', label: '快捷' }, { id: 'memory', label: '记忆' }, { id: 'other', label: '其他' }]

const handleGlobalWheel = (e: WheelEvent) => {
  if (!listRef.value) return

  const isOverList = e.composedPath().includes(listRef.value)
  if (!isOverList) {
    listRef.value.scrollTop += e.deltaY
  }

  if (listRef.value.scrollTop <= 0 && e.deltaY < 0) {
    applyBounceEffect()
  }
}

function applyBounceEffect() {
  if (isBouncing.value) return
  isBouncing.value = true
  bounceOffset.value = 20

  clearTimeout(bounceTimer)
  bounceTimer = setTimeout(() => {
    bounceOffset.value = 0
    setTimeout(() => { isBouncing.value = false }, 300)
  }, 150)
}

function scrollToTop() {
  listRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  if (!listRef.value) return
  listRef.value.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
}

function applyMobilePanels() {
  const isMobile = window.innerWidth <= 900
  const mobileContainer = document.getElementById('mobile-panels-container')
  const portrait = document.querySelector('.portrait-layer') as HTMLElement | null
  const status = document.querySelector('.status-panel') as HTMLElement | null
  const colLeft = document.querySelector('.col-left') as HTMLElement | null
  const colRight = document.querySelector('.col-right') as HTMLElement | null

  if (isMobile && mobileContainer) {
    if (portrait && portrait.parentElement !== mobileContainer) {
      mobileContainer.appendChild(portrait)
    }
    if (status && status.parentElement !== mobileContainer) {
      mobileContainer.appendChild(status)
    }
  } else {
    if (portrait && colLeft && portrait.parentElement !== colLeft) {
      colLeft.appendChild(portrait)
    }
    if (status && colRight && status.parentElement !== colRight) {
      colRight.appendChild(status)
    }
  }
}

let panelObserver: MutationObserver | null = null

function setupPanelObserver() {
  panelObserver?.disconnect()
  const colLeft = document.querySelector('.col-left')
  const colRight = document.querySelector('.col-right')
  if (!colLeft && !colRight) return

  panelObserver = new MutationObserver(() => {
    requestAnimationFrame(applyMobilePanels)
  })
  if (colLeft) panelObserver.observe(colLeft, { childList: true })
  if (colRight) panelObserver.observe(colRight, { childList: true })
}

const handleResize = () => {
  applyMobilePanels()
}

onMounted(async () => {
  window.addEventListener('wheel', handleGlobalWheel, { passive: true })
  window.addEventListener('resize', handleResize)

  await nextTick()
  applyMobilePanels()
  setupPanelObserver()
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleGlobalWheel)
  window.removeEventListener('resize', handleResize)
  panelObserver?.disconnect()
  clearTimeout(bounceTimer)
})

watch([messages, streamText], async () => {
  await nextTick()
  scrollToBottom()
})

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isGenerating.value) return

  inputText.value = ''
  store.isGenerating = true

  try {
    // Ensure an active chat exists (create one lazily if needed)
    if (!st.activeChat.value) {
      await st.createChat()
    }

    const result = await st.sendMessage(text)
    // The conversationTree has been updated by sendMessage,
    // the UI picks it up via the computed messages.
    // For streaming display, we'll set streamText for now
    store.streamText = result.reply
  } catch (err) {
    console.error('[DialoguePanel] Send failed:', err)
  } finally {
    store.isGenerating = false
    store.streamText = ''
  }
}
</script>

<style>
@media (max-width: 900px) {
  .col-center {
    position: fixed !important;
    top: 60px !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 1000 !important;
    width: 100% !important;
    max-width: none !important;
    background: #0a0a12 !important;
    overflow: hidden !important;
  }

  .col-center .dialogue-panel {
    max-width: 100% !important;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
    border: none !important;
  }

  .col-left,
  .col-right {
    display: none !important;
  }

  #mobile-panels-container {
    display: flex !important;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 16px;
    padding: 16px 0;
    margin-top: 8px;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  }

  #mobile-panels-container .portrait-layer,
  #mobile-panels-container .status-panel {
    position: static !important;
    width: 45% !important;
    min-width: 150px;
    height: auto !important;
    max-height: 400px;
    margin: 0 !important;
    transform: none !important;
    flex-shrink: 0;
  }
}
</style>

<style scoped>
.dialogue-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: 700px;
  min-width: 0;
  margin: 0 auto;
  background: rgba(18, 18, 31, 0.9);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  position: relative;
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-sizing: border-box;
  overflow: hidden;
}

.dialogue-panel.is-bouncing {
  transform: translateY(4px);
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
}

.bounce-gap {
  transition: height 0.3s ease;
  flex-shrink: 0;
}

.quick-nav-tools {
  position: absolute;
  bottom: 16px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
}

.nav-btn {
  width: 28px;
  height: 28px;
  background: rgba(30, 30, 45, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #889;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.nav-btn:hover {
  background: rgba(74, 144, 226, 0.6);
  color: #fff;
  border-color: rgba(74, 144, 226, 0.8);
}

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
  min-width: 0;
  overflow-wrap: break-word;
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
  min-width: 0;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.input-area {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(34, 34, 34, 0.8);
  background: rgba(15, 15, 26, 0.85);
  flex-shrink: 0;
  border-radius: 0 0 12px 12px;
  box-sizing: border-box;
}

.input-box {
  flex: 1;
  min-width: 0;
  background: rgba(26, 26, 46, 0.8);
  border: 1px solid rgba(51, 51, 51, 0.8);
  border-radius: 4px;
  color: #ddd;
  font-size: 14px;
  padding: 6px 10px;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  box-sizing: border-box;
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
  flex-shrink: 0;
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn:hover:not(:disabled) { background: rgba(58, 74, 122, 0.8); }

@media (max-width: 600px) {
  .dialogue-panel {
    max-width: 100%;
    border-radius: 8px;
    margin: 0;
  }

  .message-list {
    padding: 0 10px 8px 10px;
    gap: 8px;
  }

  .input-area {
    padding: 6px 10px;
    gap: 6px;
  }

  .bubble-text {
    padding: 6px 10px;
    font-size: 13px;
  }

  .quick-nav-tools {
    right: 8px;
    bottom: 10px;
  }

  .nav-btn {
    width: 24px;
    height: 24px;
    font-size: 9px;
  }
}

@media (max-width: 400px) {
  .dialogue-panel {
    max-width: 100%;
    border-radius: 0;
    margin: 0;
  }

  .message-list {
    padding: 0 6px 6px 6px;
    gap: 6px;
  }

  .message-bubble {
    max-width: 92%;
  }

  .input-area {
    padding: 4px 6px;
    gap: 4px;
    border-radius: 0;
  }

  .input-box {
    padding: 4px 8px;
    font-size: 13px;
  }

  .send-btn {
    padding: 0 10px;
    font-size: 12px;
    height: 32px;
  }

  .tab-content {
    padding: 4px 8px;
    min-height: 36px;
    max-height: 60px;
  }

  .tab-btn {
    padding: 4px;
    font-size: 11px;
  }

  .quick-nav-tools {
    right: 4px;
    bottom: 6px;
  }
}
</style>
