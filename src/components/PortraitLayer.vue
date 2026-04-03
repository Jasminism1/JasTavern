<template>
  <!-- ============================================================
    PortraitLayer.vue
    左侧角色立绘 / Live2D 占位区
      - 上部大框：展示立绘图片 或 Live2D canvas（待接入）
      - 底部按钮条：切换模式、表情、动作等控制
  ============================================================ -->
  <section class="portrait-layer">

    <!-- 立绘展示区 -->
    <div class="portrait-frame">

      <!-- 模式：静态立绘 -->
      <template v-if="mode === 'image'">
        <img
          v-if="currentPortrait"
          :src="currentPortrait"
          class="portrait-img"
          alt="角色立绘"
        />
        <div v-else class="portrait-placeholder">
          <span>立绘区域</span>
          <small>（未设置图片）</small>
        </div>
      </template>

      <!-- 模式：Live2D（待接入） -->
      <template v-else-if="mode === 'live2d'">
        <div class="live2d-placeholder">
          <!-- 后续在此创建 canvas 并初始化 pixi-live2d-display -->
          <canvas ref="live2dCanvas" class="live2d-canvas" />
          <div class="live2d-hint" v-if="!live2dLoaded">
            Live2D 容器就绪<br/>
            <small>（调用 initLive2D() 后加载模型）</small>
          </div>
        </div>
      </template>

    </div>

    <!-- 底部控制栏 -->
    <div class="portrait-controls">
      <!-- 切换立绘/Live2D 模式（逻辑后续接入） -->
      <button
        class="ctrl-btn"
        :class="{ active: mode === 'image' }"
        @click="mode = 'image'"
      >图片</button>

      <button
        class="ctrl-btn"
        :class="{ active: mode === 'live2d' }"
        @click="mode = 'live2d'"
      >Live2D</button>

      <!-- 占位按钮（后续绑定表情/动作切换逻辑） -->
      <button class="ctrl-btn" @click="onExpressionBtn" title="切换表情（待实现）">
        😊
      </button>

      <button class="ctrl-btn" @click="onMotionBtn" title="播放动作（待实现）">
        ▶
      </button>
    </div>

  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 当前显示模式
const mode = ref<'image' | 'live2d'>('image')

// 当前立绘路径（由外部通过 v-model 或 props 传入，后续接 store）
const currentPortrait = ref<string>('')

// Live2D 相关
const live2dCanvas = ref<HTMLCanvasElement | null>(null)
const live2dLoaded  = ref(false)

// ---- 预留接口（后续填充真实逻辑） ----

/**
 * 初始化 Live2D
 * 后续在此调用 pixi-live2d-display 加载 .moc3 模型
 */
function initLive2D(modelPath: string) {
  console.log('[PortraitLayer] initLive2D 待实现，模型路径：', modelPath)
  // TODO: 创建 PIXI Application，加载模型，挂载到 live2dCanvas
}

/** 切换表情 */
function setExpression(name: string) {
  console.log('[PortraitLayer] setExpression 待实现：', name)
}

/** 播放动作 */
function playMotion(group: string, index = 0) {
  console.log('[PortraitLayer] playMotion 待实现：', group, index)
}

/** 按钮占位 handler */
function onExpressionBtn() { console.log('表情切换（待实现）') }
function onMotionBtn()     { console.log('动作播放（待实现）') }

// 暴露接口给父组件
defineExpose({ initLive2D, setExpression, playMotion, mode, currentPortrait })
</script>

<style scoped>
.portrait-layer {
  display: flex;
  flex-direction: column;
  /* 1. 宽高比1:2 + 适当减少高度，避免重叠 */
  width: 200px; /* 基础宽度 */
  height: calc(200px * 2 * 0.85); /* 宽高比1:2 基础上减少15%高度 */
  /* 2. 下拉位置，避免与对话区域重叠 */
  position: absolute;
  top: 80px; /* 下拉80px，避开顶部导航栏和对话区上沿 */
  left: 70px; /* 保持与浏览器左边界间距 */
  /* 保留明显圆角 */
  border-radius: 16px;
  overflow: hidden;
  /* 凸显立绘边框 */
  border: 3px solid #2a4a8a;
  box-shadow: 
    0 0 0 2px rgba(42, 74, 138, 0.6),
    0 0 10px rgba(42, 74, 138, 0.4);
  background: #0f0f1a;
  z-index: 10;
}

.portrait-frame {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 2px solid #1e3e6e;
  background: #0a0a14;
}

.portrait-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: bottom;
  padding: 8px;
}

.portrait-placeholder,
.live2d-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #555;
  font-size: 14px;
  border: 2px dashed #2a2a3e;
  padding: 16px;
}

.portrait-placeholder small,
.live2d-hint small {
  font-size: 11px;
  color: #3a3a5a;
  margin-top: 6px;
  text-align: center;
}

.live2d-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.live2d-hint {
  position: relative;
  z-index: 1;
  text-align: center;
  color: #444;
  font-size: 13px;
}

/* 底部控制按钮样式保留不变 */
.ctrl-btn {
  position: relative;
  flex: 1;
  padding: 5px;
  background: #1e1e2e;
  color: #aaa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
  
  border: 1px solid rgba(100, 120, 200, 0.4);
  box-shadow: 
    0 0 0 1px rgba(80, 100, 180, 0.3),
    0 0 0 2px rgba(60, 80, 150, 0.2);
}

.ctrl-btn:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 0 0 1px rgba(130, 160, 255, 0.5),
    0 0 0 2px rgba(100, 130, 220, 0.6),
    0 3px 6px rgba(100, 120, 255, 0.2);
  
  border-color: rgba(140, 160, 255, 0.7);
  background: linear-gradient(to bottom, #282840, #1c1c2c);
  color: #ddd;
  text-shadow: 0 0 4px rgba(180, 200, 255, 0.6);
}

.ctrl-btn.active {
  transform: none;
  background: linear-gradient(to bottom, #34345a, #28284a);
  box-shadow: 
    0 0 0 1px rgba(150, 180, 255, 0.7),
    0 0 0 2px rgba(110, 140, 230, 0.8);
  border-color: rgba(160, 180, 255, 0.9);
  color: #fff;
  text-shadow: 0 0 6px rgba(200, 220, 255, 0.8);
}

/* 控制栏样式微调 */
.portrait-controls {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #222;
  background: #111;
  flex-shrink: 0;
  border-radius: 0 0 13px 13px;
}
</style>