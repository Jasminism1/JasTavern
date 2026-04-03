<template>
  <div class="background-manager">
    <!-- 背景画廊（可上下滑动） -->
    <div class="gallery-container">
      <div class="background-gallery">
        <!-- 遍历所有背景 -->
        <div
          v-for="bg in store.allBackgrounds"
          :key="bg.id"
          class="bg-card"
          :class="{ active: store.currentBg === bg.url }"
        >
          <img :src="bg.url" class="bg-thumb" alt="背景预览" />

          <!-- 🔥 左下角预览 + 右下角确认（需求指定位置） -->
          <div class="bg-card-actions">
            <button class="action-btn preview" @click="store.openPreview(bg.url)" title="预览">
              👁️ 预览
            </button>
            <button class="action-btn apply" @click="store.setBackground(bg.url)" title="应用">
              ✅ 应用
            </button>
          </div>
        </div>

        <!-- 上传本地背景 -->
        <div class="bg-card add-card" @click="triggerUpload">
          <div class="add-icon">+</div>
          <span>添加背景</span>
          <input
            type="file"
            ref="fileInput"
            hidden
            accept="image/*"
            @change="handleFileUpload"
          />
        </div>
      </div>
    </div>

    <!-- 🔥 全屏预览遮罩（点击/按任意键退出） -->
    <div
      v-if="store.previewVisible"
      class="preview-mask"
      @click="store.closePreview"
    >
      <img :src="store.previewBgUrl" class="preview-img" />
      <div class="preview-tip">按任意键 / 点击退出预览</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useBackgroundStore } from '../../stores/background'

const store = useBackgroundStore()
const fileInput = ref<HTMLInputElement | null>(null)

// 触发文件选择
function triggerUpload() {
  fileInput.value?.click()
}

// 处理上传（直接调用store方法，修复逻辑错误）
function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  // 直接上传并应用
  const bg = store.addUserBackground(file)
  store.setBackground(bg.url)
  // 清空input，支持重复上传同一张图
  if (fileInput.value) fileInput.value = ''
}
</script>

<style scoped>
.background-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  position: relative;
}

/* 画廊滚动容器 */
.gallery-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

/* 网格布局 */
.background-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

/* 背景卡片 */
.bg-card {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  border: 2px solid #333;
  transition: all 0.2s;
  cursor: pointer;
}

.bg-card.active {
  border-color: #4a90e2;
  box-shadow: 0 0 10px rgba(74, 144, 226, 0.4);
}

.bg-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 🔥 按钮固定：左下角预览 / 右下角应用 */
.bg-card-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  opacity: 0;
  transition: opacity 0.2s;
}

.bg-card:hover .bg-card-actions {
  opacity: 1;
}

.action-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: rgba(0,0,0,0.6);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.action-btn.preview:hover { background: #4a90e2; }
.action-btn.apply:hover { background: #2ecc71; }

/* 添加卡片 */
.add-card {
  border: 2px dashed #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #888;
}

.add-card:hover {
  border-color: #4a90e2;
  color: #fff;
}

.add-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

/* 🔥 全屏预览样式 */
.preview-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preview-img {
  max-width: 90%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 8px;
}

.preview-tip {
  margin-top: 20px;
  color: #ccc;
  font-size: 14px;
}
</style>