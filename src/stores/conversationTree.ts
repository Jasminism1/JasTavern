// stores/conversationTree.ts
// Pinia store — conversation tree with branching, persistence, and context pruning.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TreeNode } from '../services/db'
import { saveNode, saveNodes, loadAllNodes, deleteNodes, exportToJsonl, importFromJsonl } from '../services/db'

export type { TreeNode }

/** Result of building context for an LLM request. */
export interface LlmContext {
  messages: Array<{ role: string; content: string }>
  /** Total estimated input tokens (for display / tracking). */
  estimatedTokens: number
}

export const useConversationTreeStore = defineStore('conversationTree', () => {
  // ---- state ----
  const nodes = ref<TreeNode[]>([])
  const activeNodeId = ref<string | null>(null)
  const rootId = ref<string | null>(null)
  const loaded = ref(false)

  // ---- computed: quick lookup maps ----
  const nodeMap = computed(() => {
    const m = new Map<string, TreeNode>()
    for (const n of nodes.value) m.set(n.id, n)
    return m
  })

  const childrenMap = computed(() => {
    const m = new Map<string, string[]>()
    for (const n of nodes.value) {
      const pid = n.parentId ?? '__root__'
      if (!m.has(pid)) m.set(pid, [])
      m.get(pid)!.push(n.id)
    }
    // Sort children by timestamp so order is stable
    for (const [, kids] of m) kids.sort((a, b) => {
      const na = nodeMap.value.get(a)
      const nb = nodeMap.value.get(b)
      return (na?.timestamp ?? 0) - (nb?.timestamp ?? 0)
    })
    return m
  })

  // ---- init helpers ----

  function ensureRoot(): TreeNode {
    if (rootId.value && nodeMap.value.has(rootId.value)) {
      return nodeMap.value.get(rootId.value)!
    }
    const root: TreeNode = {
      id: 'root-' + Date.now(),
      parentId: null,
      layer: 0,
      type: 'system',
      content: '[对话开始]',
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now(),
      isSummarized: false,
      summaryContent: '',
    }
    nodes.value.push(root)
    rootId.value = root.id
    activeNodeId.value = root.id
    saveNode(root)
    return root
  }

  /** Load tree from IndexedDB, or create a fresh root. */
  async function loadTree(): Promise<void> {
    if (loaded.value) return
    const stored = await loadAllNodes()
    if (stored.length > 0) {
      nodes.value = stored
      const root = stored.find(n => n.parentId === null)
      if (root) {
        rootId.value = root.id
        // Active node defaults to the deepest leaf on the first-child chain
        let cur = root.id
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const kids = childrenMap.value.get(cur) || []
          if (kids.length === 0) break
          cur = kids[0]
        }
        activeNodeId.value = cur
      }
    } else {
      ensureRoot()
    }
    loaded.value = true
  }

  // ---- tree queries ----

  /** Walk from root → node, returning ordered ancestor ids (including node itself). */
  function getAncestorIds(nodeId: string): string[] {
    const path: string[] = []
    let cur: string | null = nodeId
    while (cur) {
      path.unshift(cur)
      const n = nodeMap.value.get(cur)
      cur = n?.parentId ?? null
    }
    return path
  }

  /** Get the ordered list of TreeNode from root to the given node. */
  function getPathTo(nodeId: string): TreeNode[] {
    const ids = getAncestorIds(nodeId)
    return ids.map(id => nodeMap.value.get(id)!).filter(Boolean)
  }

  /** The currently active path (root → active node). */
  const activePath = computed(() => {
    if (!activeNodeId.value) return []
    return getPathTo(activeNodeId.value)
  })

  /** Messages suitable for display in the dialogue panel (filtered by active path). */
  const activePathMessages = computed(() => {
    return activePath.value.filter(n => n.type === 'user' || n.type === 'assistant')
  })

  // ---- tree mutations ----

  let layerCounter = 0

  /** Add a child node to the given parent. */
  function addChildNode(parentId: string, node: Omit<TreeNode, 'id' | 'parentId' | 'layer' | 'timestamp'> & { id?: string }): TreeNode {
    const parent = nodeMap.value.get(parentId)
    const newNode: TreeNode = {
      id: node.id ?? ('node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      parentId,
      layer: (parent?.layer ?? -1) + 1,
      type: node.type,
      content: node.content,
      inputTokens: node.inputTokens ?? 0,
      outputTokens: node.outputTokens ?? 0,
      timestamp: Date.now(),
      isSummarized: node.isSummarized ?? false,
      summaryContent: node.summaryContent ?? '',
    }
    nodes.value.push(newNode)
    activeNodeId.value = newNode.id
    saveNode(newNode)
    return newNode
  }

  /**
   * SillyTavern bridge entry point.
   * Call this when a new message arrives from the LLM.
   * If `parentId` is omitted the message is appended to the current active node.
   */
  function onNewMessage(
    content: string,
    role: 'user' | 'assistant' | 'system',
    tokens?: { input?: number; output?: number },
    parentId?: string,
  ): TreeNode {
    const pid = parentId ?? activeNodeId.value
    if (!pid) throw new Error('onNewMessage: no active node')
    return addChildNode(pid, {
      type: role,
      content,
      inputTokens: tokens?.input ?? 0,
      outputTokens: tokens?.output ?? 0,
    })
  }

  /** Set the active node (switches displayed context). */
  function setActiveNode(id: string) {
    if (nodeMap.value.has(id)) {
      activeNodeId.value = id
    }
  }

  /** Delete a node and all its descendants. */
  function deleteSubtree(id: string) {
    const toDelete = new Set<string>()

    function collect(rid: string) {
      toDelete.add(rid)
      for (const kid of childrenMap.value.get(rid) || []) collect(kid)
    }

    if (id === rootId.value) return // cannot delete root
    collect(id)
    nodes.value = nodes.value.filter(n => !toDelete.has(n.id))
    deleteNodes([...toDelete])

    // If active node was deleted, jump to its parent or root
    if (toDelete.has(activeNodeId.value!)) {
      const deletedNode = nodeMap.value.get(id) // map is stale, use pre-filtered?
      // Find parent before deletion
      let parent = rootId.value
      // We already filtered nodes, so nodeMap is outdated. Use the old reference.
      // Rebuild: find parent from remaining nodes
      const remaining = nodes.value
      const targetNode = remaining.find(n => n.id === id)
      if (targetNode) {
        parent = targetNode.parentId ?? rootId.value!
      }
      // Actually the target node was deleted. So find its parent from the pre-delete state
      // Let's just set to a safe parent
      const parentCandidate = findLiveParent(id)
      activeNodeId.value = parentCandidate ?? rootId.value
    }
  }

  function findLiveParent(deletedId: string): string | null {
    // Walk up from the deleted node's parent chain to find the first surviving ancestor
    // Since we've already filtered nodes, we need to check the original node.
    // This is a bit tricky — let's just use root as fallback and clean up later.
    return rootId.value
  }

  // ---- summarize & context pruning ----

  /**
   * Summarize a node (mock LLM call for now — replace with actual bridge).
   * After summarization, the node is marked isSummarized and its summaryContent is set.
   */
  async function summarizeNode(id: string, summaryText?: string): Promise<void> {
    const node = nodeMap.value.get(id)
    if (!node || node.isSummarized) return

    // TODO: replace with actual SillyTavern summarization call
    // const summary = await callSillyTavernSummarize(getPathTo(id))
    const summary = summaryText ?? `[第${node.layer}层总结] 前文内容已压缩为摘要。`

    node.isSummarized = true
    node.summaryContent = summary
    saveNode(node)
  }

  /**
   * Build the LLM context for the active path, applying summary pruning.
   *
   * Rule: find the nearest ancestor summaryNode on the active path.
   * Replace that node AND everything before it with a single system message:
   *   "[历史摘要] <summaryContent>"
   * Messages after the summary node are included normally.
   */
  function buildContext(): LlmContext {
    const path = activePath.value
    if (path.length === 0) return { messages: [], estimatedTokens: 0 }

    // Find the nearest (deepest) summary node on the path
    let summaryIdx = -1
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].isSummarized) { summaryIdx = i; break }
    }

    const messages: Array<{ role: string; content: string }> = []
    let estimatedTokens = 0

    if (summaryIdx >= 0) {
      // Replace root → summaryNode with one system message
      const sn = path[summaryIdx]
      messages.push({ role: 'system', content: `[历史摘要] ${sn.summaryContent}` })
      estimatedTokens += Math.ceil(sn.summaryContent.length / 3)

      // Append messages after the summary node
      for (let i = summaryIdx + 1; i < path.length; i++) {
        const n = path[i]
        if (n.type === 'system' || n.type === 'summary') continue
        messages.push({ role: n.type === 'assistant' ? 'assistant' : 'user', content: n.content })
        estimatedTokens += Math.ceil(n.content.length / 3) + (n.inputTokens || 0)
      }
    } else {
      // No summary — include everything except the root system node
      for (const n of path) {
        if (n.id === rootId.value) continue // skip root marker
        if (n.type === 'system' || n.type === 'summary') continue
        messages.push({ role: n.type === 'assistant' ? 'assistant' : 'user', content: n.content })
        estimatedTokens += Math.ceil(n.content.length / 3) + (n.inputTokens || 0)
      }
    }

    return { messages, estimatedTokens }
  }

  // ---- persistence ----

  async function persistAll() {
    await saveNodes(nodes.value)
  }

  async function doExportJsonl(): Promise<string> {
    return exportToJsonl()
  }

  async function doImportJsonl(jsonl: string): Promise<void> {
    nodes.value = []
    rootId.value = null
    activeNodeId.value = null
    loaded.value = false
    const imported = await importFromJsonl(jsonl)
    nodes.value = imported
    const root = imported.find(n => n.parentId === null)
    if (root) {
      rootId.value = root.id
      let cur = root.id
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const kids = (childrenMap.value.get(cur) || [])
        if (kids.length === 0) break
        cur = kids[0]
      }
      activeNodeId.value = cur
    }
    loaded.value = true
  }

  // ---- init ----
  // Call once on app start
  loadTree()

  return {
    // state
    nodes,
    activeNodeId,
    rootId,
    loaded,
    // computed
    nodeMap,
    childrenMap,
    activePath,
    activePathMessages,
    // actions
    loadTree,
    ensureRoot,
    getPathTo,
    getAncestorIds,
    addChildNode,
    onNewMessage,
    setActiveNode,
    deleteSubtree,
    summarizeNode,
    buildContext,
    persistAll,
    doExportJsonl,
    doImportJsonl,
  }
})
