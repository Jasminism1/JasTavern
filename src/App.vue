<template>
  <!-- 全屏游戏 UI（active 状态） -->
  <Transition name="ui-fade">
    <div
      v-if="isUIActive"
      class="game-shell"
      :style="bgStyle"
    >
      <!-- 顶部导航 -->
      <TopBar />

      <!-- 三栏主区域 -->
      <div class="game-body">

        <!-- 左：立绘 / Live2D -->
        <div class="col-left">
          <PortraitLayer ref="portraitRef" />
        </div>

        <!-- 中：对话 + 输入 -->
        <div class="col-center">
          <DialoguePanel />
        </div>

        <!-- 右：状态栏 -->
        <div class="col-right">
          <StatusPanel />
        </div>

      </div>
    </div>
  </Transition>

  <!-- 悬浮"进入游戏"按钮（UI 未激活时显示） -->
  <button
    v-if="!isUIActive"
    class="enter-btn"
    @click="enterUI"
  >
    ▶ 进入游戏 UI
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore }        from './stores/app'
import { useBackgroundStore } from './stores/background'
import TopBar        from './components/TopBar.vue'
import PortraitLayer from './components/PortraitLayer.vue'
import DialoguePanel from './components/DialoguePanel.vue'
import StatusPanel   from './components/StatusPanel.vue'

const store      = useAppStore()
const bgStore    = useBackgroundStore()
const isUIActive = computed(() => store.isUIActive)
const portraitRef = ref<InstanceType<typeof PortraitLayer> | null>(null)

function enterUI() { store.enterUI() }

// 将 currentBg URL 转为内联样式；为空时回退纯色
const bgStyle = computed(() => {
  const url = bgStore.currentBg
  if (!url) return { background: '#0a0a12' }
  return {
    backgroundImage:    `url("${url}")`,
    backgroundSize:     'cover',
    backgroundPosition: 'center',
    backgroundRepeat:   'no-repeat',
  }
})

defineExpose({ portraitRef })
</script>

<style>
/* ---- 全局重置 ---- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #0a0a12; color: #ccc; font-family: system-ui, sans-serif; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

/* ---- SillyTavern 全屏覆盖层重置 ---- */
#st-custom-ui-root {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 999999;
  background-color: transparent; /* Allow enter button to float over ST bg */
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none; /* Let clicks pass through when UI is inactive */
}

#st-custom-ui-root .game-shell,
#st-custom-ui-root .enter-btn {
  pointer-events: auto; /* Re-enable pointer events for active UI elements */
}
</style>

<style scoped>
/* ---- 全屏壳（background 由 :style 动态控制，不在此写死） ---- */
.game-shell {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 三栏区域 */
.game-body {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr 200px;
  min-height: 0;
  overflow: hidden;
}

.col-left,
.col-center,
.col-right {
  height: 100%;
  overflow: hidden;
}

/* ---- 进入按钮（修改为居中且加大面积） ---- */
.enter-btn {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 8888;
  /* 扩大可点击面积 */
  padding: 18px 36px;
  font-size: 24px;
  background: #1a2535;
  border: 1px solid #3a5a8a;
  border-radius: 6px;
  color: #7ab;
  cursor: pointer;
}
.enter-btn:hover { background: #253545; }

/* ---- 过渡动画 ---- */
.ui-fade-enter-active, .ui-fade-leave-active { transition: opacity 0.3s ease; }
.ui-fade-enter-from,  .ui-fade-leave-to      { opacity: 0; }
</style>