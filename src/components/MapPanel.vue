<template>
  <div class="map-panel">
    <!-- 顶部标题栏 -->
    <div class="panel-header">
      <h3>世界地图</h3>
      <div class="map-controls">
        <button @click="resetView">定位当前</button>
      </div>
    </div>

    <!-- 地图核心 SVG 容器 -->
    <div class="map-container" ref="containerRef">
      <!-- Fallback / 底图 -->
      <div class="map-bg-fallback">
        <img 
          src="../assets/worldmap/bg.png" 
          class="map-bg-img" 
          @error="onImgError" 
          alt="World Map Background" 
        />
      </div>

      <svg 
        class="map-svg" 
        ref="svgRef"
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
        @mousedown="onMouseDown"
        @wheel="onWheel"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <!-- 道路流动动画用的滤镜或蒙版 -->
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- 道路层 -->
        <g class="edges-layer">
          <path
            v-for="edge in computedEdges"
            :key="edge.id"
            :d="`M ${edge.fromNode.x} ${edge.fromNode.y} Q ${edge.controlX} ${edge.controlY} ${edge.toNode.x} ${edge.toNode.y}`"
            class="map-edge"
            :class="{ 'is-unlocked': edge.isUnlocked }"
          />
        </g>

        <!-- 节点层 -->
        <g class="nodes-layer">
          <g 
            v-for="node in nodes" 
            :key="node.id"
            class="map-node"
            :class="`status-${node.status}`"
            :transform="`translate(${node.x}, ${node.y})`"
            @click="onNodeClick(node, $event)"
          >
            <!-- 节点背光/底座 -->
            <circle class="node-base" r="14" />
            
            <!-- 主节点圆 -->
            <circle class="node-core" r="8" />

            <!-- 玩家所在位置的动态指示器 -->
            <g v-if="node.status === 'current'" class="player-indicator">
              <polygon points="0,-25 -8,-10 8,-10" />
              <circle r="20" class="pulse-ring" />
            </g>

            <!-- 节点文本 -->
            <text class="node-text" y="30" text-anchor="middle">
              {{ node.name }}
            </text>
            <!-- 节点类型小图标/文字 -->
            <text class="node-type" y="45" text-anchor="middle">
              [{{ getTypeLabel(node.type) }}]
            </text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

// ================= 类型与数据定义 =================
interface MapNode {
  id: string
  name: string
  x: number
  y: number
  type: 'city' | 'village' | 'dungeon' | 'ruins'
  status: 'current' | 'unlocked' | 'locked'
}

interface MapEdge {
  from: string
  to: string
}

const nodes = ref<MapNode[]>([
  { id: 'start', name: '起源之村', x: 200, y: 500, type: 'village', status: 'unlocked' },
  { id: 'city1', name: '阿瓦隆王都', x: 500, y: 400, type: 'city', status: 'current' },
  { id: 'dungeon1', name: '试炼洞窟', x: 350, y: 650, type: 'dungeon', status: 'unlocked' },
  { id: 'ruins1', name: '失落神庙', x: 800, y: 350, type: 'ruins', status: 'locked' },
  { id: 'city2', name: '边境堡垒', x: 600, y: 700, type: 'city', status: 'locked' },
  { id: 'ruins2', name: '龙眠高地', x: 900, y: 600, type: 'ruins', status: 'locked' },
])

const edges = ref<MapEdge[]>([
  { from: 'start', to: 'city1' },
  { from: 'start', to: 'dungeon1' },
  { from: 'city1', to: 'ruins1' },
  { from: 'city1', to: 'city2' },
  { from: 'city2', to: 'ruins2' },
])

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    city: '主城', village: '村落', dungeon: '秘境', ruins: '遗迹'
  }
  return map[type] || '未知'
}

// ================= 计算贝塞尔曲线道路 =================
const computedEdges = computed(() => {
  return edges.value.map(e => {
    const fromNode = nodes.value.find(n => n.id === e.from)
    const toNode = nodes.value.find(n => n.id === e.to)
    if (!fromNode || !toNode) return null

    const dx = toNode.x - fromNode.x
    const dy = toNode.y - fromNode.y
    const midX = fromNode.x + dx / 2
    const midY = fromNode.y + dy / 2
    
    // 计算法向量
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const px = -dy / len
    const py = dx / len
    
    // 基于节点 ID 生成一个伪随机的固定偏移方向
    const hash = (e.from.charCodeAt(0) + e.to.charCodeAt(0)) % 2 === 0 ? 1 : -1
    const offset = len * 0.25 * hash // 偏移 25% 的长度作为贝塞尔控制点
    
    // 如果两端都非锁定，则道路是激活状态（播放流动光效）
    const isUnlocked = fromNode.status !== 'locked' && toNode.status !== 'locked'

    return {
      id: `${e.from}-${e.to}`,
      fromNode,
      toNode,
      controlX: midX + px * offset,
      controlY: midY + py * offset,
      isUnlocked
    }
  }).filter(Boolean) as any[]
})

// ================= 地图拖拽与缩放交互 =================
const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const viewBox = ref({ x: 0, y: 0, w: 1200, h: 800 })

let isDragging = false
let dragStartX = 0
let dragStartY = 0
let startViewBox = { x: 0, y: 0 }
let movedDistance = 0 // 用于区分点击和拖拽

function onImgError(e: Event) {
  // 如果底图加载失败，隐藏它并露出纯 CSS 的网格渐变底色
  ;(e.target as HTMLImageElement).style.display = 'none'
}

function onMouseDown(e: MouseEvent) {
  dragStartX = e.clientX
  dragStartY = e.clientY
  isDragging = true
  movedDistance = 0
  startViewBox = { x: viewBox.value.x, y: viewBox.value.y }
  
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging || !svgRef.value) return
  
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  movedDistance += Math.abs(dx) + Math.abs(dy)
  
  // 将屏幕像素偏移转换为 SVG 坐标系偏移
  const rect = svgRef.value.getBoundingClientRect()
  const scaleX = viewBox.value.w / rect.width
  const scaleY = viewBox.value.h / rect.height
  
  viewBox.value.x = startViewBox.x - dx * scaleX
  viewBox.value.y = startViewBox.y - dy * scaleY
}

function onMouseUp() {
  isDragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

// 滚轮中心缩放
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!svgRef.value) return
  
  const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85
  const rect = svgRef.value.getBoundingClientRect()
  
  // 计算鼠标在 SVG 容器中的屏幕坐标
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  
  // 反算鼠标对应的当前真实世界坐标
  const scaleX = viewBox.value.w / rect.width
  const scaleY = viewBox.value.h / rect.height
  const worldX = viewBox.value.x + mouseX * scaleX
  const worldY = viewBox.value.y + mouseY * scaleY
  
  // 应用缩放（限制最大/最小尺寸）
  let newW = viewBox.value.w * zoomFactor
  let newH = viewBox.value.h * zoomFactor
  if (newW < 400) { newW = 400; newH = 400 * (rect.height / rect.width) }
  if (newW > 3000) { newW = 3000; newH = 3000 * (rect.height / rect.width) }
  
  // 重新计算 ViewBox 原点，使得鼠标下方的世界坐标保持不变
  const newX = worldX - mouseX * (newW / rect.width)
  const newY = worldY - mouseY * (newH / rect.height)
  
  viewBox.value = { x: newX, y: newY, w: newW, h: newH }
}

// ================= 节点点击与视图重置 =================
function onNodeClick(node: MapNode, e: MouseEvent) {
  // 如果发生过明显的拖拽，则判定为漫游，不触发点击事件
  if (movedDistance > 5) return
  
  e.stopPropagation()
  if (node.status === 'locked') {
    console.log('目标区域未解锁！')
    return
  }
  
  console.log(`前往：${node.name}`)
  // 更新当前位置 (MVP 演示逻辑)
  nodes.value.forEach(n => {
    if (n.status === 'current') n.status = 'unlocked'
  })
  node.status = 'current'
}

function resetView() {
  const current = nodes.value.find(n => n.status === 'current')
  if (current && svgRef.value) {
    const rect = svgRef.value.getBoundingClientRect()
    // 保持当前视口大小，将当前节点移到中心
    viewBox.value.x = current.x - viewBox.value.w / 2
    viewBox.value.y = current.y - viewBox.value.h / 2
  }
}

// 初次加载自动居中到玩家位置
onMounted(() => {
  if (svgRef.value && containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    viewBox.value.w = rect.width
    viewBox.value.h = rect.height
    resetView()
  }
})
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
  padding: 4px 12px;
  background: #3a5a8a;
  border: 1px solid #5a7aaa;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}
.map-controls button:hover {
  background: #4a6aaa;
  transform: translateY(-1px);
}

.map-container {
  flex: 1;
  background: #0f0f1a;
  border: 1px solid #334;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  user-select: none;
}

/* ================== 底图占位与网格 ================== */
.map-bg-fallback {
  position: absolute;
  inset: 0;
  background-color: #0d111a;
  /* 回退：星空/暗域网格渐变 */
  background-image: 
    radial-gradient(circle at center, rgba(30,40,60,0.8) 0%, rgba(10,12,20,1) 100%),
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 100% 100%, 60px 60px, 60px 60px;
  z-index: 0;
}

.map-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.8;
}

/* ================== SVG 层样式 ================== */
.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  cursor: grab;
}
.map-svg:active {
  cursor: grabbing;
}

/* ================== 道路与动画 ================== */
.map-edge {
  fill: none;
  stroke: rgba(100, 100, 120, 0.4);
  stroke-width: 3;
  stroke-dasharray: 6 6;
  transition: stroke 0.4s;
}

/* 已解锁道路的能量流动效果 */
.map-edge.is-unlocked {
  stroke: rgba(100, 200, 255, 0.6);
  stroke-width: 4;
  stroke-dasharray: 10 10;
  animation: flowLight 2s linear infinite;
  filter: url(#glow);
}

@keyframes flowLight {
  to { stroke-dashoffset: -20; }
}

/* ================== 节点与交互 ================== */
.map-node {
  cursor: pointer;
  /* FIX: 移除 transition: transform，不再对 <g> 做 CSS transform 动画，
     因为 SVG <g> 的定位依赖内联 transform="translate(x,y)"，
     CSS transform 会覆盖它导致节点跳位 → 颤动 */
}

.node-base {
  fill: rgba(0, 0, 0, 0.6);
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 2;
  transition: all 0.3s;
}

.node-core {
  fill: #fff;
  transition: fill 0.3s;
}

.node-text {
  font-size: 16px;
  fill: #eee;
  font-weight: bold;
  pointer-events: none;
  transition: fill 0.3s;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}

.node-type {
  font-size: 12px;
  fill: #aaa;
  pointer-events: none;
}

/* 状态：锁定 (更柔和的暗化) */
.map-node.status-locked {
  opacity: 0.7;
  filter: grayscale(1);
}
.map-node.status-locked .node-text {
  fill: #888;
}

/* FIX: 彻底移除 .map-node 上的 transform: scale(1.15) 规则。
   在 SVG 中，<g> 的 transform 属性承载了 translate 定位，
   CSS transform 会覆盖整个 transform，导致节点瞬间跳到原点，
   hover 丢失后又跳回，如此往复 → 颤动。
   改用子元素（.node-base / .node-core）的属性变化实现 hover 放大效果。 */
.map-node:hover:not(.status-locked) .node-base {
  r: 18;
  stroke: rgba(100, 200, 255, 0.8);
  fill: rgba(20, 50, 100, 0.8);
}
.map-node:hover:not(.status-locked) .node-core {
  r: 10;          /* FIX: 主圆也稍微放大，配合底座一起产生"放大"视觉 */
  fill: #88ccff;
}
.map-node:hover:not(.status-locked) .node-text {
  fill: #fff;
  text-shadow: 0 0 8px rgba(100, 200, 255, 0.8);
}

/* ================== 玩家位置指示器 ================== */
.player-indicator {
  fill: #ffdd44;
  pointer-events: none;
}

.player-indicator polygon {
  animation: floatArrow 1.5s ease-in-out infinite alternate;
}

.pulse-ring {
  fill: none;
  stroke: #ffdd44;
  stroke-width: 2;
  animation: pulseAnim 2s infinite;
}

@keyframes floatArrow {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}

@keyframes pulseAnim {
  0% { r: 10; opacity: 1; }
  100% { r: 35; opacity: 0; stroke-width: 0; }
}

</style>
