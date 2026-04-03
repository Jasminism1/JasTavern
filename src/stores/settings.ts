import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 游戏设置全局状态管理
 * 包含：界面 / 故事 / 背景 / 回想 / 其他 五大模块配置
 */
export const useSettingsStore = defineStore('gameSettings', () => {
  // ==================== 1. 全局基础配置（与主面板一致） ====================
  const fontOptions = ref(['naikai', '宋体', '系统字体'])
  const animationOptions = ref(['自动', '始终循环', '始终不循环'])

  // ==================== 2. 界面设置（InterfacePanel） ====================
  const interfaceSettings = ref({
    font: 'naikai',
    animation: '自动',
    textOpacity: 70,
    globalOpacity: 70,
    fontSize: 100,
    readingMargin: 24
  })

  // ==================== 3. 故事设置（StoryPanel）【空逻辑待补充】 ====================
  const storySettings = ref({
    // 后续补充：剧情速度、自动播放、跳过已读等
  })

  // ==================== 4. 背景设置（BackgroundPanel）【空逻辑待补充】 ====================
  const backgroundSettings = ref({
    // 后续补充：背景模糊、亮度、动态背景开关等
  })

  // ==================== 5. 回想设置（RecallingPanel）【空逻辑待补充】 ====================
  const recallSettings = ref({
    // 后续补充：回想列表排序、CG/音乐分类展示等
  })

  // ==================== 6. 其他设置（OtherPanel）【空逻辑待补充】 ====================
  const otherSettings = ref({
    // 后续补充：音量、快捷键、数据重置等
  })

  // ==================== 计算属性（供组件快捷使用） ====================
  const allSettings = computed(() => ({
    interface: interfaceSettings.value,
    story: storySettings.value,
    background: backgroundSettings.value,
    recall: recallSettings.value,
    other: otherSettings.value
  }))

  // ==================== 方法：保存所有配置 ====================
  function saveAllSettings() {
    // 实际项目可在这里：持久化 localStorage / 调用接口保存
    console.log('✅ 全局设置已保存：', allSettings.value)
  }

  // ==================== 方法：重置为默认值 ====================
  function resetToDefault() {
    // 界面设置重置
    interfaceSettings.value = {
      font: 'naikai',
      animation: '自动',
      textOpacity: 70,
      globalOpacity: 70,
      fontSize: 100,
      readingMargin: 24
    }

    // 其他模块后续在这里补充默认值
    storySettings.value = {}
    backgroundSettings.value = {}
    recallSettings.value = {}
    otherSettings.value = {}
  }

  // 暴露给组件使用
  return {
    // 配置项
    fontOptions,
    animationOptions,
    interfaceSettings,
    storySettings,
    backgroundSettings,
    recallSettings,
    otherSettings,
    allSettings,

    // 方法
    saveAllSettings,
    resetToDefault
  }
})