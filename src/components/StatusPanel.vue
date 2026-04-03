<template>
  <!-- ============================================================
    StatusPanel.vue
    右侧角色状态栏
      - 所有数据由 store.characterStatus 驱动
      - AI 每轮返回 JSON 后由 bridge 层更新 store
  ============================================================ -->
  <aside class="status-panel">

    <div class="status-section-title">角色状态</div>

    <!-- 角色基本信息 -->
    <div class="status-block">
      <div class="status-row">
        <span class="stat-label">姓名</span>
        <span class="stat-value name">{{ status.name }}</span>
      </div>
      <div class="status-row">
        <span class="stat-label">地点</span>
        <span class="stat-value">{{ status.location }}</span>
      </div>
      <div class="status-row">
        <span class="stat-label">心情</span>
        <span class="stat-value mood">{{ status.mood }}</span>
      </div>
      <div class="status-row" v-if="status.action">
        <span class="stat-label">当前</span>
        <span class="stat-value dim">{{ status.action }}</span>
      </div>
      <div class="status-row" v-if="status.outfit">
        <span class="stat-label">服装</span>
        <span class="stat-value dim">{{ status.outfit }}</span>
      </div>
    </div>

    <!-- 数值面板 -->
    <div class="status-section-title">数值</div>

    <div class="status-block">
      <!-- HP -->
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-name">HP</span>
          <span class="bar-num">{{ status.hp }}/{{ status.maxHp }}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill hp" :style="{ width: pct(status.hp, status.maxHp) }"></div>
        </div>
      </div>

      <!-- SP -->
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-name">SP</span>
          <span class="bar-num">{{ status.sp }}/{{ status.maxSp }}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill sp" :style="{ width: pct(status.sp, status.maxSp) }"></div>
        </div>
      </div>

      <!-- 好感 -->
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-name">好感</span>
          <span class="bar-num">{{ status.affection }}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill aff" :style="{ width: pct(status.affection, 100) }"></div>
        </div>
      </div>

      <!-- 压力 -->
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-name">压力</span>
          <span class="bar-num">{{ status.stress }}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill str" :style="{ width: pct(status.stress, 100) }"></div>
        </div>
      </div>
    </div>

    <!-- 预留扩展区（后续挂载好感度面板、关系列表等） -->
    <div class="status-section-title">扩展</div>
    <div class="status-block placeholder-block">
      <p>关系 / 任务 / 道具等（待扩展）</p>
    </div>

  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'

const store  = useAppStore()
const status = computed(() => store.characterStatus)

function pct(val: number, max: number): string {
  return `${Math.max(0, Math.min(100, (val / max) * 100))}%`
}
</script>

<style scoped>
.status-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  padding: 12px;
  /* 1. 尺寸与位置：右侧定位，宽高适配，避免重叠 */
  width: 200px; /* 与立绘宽度一致，视觉平衡 */
  height: calc(200px * 2 * 0.85); /* 高度适配视口，留出顶部/底部间距 */
  position: absolute;
  top: 80px;
  right: 70px;
  /* 2. 半透明 + 毛玻璃效果 */
  background: rgba(15, 15, 26, 0.85);
  backdrop-filter: blur(8px);
  /* 3. 明显圆角 + 凸显边框 */
  border-radius: 16px;
  border: 3px solid #2a4a8a;
  box-shadow: 
    0 0 0 2px rgba(42, 74, 138, 0.6),
    0 0 10px rgba(42, 74, 138, 0.4);
  /* 滚动回弹效果（与对话区一致） */
  overscroll-behavior-y: contain;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  z-index: 10;
}

/* 滚动条美化 */
.status-panel::-webkit-scrollbar {
  width: 4px;
}
.status-panel::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}
.status-panel::-webkit-scrollbar-thumb {
  background: rgba(85, 85, 119, 0.5);
  border-radius: 2px;
}

.status-section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #7788aa; /* 提亮标题色，适配半透明背景 */
  padding: 8px 0 4px;
  border-bottom: 1px solid rgba(30, 30, 48, 0.8);
  margin-bottom: 8px;
}

.status-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(18, 18, 31, 0.5);
  border-radius: 8px;
}

/* 文字行 */
.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.stat-label {
  color: #8899aa; /* 提亮标签色 */
  flex-shrink: 0;
  font-size: 11px;
  min-width: 36px;
}

.stat-value       { color: #e0e0e8; text-align: right; }
.stat-value.name  { color: #dde; font-weight: 600; text-shadow: 0 0 2px rgba(220, 220, 255, 0.3); }
.stat-value.mood  { color: #acd; text-shadow: 0 0 2px rgba(170, 205, 220, 0.3); }
.stat-value.dim   { color: #a0a0b0; font-size: 12px; }

/* 进度条（强化视觉效果） */
.bar-row { display: flex; flex-direction: column; gap: 4px; }

.bar-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}
.bar-name { color: #8899aa; text-transform: uppercase; letter-spacing: 0.06em; }
.bar-num  { color: #99aabb; font-variant-numeric: tabular-nums; }

.bar-track {
  height: 6px; /* 加高进度条，更易识别 */
  background: rgba(30, 30, 46, 0.8);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(50, 50, 80, 0.5);
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.2) inset;
}
.bar-fill.hp  { background: #e55; }
.bar-fill.sp  { background: #59b; }
.bar-fill.aff { background: #b5b; }
.bar-fill.str { background: #b95; }

/* 预留占位（适配新样式） */
.placeholder-block p {
  font-size: 12px;
  color: #8899aa;
  text-align: center;
  padding: 16px 0;
  border: 1px dashed rgba(42, 42, 62, 0.8);
  border-radius: 8px;
  background: rgba(18, 18, 31, 0.3);
  margin: 0;
}
</style>