<template>
  <div
    class="event-log-root"
    ref="rootRef"
    @wheel.prevent="handleWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @contextmenu.prevent
  >
    <!-- Summary Detail Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="summaryModalVisible" class="summary-modal-overlay" @click.self="summaryModalVisible = false">
          <div class="summary-modal-window">
            <div class="summary-modal-header">
              <span>总结内容 — 楼层 L{{ summaryModalNode?.layer }}</span>
              <button class="summary-modal-close" @click="summaryModalVisible = false">✕</button>
            </div>
            <div class="summary-modal-body">{{ summaryModalContent }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Zoom slider -->
    <div class="zoom-control">
      <div class="zoom-track" ref="zoomTrackRef" @mousedown="onZoomTrackClick">
        <div class="zoom-fill" :style="{ height: zoomSliderPercent + '%' }"></div>
        <div class="zoom-thumb" :style="{ bottom: zoomSliderPercent + '%' }"
          @mousedown.stop="onZoomThumbMouseDown"></div>
      </div>
      <span class="zoom-label">{{ Math.round(zoomPercent) }}%</span>
    </div>

    <!-- Canvas (panned + zoomed) -->
    <div class="log-canvas" :style="canvasStyle">
      <!-- SVG connection layer -->
      <svg class="connections-svg" :style="svgStyle" v-if="layoutNodes.length > 0">
        <defs>
          <marker id="arrowhead" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <polygon points="0 0, 5 2.5, 0 5" fill="#4a7a94" />
          </marker>
          <marker id="arrowhead-active" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
            <polygon points="0 0, 5 2.5, 0 5" fill="#7eb8ff" />
          </marker>
        </defs>
        <line v-for="conn in connectionLines" :key="conn.id"
          :x1="conn.x1" :y1="conn.y1" :x2="conn.x2" :y2="conn.y2"
          :class="conn.active ? 'conn-line-active' : 'conn-line'" />
      </svg>

      <!-- Nodes -->
      <div class="nodes-layer">
        <TransitionGroup name="node-enter">
          <div v-for="ln in layoutNodes" :key="ln.node.id"
            class="event-node"
            :class="{
              'is-active': ln.node.id === tree.activeNodeId,
              'is-on-path': ln.onActivePath,
              'is-latest': ln.isLatest,
              'is-summarized': ln.node.isSummarized,
              'is-user-node': ln.node.type === 'user',
              'is-assistant-node': ln.node.type === 'assistant',
              'is-hovered': hoveredNodeId === ln.node.id,
              'is-expanded': expandedNodeId === ln.node.id,
            }"
            :style="{ left: ln.x + 'px', top: ln.y + 'px' }"
            @click.stop="onNodeClick(ln.node.id)"
            @mouseenter="hoveredNodeId = ln.node.id"
            @mouseleave="onNodeLeave(ln.node.id)"
          >
            <div class="node-info">
              <span class="node-layer">
                L{{ ln.node.layer }}
                <span class="node-role-tag" :class="'role-' + ln.node.type">{{ roleLabel(ln.node.type) }}</span>
              </span>
              <span v-if="ln.isLatest" class="latest-badge">最新</span>
              <span class="node-tokens">
                <span class="tok-in">in:{{ fmtTok(ln.node.inputTokens) }}</span>
                <span class="tok-out">out:{{ fmtTok(ln.node.outputTokens) }}</span>
              </span>
            </div>

            <div v-if="ln.node.isSummarized" class="summarized-badge" @click.stop="openSummary(ln.node)" title="查看总结">
              📄 已总结
            </div>

            <button v-if="hoveredNodeId === ln.node.id && expandedNodeId !== ln.node.id"
              class="hover-trigger" @click.stop="expandedNodeId = ln.node.id" title="操作">
              ☰
            </button>

            <Transition name="actions-pop">
              <div v-if="expandedNodeId === ln.node.id" class="action-buttons">
                <button class="act-btn act-delete" @click.stop="deleteNode(ln.node.id)" title="删除此节点及后续">✕</button>
                <button class="act-btn act-summarize" @click.stop="summarizeNode(ln.node.id)"
                  :disabled="ln.node.isSummarized || summarizingNodeId === ln.node.id"
                  :title="ln.node.isSummarized ? '已总结' : '总结到此节点'">
                  <span v-if="summarizingNodeId === ln.node.id" class="spinner">⟳</span>
                  <span v-else>📄</span>
                </button>
                <button class="act-btn act-other" @click.stop title="其他（待扩展）">⋯</button>
              </div>
            </Transition>
          </div>
        </TransitionGroup>

        <div v-if="layoutNodes.length === 0" class="nodes-empty">
          <p>暂无剧情记录</p>
          <p class="sub">AI 回复后，节点将出现在这里</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useConversationTreeStore, type TreeNode } from '../stores/conversationTree'

const tree = useConversationTreeStore()

// ===================== Reactive state =====================
const hoveredNodeId = ref<string | null>(null)
const expandedNodeId = ref<string | null>(null)
const summarizingNodeId = ref<string | null>(null)

const summaryModalVisible = ref(false)
const summaryModalNode = ref<TreeNode | null>(null)
const summaryModalContent = ref('')

// ===================== Pan & Zoom =====================
const rootRef = ref<HTMLElement | null>(null)
const zoomTrackRef = ref<HTMLElement | null>(null)

const zoomPercent = ref(100)
const zoomLevel = computed(() => zoomPercent.value / 100)

const panX = ref(0)
const panY = ref(0)

interface PanDrag { startX: number; startY: number; startPanX: number; startPanY: number }
let panDrag: PanDrag | null = null
const isDragging = ref(false)

const canvasStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoomLevel.value})`,
  transformOrigin: '0 0',
}))

// ===================== Tree layout =====================
const H_GAP = 220 // horizontal gap between branches
const V_GAP = 90  // vertical gap between layers
const NODE_W = 220 // approximate node width for SVG centering

interface LayoutEntry {
  node: TreeNode
  x: number; y: number
  onActivePath: boolean
  isLatest: boolean
}

const layoutNodes = ref<LayoutEntry[]>([])

function computeLayout(): LayoutEntry[] {
  if (!tree.rootId || tree.nodes.length === 0) return []

  const activePathIds = new Set(tree.activePath.map(n => n.id))
  const entries: LayoutEntry[] = []

  function layout(nodeId: string, x: number, depth: number): number {
    const node = tree.nodeMap.get(nodeId)
    if (!node) return x

    entries.push({
      node,
      x: x * H_GAP + 20,
      y: depth * V_GAP + 20,
      onActivePath: activePathIds.has(nodeId),
      isLatest: nodeId === tree.activeNodeId && nodeId !== tree.rootId,
    })

    const children = tree.childrenMap.get(nodeId) || []
    if (children.length === 0) return x

    // Sort: active-path child first, then by timestamp
    const sorted = [...children].sort((a, b) => {
      if (activePathIds.has(a) && !activePathIds.has(b)) return -1
      if (!activePathIds.has(a) && activePathIds.has(b)) return 1
      return 0
    })

    // First child keeps same x, rest branch right
    let nextX = x
    for (let i = 0; i < sorted.length; i++) {
      nextX = layout(sorted[i], nextX, depth + 1)
      if (i === 0 && sorted.length > 1) nextX = Math.max(nextX, x + 1)
    }
    return nextX
  }

  layout(tree.rootId, 0, 0)
  return entries
}

// ===================== SVG connection lines =====================
interface ConnLine {
  id: string; x1: number; y1: number; x2: number; y2: number; active: boolean
}

const connectionLines = computed<ConnLine[]>(() => {
  const lines: ConnLine[] = []
  const activePathIds = new Set(tree.activePath.map(n => n.id))
  const layoutMap = new Map(layoutNodes.value.map(e => [e.node.id, e]))

  for (const entry of layoutNodes.value) {
    const parentId = entry.node.parentId
    if (!parentId) continue
    const parentEntry = layoutMap.get(parentId)
    if (!parentEntry) continue

    const onPath = activePathIds.has(entry.node.id) && activePathIds.has(parentId)
    lines.push({
      id: `${parentId}->${entry.node.id}`,
      x1: parentEntry.x + NODE_W / 2,
      y1: parentEntry.y + 56, // approximate node height
      x2: entry.x + NODE_W / 2,
      y2: entry.y,
      active: onPath,
    })
  }
  return lines
})

const svgStyle = computed(() => {
  if (layoutNodes.value.length === 0) return { width: '0', height: '0' }
  const maxX = Math.max(...layoutNodes.value.map(e => e.x)) + NODE_W + 40
  const maxY = Math.max(...layoutNodes.value.map(e => e.y)) + 80
  return { width: maxX + 'px', height: maxY + 'px' }
})

// ===================== Helpers =====================
function fmtTok(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const zoomSliderPercent = computed(() =>
  ((zoomPercent.value - 25) / (200 - 25)) * 100
)

function roleLabel(type: string): string {
  if (type === 'user') return 'User'
  if (type === 'assistant') return 'Assistant'
  return ''
}

// ===================== Sync layout when tree changes =====================
watch(
  () => [tree.nodes.length, tree.activeNodeId, tree.rootId] as const,
  () => {
    layoutNodes.value = computeLayout()
  },
  { immediate: true, deep: false },
)

// ===================== Pan =====================
function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('.event-node') || target.closest('button') || target.closest('.action-buttons')) return
  panDrag = { startX: e.clientX, startY: e.clientY, startPanX: panX.value, startPanY: panY.value }
}

function onMouseMove(e: MouseEvent) {
  if (!panDrag) return
  const dx = e.clientX - panDrag.startX
  const dy = e.clientY - panDrag.startY
  if (!isDragging.value && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) isDragging.value = true
  if (isDragging.value) {
    panX.value = panDrag.startPanX + dx
    panY.value = panDrag.startPanY + dy
  }
}

function onMouseUp() { panDrag = null; isDragging.value = false }

// ===================== Zoom =====================
function handleWheel(e: WheelEvent) {
  const root = rootRef.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const oldZoom = zoomLevel.value
  const delta = e.deltaY > 0 ? -10 : 10
  zoomPercent.value = Math.max(25, Math.min(200, zoomPercent.value + delta))
  const newZoom = zoomLevel.value
  if (oldZoom === newZoom) return
  panX.value = cx - (cx - panX.value) * (newZoom / oldZoom)
  panY.value = cy - (cy - panY.value) * (newZoom / oldZoom)
}

function onZoomTrackClick(e: MouseEvent) {
  const track = zoomTrackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const fraction = 1 - (e.clientY - rect.top) / rect.height
  zoomPercent.value = Math.round(Math.max(25, Math.min(200, 25 + fraction * (200 - 25))))
}

function onZoomThumbMouseDown(e: MouseEvent) {
  const onMove = (ev: MouseEvent) => {
    const track = zoomTrackRef.value
    if (!track) return
    const rect = track.getBoundingClientRect()
    const fraction = 1 - (ev.clientY - rect.top) / rect.height
    zoomPercent.value = Math.round(Math.max(25, Math.min(200, 25 + fraction * (200 - 25))))
  }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  e.preventDefault()
}

// ===================== Node actions =====================
function onNodeClick(id: string) {
  if (summarizingNodeId.value === id) return
  tree.setActiveNode(id)
  expandedNodeId.value = null
}

function onNodeLeave(_nodeId: string) { hoveredNodeId.value = null }

function deleteNode(id: string) {
  if (id === tree.rootId) return
  tree.deleteSubtree(id)
  expandedNodeId.value = null
}

async function summarizeNode(id: string) {
  const node = tree.nodeMap.get(id)
  if (!node || node.isSummarized) return
  summarizingNodeId.value = id
  expandedNodeId.value = null
  // TODO: bridge — send summarization request to LLM via SillyTavern
  await new Promise(r => setTimeout(r, 1500))
  await tree.summarizeNode(id)
  summarizingNodeId.value = null
}

function openSummary(node: TreeNode) {
  summaryModalNode.value = node
  summaryModalContent.value = node.summaryContent
  summaryModalVisible.value = true
}

// Collapse action buttons on outside click
function handleGlobalClick(e: MouseEvent) {
  if (expandedNodeId.value !== null) {
    if (!(e.target as HTMLElement).closest('.event-node')) expandedNodeId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  if (tree.nodes.length > 0) layoutNodes.value = computeLayout()
})

onUnmounted(() => { document.removeEventListener('click', handleGlobalClick) })
</script>

<style scoped>
.event-log-root {
  width: 100%; height: 100%;
  position: relative; overflow: hidden;
  background: #0b0b16; cursor: default;
}

/* Canvas */
.log-canvas {
  position: absolute; top: 0; left: 0;
  width: 0; height: 0;
  will-change: transform;
}

/* SVG connections */
.connections-svg {
  position: absolute; top: 0; left: 0;
  pointer-events: none; z-index: 0;
}
.conn-line {
  stroke: #2a3a4a; stroke-width: 1.5;
}
.conn-line-active {
  stroke: #7eb8ff; stroke-width: 2.5;
  filter: drop-shadow(0 0 3px rgba(126, 184, 255, 0.4));
}

/* Nodes layer */
.nodes-layer {
  position: relative;
}

/* Single node */
.event-node {
  position: absolute;
  width: 200px; min-height: 52px;
  padding: 8px 12px;
  background: rgba(20, 22, 38, 0.88);
  border: 1px solid #2a3550;
  border-radius: 6px;
  cursor: pointer;
  display: flex; flex-direction: column; gap: 4px;
  transition: border-color 0.25s, box-shadow 0.25s, background 0.25s, opacity 0.3s;
  user-select: none;
  z-index: 1;
}
.event-node:hover {
  border-color: #4a6a8a;
  box-shadow: 0 0 12px rgba(60, 100, 160, 0.25);
}

/* User vs Assistant colour differentiation */
.event-node.is-user-node {
  background: rgba(30, 24, 20, 0.88);
  border-color: #4a352a;
}
.event-node.is-user-node:hover {
  border-color: #8a6a4a;
  box-shadow: 0 0 12px rgba(180, 130, 60, 0.25);
}
.event-node.is-assistant-node {
  background: rgba(20, 22, 38, 0.88);
  border-color: #2a3550;
}
.event-node.is-assistant-node:hover {
  border-color: #4a6a8a;
  box-shadow: 0 0 12px rgba(60, 100, 160, 0.25);
}

/* Active / on-path / latest overrides work on top of type colours */
.event-node.is-active {
  border-color: #5a8ab0;
  box-shadow: 0 0 16px rgba(74, 130, 180, 0.35);
  background: rgba(24, 28, 48, 0.92);
}
.event-node.is-user-node.is-active {
  border-color: #c8a060;
  box-shadow: 0 0 16px rgba(200, 160, 96, 0.35);
  background: rgba(38, 30, 22, 0.92);
}
.event-node.is-on-path {
  border-color: #3a5a7a;
}
.event-node.is-latest {
  border-color: #7eb8ff;
  box-shadow: 0 0 18px rgba(126, 184, 255, 0.4);
}
.event-node.is-summarized {
  border-style: dashed;
  border-color: #4a6a50;
}
/* Dim nodes NOT on the active path */
.event-node:not(.is-on-path):not(.is-active) {
  opacity: 0.45;
}
.event-node:not(.is-on-path):not(.is-active):hover {
  opacity: 0.75;
}

/* Node info */
.node-info {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.node-layer {
  font-size: 13px; font-weight: 700; color: #8ab; white-space: nowrap;
}
.node-role-tag {
  display: inline-block;
  font-size: 9px; font-weight: 600;
  padding: 0px 5px; border-radius: 3px;
  margin-left: 4px;
  vertical-align: middle;
}
.role-user {
  color: #dba860;
  background: rgba(200, 140, 60, 0.15);
  border: 1px solid rgba(180, 120, 40, 0.3);
}
.role-assistant {
  color: #7eb8ff;
  background: rgba(100, 160, 220, 0.12);
  border: 1px solid rgba(100, 140, 200, 0.25);
}
.latest-badge {
  font-size: 9px; font-weight: 600;
  color: #fff; background: #4a8ac0;
  padding: 1px 5px; border-radius: 3px;
  white-space: nowrap;
}
.node-tokens {
  display: flex; gap: 5px; font-size: 9px; color: #556; margin-left: auto;
}
.tok-in  { color: #688; }
.tok-out { color: #866; }

/* Summarized badge */
.summarized-badge {
  font-size: 10px; color: #6a9; cursor: pointer; text-align: center; padding: 1px 0;
}
.summarized-badge:hover { color: #8cb; text-decoration: underline; }

/* Hover trigger */
.hover-trigger {
  position: absolute; top: -8px; right: -8px;
  width: 20px; height: 20px; border-radius: 4px;
  background: #2a3550; border: 1px solid #4a6a8a;
  color: #aac; font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s; z-index: 5;
}
.hover-trigger:hover { background: #3a5070; }

/* Action buttons */
.action-buttons {
  position: absolute; top: -8px; right: -8px;
  display: flex; gap: 3px; z-index: 5;
}
.act-btn {
  width: 20px; height: 20px; border-radius: 4px; border: 1px solid #444;
  font-size: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; background: #1a2235; color: #ccc;
}
.act-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.act-delete { border-color: #633; color: #f88; }
.act-delete:hover:not(:disabled) { background: #422; border-color: #844; }
.act-summarize { border-color: #365; color: #8c8; }
.act-summarize:hover:not(:disabled) { background: #243; border-color: #486; }
.act-other { border-color: #445; color: #aac; }
.act-other:hover { background: #2a3040; border-color: #667; }

/* Actions pop transition */
.actions-pop-enter-active { transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
.actions-pop-leave-active { transition: all 0.15s ease-in; }
.actions-pop-enter-from, .actions-pop-leave-to { opacity: 0; transform: scale(0.6); }

/* Spinner */
.spinner { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Zoom control */
.zoom-control {
  position: absolute; bottom: 12px; right: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  z-index: 20;
  background: rgba(15, 15, 30, 0.88); border: 1px solid #2a3550;
  border-radius: 8px; padding: 10px 8px; backdrop-filter: blur(6px);
}
.zoom-track {
  position: relative; width: 6px; height: 120px;
  background: #1a2235; border-radius: 3px; cursor: pointer; overflow: hidden;
}
.zoom-fill {
  position: absolute; bottom: 0; left: 0; width: 100%;
  background: linear-gradient(to top, #4a7a94, #2a4a6a);
  border-radius: 3px; transition: height 0.12s ease;
}
.zoom-thumb {
  position: absolute; left: -5px; width: 16px; height: 16px;
  background: #5a8ab0; border: 1px solid #8ab; border-radius: 50%;
  cursor: grab; transform: translateY(50%); transition: box-shadow 0.2s;
}
.zoom-thumb:hover { box-shadow: 0 0 6px rgba(90, 130, 180, 0.6); }
.zoom-thumb:active { cursor: grabbing; }
.zoom-label { font-size: 10px; color: #667; white-space: nowrap; }

/* Node enter/leave transition */
.node-enter-enter-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.node-enter-leave-active { transition: all 0.2s ease-in; }
.node-enter-enter-from { opacity: 0; transform: scale(0.8); }
.node-enter-leave-to { opacity: 0; transform: scale(0.8); }
.node-enter-move { transition: transform 0.3s ease; }

/* Empty state */
.nodes-empty { color: #445; text-align: center; padding: 60px 20px; }
.nodes-empty p { margin: 0; font-size: 13px; }
.nodes-empty .sub { font-size: 11px; margin-top: 6px; color: #334; }
</style>

<!-- Non‑scoped: summary modal -->
<style>
.summary-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 99999;
}
.summary-modal-window {
  background: #101020; border: 1px solid #3a5070; border-radius: 8px;
  width: 480px; max-width: 90vw; max-height: 70vh;
  display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
.summary-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #222; font-size: 14px; color: #aac;
}
.summary-modal-close { background: none; border: none; color: #666; font-size: 18px; cursor: pointer; }
.summary-modal-close:hover { color: #f88; }
.summary-modal-body {
  flex: 1; overflow-y: auto; padding: 16px;
  font-size: 13px; color: #ccc; line-height: 1.7; white-space: pre-wrap;
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
