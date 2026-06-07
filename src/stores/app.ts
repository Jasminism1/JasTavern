// stores/app.ts
// 全局应用状态：UI 显示控制 + 模态窗口 + 角色状态（由 AI JSON 驱动）
// 对话 / 节点树 由 conversationTree store 管理

import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

// ---- AI 每轮返回的 JSON 结构（后续从消息中解析填入） ----
export interface CharacterStatus {
  name: string
  location: string
  mood: string
  hp: number
  maxHp: number
  sp: number
  maxSp: number
  affection: number
  stress: number
  action: string
  outfit?: string
}

export type ModalId = 'map' | 'character' | 'log' | 'settings' | 'others'

export const useAppStore = defineStore('app', () => {
  const isUIActive = ref(false)
  const activeModal = ref<ModalId | null>(null)

  // ---- AI 生成状态 ----
  const isGenerating = ref(false)
  const streamText = ref('')

  // ---- 角色状态（AI JSON 填入） ----
  const characterStatus = reactive<CharacterStatus>({
    name: '???',
    location: '未知',
    mood: '平静',
    hp: 100, maxHp: 100,
    sp: 100, maxSp: 100,
    affection: 0,
    stress: 0,
    action: '',
    outfit: '',
  })

  // ---- Actions ----
  function enterUI()  { isUIActive.value = true  }
  function exitUI()   { isUIActive.value = false }

  function openModal(id: ModalId) {
    activeModal.value = activeModal.value === id ? null : id
  }
  function closeModal() { activeModal.value = null }

  function updateStatus(patch: Partial<CharacterStatus>) {
    Object.assign(characterStatus, patch)
  }

  return {
    isUIActive, isGenerating, streamText,
    activeModal, characterStatus,
    enterUI, exitUI, openModal, closeModal,
    updateStatus,
  }
})
