<template>
  <div class="settings-panel">
    <h3 class="panel-title">游戏设置</h3>

    <!-- 标签切换栏 -->
    <div class="settings-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.name }}
      </button>
    </div>

    <!-- 标签对应的内容区域（引入拆分后的组件） -->
    <div class="tab-content">
      <!-- 界面设置（默认显示） -->
      <InterfacePanel 
        v-if="activeTab === 'interface'"
        :settings="settings"
        :fontOptions="fontOptions"
        :animationOptions="animationOptions"
      />

      <!-- 故事设置 -->
      <StoryPanel v-if="activeTab === 'story'" />

      <!-- 背景设置 -->
      <BackgroundPanel v-if="activeTab === 'background'" />

      <!-- 回想设置 -->
      <RecallingPanel v-if="activeTab === 'recall'" />

      <!-- 其他设置 -->
      <OtherPanel v-if="activeTab === 'other'" />
    </div>
  </div>
  <!-- 保存按钮（调整布局结构，仅改外层容器类名） -->
  <div class="save-btn-wrapper">
    <button @click="saveSettings">保存配置</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore }  from '../stores/settings'
// 导入拆分后的5个组件
import InterfacePanel from './SettingsPanelComponents/InterfacePanel.vue'
import StoryPanel from './SettingsPanelComponents/StoryPanel.vue'
import BackgroundPanel from './SettingsPanelComponents/BackgroundPanel.vue'
import RecallingPanel from './SettingsPanelComponents/RecallingPanel.vue'
import OtherPanel from './SettingsPanelComponents/OtherPanel.vue'

// 使用设置状态管理（如果需要全局共享设置状态）
const settingsStore = useSettingsStore()
// 这里我们使用本地状态来管理设置，实际项目中可以根据需要切换为全局状态管理

// 标签页配置（故事/背景/界面/回想/其他）
const tabs = ref([
  { key: 'story', name: '故事' },
  { key: 'background', name: '背景' },
  { key: 'interface', name: '界面' },
  { key: 'recall', name: '回想' },
  { key: 'other', name: '其他' }
])
// 默认激活的标签（界面）
const activeTab = ref('interface')

// 设置配置（与图片参数一致）
const settings = ref({
  font: 'naikai',                     // 字体默认值
  animation: '自动',                  // 动画播放默认值
  textOpacity: 70,                    // 文字框透光
  globalOpacity: 70,                  // 整体不透明度
  fontSize: 100,                      // 字体大小缩放
  readingMargin: 24                   // 阅读栏边距
})

// 字体选项列表
const fontOptions = ref(['naikai', '宋体', '系统字体'])
// 动画播放选项列表
const animationOptions = ref(['自动', '始终循环', '始终不循环'])

// 保存设置方法
function saveSettings() {
  console.log('配置已保存：', settings.value)
  alert('设置保存成功！')
}
</script>

<style scoped>
/* 核心面板样式（完全保留原有风格） */
.settings-panel {
  width: 100%;
  height: 100%;
  color: #eee;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  padding: 16px;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

/* 标签切换栏样式（适配原有CSS风格） */
.settings-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}
.tab-btn {
  padding: 6px 16px;
  background: #16213e;
  border: 1px solid #556;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background: #2a2a3a;
  color: #fff;
  border-color: #889;
}
.tab-btn:hover {
  background: #252f48;
}

/* 标签内容区（移除flex:1，避免挤压/拉伸） */
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  /* 仅移除flex:1，保留其他原有样式 */
}

/* 保存按钮容器（替换原setting-extra，大幅精简样式） */
.save-btn-wrapper {
  display: flex;
  justify-content: center; /* 水平居中 */
  padding: 8px 0; /* 少量上下内边距 */
  /* 移除不必要的边框、flex:1、大量内边距 */
  border-radius: 4px;
}
.save-btn-wrapper button {
  padding: 8px 24px; /* 适度放大按钮点击区域 */
  background: #2a2a3a;
  border: 1px solid #556;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s; /* 增加过渡动画 */
}
.save-btn-wrapper button:hover {
  background: #3a3a4a;
  color: #fff;
  border-color: #889;
}
</style>