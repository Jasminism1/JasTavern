<template>
  <div class="map-panel">
    <!-- 顶部标题栏 -->
    <div class="panel-header">
      <h3>世界地图</h3>
      <div class="map-controls">
        <button @click="resetMap">重置视图</button>
      </div>
    </div>

    <!-- 地图主区域（核心扩展区） -->
    <div class="map-container" ref="mapRef">
      <!-- 扩展点：后续替换为真实地图/图片/Canvas -->
      <div class="map-placeholder">
        🗺️ 地图渲染区域
        <p>当前坐标：X: {{ pos.x }} | Y: {{ pos.y }}</p>
      </div>
      <!-- 扩展点：添加地图标记、NPC、传送点 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 地图坐标（可扩展为全局状态）
const pos = ref({ x: 100, y: 200 })
const mapRef = ref<HTMLDivElement | null>(null)

// 重置地图视图
function resetMap() {
  pos.value = { x: 0, y: 0 }
  console.log('地图视图已重置')
}
</script>

<style scoped>
.map-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #eee;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.map-controls button {
  padding: 4px 8px;
  background: #223;
  border: 1px solid #556;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
}
.map-controls button:hover {
  background: #334;
  color: #fff;
}

/* 地图容器（固定高度，支持滚动/拖拽） */
.map-container {
  flex: 1;
  background: #0f0f1a;
  border: 1px solid #334;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.map-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #778;
  font-size: 16px;
}
</style>