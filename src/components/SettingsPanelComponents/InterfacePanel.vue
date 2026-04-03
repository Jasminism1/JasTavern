<template>
  <div class="interface-panel">
    <div class="setting-group">
      <h4>字体</h4>
      <div class="setting-item font-options">
        <button 
          v-for="font in fontOptions" 
          :key="font"
          class="font-btn"
          :class="{ active: settings.font === font }"
          @click="settings.font = font"
        >
          {{ font }}
        </button>
      </div>
    </div>

    <div class="setting-group">
      <h4>动画播放设置</h4>
      <div class="setting-item animation-options">
        <button 
          v-for="anim in animationOptions" 
          :key="anim"
          class="anim-btn"
          :class="{ active: settings.animation === anim }"
          @click="settings.animation = anim"
        >
          {{ anim }}
        </button>
        <span class="option-desc">控制动画播放时的循环效果</span>
      </div>
    </div>

    <div class="setting-group">
      <h4>界面参数调节</h4>
      <!-- 文字框透光 -->
      <div class="setting-item slider-item">
        <span>文字框透光</span>
        <div class="slider-wrapper">
          <input 
            type="range" 
            min="0" 
            max="100" 
            v-model="settings.textOpacity"
            class="setting-slider"
          >
          <span class="slider-value">{{ settings.textOpacity }}%</span>
        </div>
      </div>
      <!-- 整体不透明度 -->
      <div class="setting-item slider-item">
        <span>整体不透明度</span>
        <div class="slider-wrapper">
          <input 
            type="range" 
            min="0" 
            max="100" 
            v-model="settings.globalOpacity"
            class="setting-slider"
          >
          <span class="slider-value">{{ settings.globalOpacity }}%</span>
        </div>
      </div>
      <!-- 字体大小缩放 -->
      <div class="setting-item slider-item">
        <span>字体大小缩放</span>
        <div class="slider-wrapper">
          <input 
            type="range" 
            min="50" 
            max="150" 
            v-model="settings.fontSize"
            class="setting-slider"
          >
          <span class="slider-value">{{ settings.fontSize }}%</span>
        </div>
      </div>
      <!-- 阅读栏边距 -->
      <div class="setting-item slider-item">
        <span>阅读栏边距</span>
        <div class="slider-wrapper">
          <input 
            type="range" 
            min="0" 
            max="50" 
            v-model="settings.readingMargin"
            class="setting-slider"
          >
          <span class="slider-value">{{ settings.readingMargin }}px</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 接收父组件传递的参数
defineProps({
  settings: {
    type: Object,
    required: true
  },
  fontOptions: {
    type: Array,
    required: true
  },
  animationOptions: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
/* 界面设置组件样式（复用原有样式） */
.interface-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setting-group h4 {
  margin: 0;
  color: #889;
  font-size: 14px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  background: #16213e;
  border-radius: 4px;
}

.font-options, .animation-options {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.font-btn, .anim-btn {
  padding: 4px 12px;
  background: #2a2a3a;
  border: 1px solid #556;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
}
.font-btn.active, .anim-btn.active {
  background: #3a3a4a;
  color: #fff;
  border-color: #889;
}
.option-desc {
  font-size: 12px;
  color: #889;
  margin-left: 12px;
}

.slider-item {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 60%;
}
.setting-slider {
  flex: 1;
  height: 6px;
  background: #2a2a3a;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}
.setting-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #889;
  cursor: pointer;
}
.slider-value {
  font-size: 14px;
  color: #ccc;
  min-width: 40px;
  text-align: right;
}
</style>