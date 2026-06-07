// services/db.ts
// IndexedDB wrapper for conversation tree persistence.
// Supports export → jsonl (one JSON node per line) and import from jsonl.

/** Shape of a conversation tree node stored in IndexedDB. */
export interface TreeNode {
  id: string
  parentId: string | null // null = root
  layer: number           // depth from root (root = 0)
  type: 'user' | 'assistant' | 'system' | 'summary'
  content: string
  inputTokens: number
  outputTokens: number
  timestamp: number
  isSummarized: boolean
  summaryContent: string
}

// ---- internal helpers ----

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('st-ui-conversations', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('tree-nodes')) {
        db.createObjectStore('tree-nodes', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => {
    const tx = db.transaction('tree-nodes', mode)
    tx.oncomplete = () => db.close()
    return tx.objectStore('tree-nodes')
  })
}

// ---- public API ----

export async function saveNode(node: TreeNode): Promise<void> {
  const store = await withStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(node)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function saveNodes(nodes: TreeNode[]): Promise<void> {
  const store = await withStore('readwrite')
  return new Promise((resolve, reject) => {
    for (const n of nodes) store.put(n)
    // transaction complete resolves via withStore's oncomplete
    resolve()
  })
}

export async function loadAllNodes(): Promise<TreeNode[]> {
  const store = await withStore('readonly')
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as TreeNode[])
    req.onerror = () => reject(req.error)
  })
}

export async function deleteNode(id: string): Promise<void> {
  const store = await withStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function deleteNodes(ids: string[]): Promise<void> {
  const store = await withStore('readwrite')
  return new Promise((resolve, reject) => {
    for (const id of ids) store.delete(id)
    resolve()
  })
}

export async function clearAll(): Promise<void> {
  const store = await withStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ---- jsonl export / import ----

/** Serialize all nodes to a jsonl string (one JSON object per line). */
export async function exportToJsonl(): Promise<string> {
  const nodes = await loadAllNodes()
  return nodes.map(n => JSON.stringify(n)).join('\n')
}

/** Parse a jsonl string and save all nodes to IndexedDB (clears existing data first). */
export async function importFromJsonl(jsonl: string): Promise<TreeNode[]> {
  const lines = jsonl.split('\n').filter(l => l.trim())
  const nodes: TreeNode[] = lines.map((line, i) => {
    const obj = JSON.parse(line)
    if (!obj.id || obj.type === undefined) {
      throw new Error(`jsonl line ${i + 1}: missing required field (id / type)`)
    }
    return obj as TreeNode
  })
  // Validate: at most one root node (parentId = null)
  const roots = nodes.filter(n => n.parentId === null)
  if (roots.length > 1) throw new Error('jsonl contains multiple root nodes')
  await clearAll()
  await saveNodes(nodes)
  return nodes
}
