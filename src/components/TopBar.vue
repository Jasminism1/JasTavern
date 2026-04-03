<template>
  <div class="floating-top-controls">
    
    <Transition name="slide-fade">
      <div class="button-group system-group" v-if="scrollDirection === 'down'">
        <button class="btn-floating btn-settings" @click="handleOpen('settings')">⚙️ 设置</button>
        <button class="btn-floating btn-exit" @click="exitUI">✕ 退出</button>
      </div>
    </Transition>

    <Transition name="slide-fade">
      <div class="button-group nav-group" v-if="scrollDirection === 'up'">
        <button
          v-for="btn in navButtons"
          :key="btn.id"
          class="btn-floating"
          :class="{ active: activeModal === btn.id }"
          @click="handleOpen(btn.id)"
        >
          {{ btn.label }}
        </button>
      </div>
    </Transition>

  </div>

  <Transition name="modal-fade">
    <div class="full-screen-modal-overlay" v-if="activeModal" @click.self="closeModal">
      <div class="modal-window">
        <div class="modal-header">
          <span class="modal-title">{{ currentModalLabel }}</span>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <KeepAlive><component :is="currentPanelComponent" /></KeepAlive>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAppStore, type ModalId } from '../stores/app'

// 导入面板组件
import MapPanel from './MapPanel.vue'
import CharDetailPanel from './CharDetailPanel.vue'
import EventLogPanel from './EventLogPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import OthersPanel from './OthersPanel.vue'

const store = useAppStore()
const activeModal = computed(() => store.activeModal)

// --- 动态显示逻辑 ---
const scrollDirection = ref<'up' | 'down'>('up') // 默认显示导航组
let lastScrollY = window.scrollY
let touchStartY = 0

// 处理滚轮或滑动逻辑
const handleScroll = (deltaY: number) => {
  if (Math.abs(deltaY) < 5) return // 忽略微小抖动
  scrollDirection.value = deltaY > 0 ? 'down' : 'up'
}

// 监听滚轮 (PC)
const onWheel = (e: WheelEvent) => handleScroll(e.deltaY)

// 监听触摸 (移动端)
const onTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY }
const onTouchMove = (e: TouchEvent) => {
  const touchY = e.touches[0].clientY
  handleScroll(touchStartY - touchY)
  touchStartY = touchY
}

onMounted(() => {
  window.addEventListener('wheel', onWheel)
  window.addEventListener('touchstart', onTouchStart)
  window.addEventListener('touchmove', onTouchMove)
})

onUnmounted(() => {
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
})

// --- 常规逻辑 ---
const navButtons: { id: ModalId; label: string }[] = [
  { id: 'map',       label: '🗺️ 地图' },
  { id: 'character', label: '👤 角色' },
  { id: 'log',       label: '📖 记录' },
  { id: 'others',    label: '✨ 其他' },
]

const panelMap: Record<string, any> = {
  map: MapPanel, character: CharDetailPanel, log: EventLogPanel, settings: SettingsPanel, others: OthersPanel
}

const currentModalLabel = computed(() => {
  const labels: any = { map:'地图', character:'角色', log:'记录', settings:'设置', others:'其他' }
  return activeModal.value ? labels[activeModal.value] : ''
})

const currentPanelComponent = computed(() => activeModal.value ? panelMap[activeModal.value] : null)

function handleOpen(id: ModalId) { store.openModal(id) }
function closeModal() { store.closeModal() }
function exitUI() { store.exitUI() }
</script>

<style scoped>
/* 1. 浮动容器：固定在顶部，不占位 */
.floating-top-controls {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 5000; /* 确保在所有 UI 层之上，但在 Modal 之下 */
  pointer-events: none; /* 穿透容器，点击空白处不阻挡操作 */
  padding: 10px;
  box-sizing: border-box; /* 新增：确保padding不超出宽度 */
}

/* 按钮组通用样式 */
.button-group {
  pointer-events: auto; /* 允许点击按钮 */
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: none; /* 修改：取消最大宽度限制，适配全屏 */
  margin: 0; /* 修改：取消自动居中 */
}

/* 系统按钮组：设置左、退出右 */
.system-group {
  justify-content: space-between; /* 核心：左右分布 */
  align-items: center; /* 垂直居中 */
}

/* 导航按钮组：保持居中 */
.nav-group {
  justify-content: center;
  align-items: center;
  max-width: 800px; /* 仅导航组保留最大宽度 */
  margin: 0 auto; /* 导航组居中 */
}

.spacer { 
  display: none; /* 移除：不再需要占位符 */
}

/* 2. 按钮发光风格 (针对无背景优化) */
.btn-floating {
  padding: 6px 12px;
  background: rgba(15, 15, 25, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(100, 100, 255, 0.3);
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
}

.btn-floating:hover {
  background: rgba(30, 30, 50, 0.9);
  border-color: #78aaff;
  color: #fff;
  transform: translateY(-2px);
}

.btn-floating.active {
  background: rgba(120, 170, 255, 0.2);
  border-color: #78aaff;
  color: #fff;
  box-shadow: 0 0 10px rgba(120, 170, 255, 0.4);
}

.btn-exit {
  border-color: rgba(255, 85, 85, 0.4);
  color: #ff8888;
}
.btn-exit:hover { background: rgba(80, 20, 20, 0.8); border-color: #ff5555; }

/* 3. 动画：滑入滑出 */
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* 4. 模态窗口样式 (保持原样) */
.full-screen-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center; z-index: 10000;
}
.modal-window {
  background: #0f0f1e; border: 1px solid #334; width: 700px; height: 500px;
  display: flex; flex-direction: column; border-radius: 4px;
}
.modal-header { display: flex; justify-content: space-between; padding: 10px 15px; border-bottom: 1px solid #222; }
.modal-title { color: #78aaff; font-size: 14px; }
.modal-body { flex: 1; overflow-y: auto; }
.modal-close { background: none; border: none; color: #666; font-size: 18px; cursor: pointer; }
</style>