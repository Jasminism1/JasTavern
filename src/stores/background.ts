// src/stores/background.ts
// 背景状态管理
//   - 内置背景：自动扫描 src/assets/backgrounds/
//   - 用户上传：Object URL 本地临时存储
//   - 支持全屏预览 + 切换背景
import { defineStore } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface BgItem {
  id: string
  url: string           // 直接用于 background-image
  name: string
  source: 'builtin' | 'user'
}

// 自动扫描内置背景图
const builtinModules = import.meta.glob<string>(
  '../assets/backgrounds/*.{png,jpg,jpeg,webp,gif,avif}',
  { eager: true, query: '?url', import: 'default' }
)

function buildBuiltinList(): BgItem[] {
  return Object.entries(builtinModules).map(([path, url]) => {
    const name = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path
    return { id: `builtin__${name}`, url, name, source: 'builtin' }
  })
}

// 本地存储key
const LS_KEY = 'st-ui:user-backgrounds'
const LS_CURRENT = 'st-ui:current-bg'

export const useBackgroundStore = defineStore('background', () => {
  // 内置背景
  const builtinList = ref<BgItem[]>(buildBuiltinList())
  // 用户上传背景
  const userList = ref<BgItem[]>([])
  // 当前应用的背景
  const currentBg = ref<string>(localStorage.getItem(LS_CURRENT) ?? '')
  // 🔥 新增：预览状态（全屏预览）
  const previewVisible = ref(false)
  const previewBgUrl = ref('')

  // 全部背景合并
  const allBackgrounds = computed<BgItem[]>(() => [...builtinList.value, ...userList.value])

  // ---------------- Actions ----------------
  // 设置当前背景
  function setBackground(url: string) {
    currentBg.value = url
    localStorage.setItem(LS_CURRENT, url)
  }

  // 清除背景
  function clearBackground() {
    setBackground('')
  }

  // 🔥 新增：开启全屏预览
  function openPreview(url: string) {
    previewBgUrl.value = url
    previewVisible.value = true
    // 监听键盘退出预览
    const listener = (e: KeyboardEvent) => {
      closePreview()
      window.removeEventListener('keydown', listener)
    }
    window.addEventListener('keydown', listener)
  }

  // 🔥 新增：关闭预览
  function closePreview() {
    previewVisible.value = false
    previewBgUrl.value = ''
  }

  // 用户上传背景
  function addUserBackground(file: File): BgItem {
    const url = URL.createObjectURL(file)
    const name = file.name.replace(/\.[^.]+$/, '')
    const id = `user__${Date.now()}`
    const item: BgItem = { id, url, name, source: 'user' }
    userList.value.push(item)
    return item
  }

  // 删除用户背景
  function removeUserBackground(id: string) {
    const idx = userList.value.findIndex(b => b.id === id)
    if (idx === -1) return
    const item = userList.value[idx]
    if (currentBg.value === item.url) clearBackground()
    URL.revokeObjectURL(item.url)
    userList.value.splice(idx, 1)
  }

  return {
    builtinList,
    userList,
    allBackgrounds,
    currentBg,
    previewVisible,
    previewBgUrl,
    setBackground,
    clearBackground,
    openPreview,
    closePreview,
    addUserBackground,
    removeUserBackground,
  }
})