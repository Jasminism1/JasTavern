<template>
  <div class="char-warehouse-panel">
    
    <!-- ================= 画廊视图 ================= -->
    <Transition name="fade-slide" mode="out-in">
      <div class="gallery-view" v-if="!selectedChar" key="gallery">
        
        <div class="gallery-header">
          <h2>角色档案室</h2>
          <p>滚动鼠标滚轮浏览角色</p>
        </div>

        <div class="gallery-track" ref="galleryRef" @wheel="handleWheel">
          <div
            v-for="char in characters"
            :key="char.id"
            class="char-card-wrapper"
            @click="selectChar(char)"
          >
            <div class="char-card-glow">
              <div class="char-card">
                <img 
                  :src="getImgPath(char.img)" 
                  class="char-portrait" 
                  @error="onImgError"
                  alt="Portrait"
                />
                <div class="char-name-overlay">
                  <span>{{ char.name }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 结尾留白 -->
          <div class="spacer"></div>
        </div>

      </div>

      <!-- ================= 详情视图 (MVP) ================= -->
      <div class="detail-view" v-else key="detail">
        <button class="back-btn" @click="selectedChar = null">
          <span class="icon">◀</span> 返回画廊
        </button>

        <div class="detail-content">
          <!-- 左侧：大立绘展示 -->
          <div class="detail-left">
            <div class="large-portrait-glow">
              <div class="large-portrait-card">
                <img 
                  :src="getImgPath(selectedChar.img)" 
                  class="char-portrait"
                  @error="onImgError"
                  alt="Portrait"
                />
              </div>
            </div>
          </div>

          <!-- 右侧：详细信息 MVP -->
          <div class="detail-right">
            <div class="detail-header">
              <h1>{{ selectedChar.name }}</h1>
              <span class="level-badge">Lv. {{ selectedChar.level }}</span>
            </div>
            
            <div class="attr-grid">
              <div class="attr-box">
                <span class="attr-label">生命值 (HP)</span>
                <span class="attr-value">{{ selectedChar.hp }}</span>
              </div>
              <div class="attr-box">
                <span class="attr-label">攻击力 (ATK)</span>
                <span class="attr-value">{{ selectedChar.atk }}</span>
              </div>
              <div class="attr-box">
                <span class="attr-label">防御力 (DEF)</span>
                <span class="attr-value">{{ selectedChar.def }}</span>
              </div>
            </div>

            <div class="extra-info-placeholder">
              <h3>角色详情 / 故事 / 装备</h3>
              <p>可以在此处扩展更多复杂的组件...</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Character {
  id: number
  name: string
  level: number
  hp: number
  atk: number
  def: number
  img: string
}

// 模拟角色数据库
const characters = ref<Character[]>([
  { id: 1, name: 'Amiya', level: 90, hp: 1200, atk: 600, def: 200, img: 'amiya.png' },
  { id: 2, name: 'Ch\'en', level: 90, hp: 1500, atk: 700, def: 300, img: 'chen.png' },
  { id: 3, name: 'Kal\'tsit', level: 90, hp: 1300, atk: 500, def: 250, img: 'kaltsit.png' },
  { id: 4, name: 'Exusiai', level: 90, hp: 1100, atk: 650, def: 150, img: 'exusiai.png' },
  { id: 5, name: 'SilverAsh', level: 90, hp: 1600, atk: 750, def: 350, img: 'silverash.png' },
  { id: 6, name: 'Surtr', level: 90, hp: 1400, atk: 800, def: 200, img: 'surtr.png' },
])

const selectedChar = ref<Character | null>(null)
const galleryRef = ref<HTMLElement | null>(null)

// 动态获取图片路径 (针对 Vite 优化)
function getImgPath(filename: string) {
  return new URL(`../assets/paintings/${filename}`, import.meta.url).href
}

// 图片加载失败时替换为纯色透明占位图，防止破图
function onImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  target.style.opacity = '0';
}

// 选中角色
function selectChar(char: Character) {
  selectedChar.value = char
}

// 横向滚动逻辑：将垂直滚轮映射为水平滚动
function handleWheel(e: WheelEvent) {
  if (galleryRef.value) {
    // 阻止默认垂直滚动，并加上横向偏移
    e.preventDefault()
    galleryRef.value.scrollLeft += e.deltaY * 0.8 // 乘以0.8让滚动更平滑
  }
}
</script>

<style scoped>
.char-warehouse-panel {
  width: 100%;
  height: 100%;
  color: #eee;
  overflow: hidden; /* 防止外层出现滚动条 */
  display: flex;
  flex-direction: column;
}

/* ================== 画廊视图 ================== */
.gallery-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.gallery-header {
  flex-shrink: 0;
  margin-bottom: 16px;
}
.gallery-header h2 {
  margin: 0;
  font-size: 24px;
  color: #fff;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(120, 180, 255, 0.6);
}
.gallery-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #889;
}

/* 横向滚动轨道 */
.gallery-track {
  flex: 1;
  display: flex;
  gap: 24px;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 40px 20px; /* 上下留出悬停放大的空间 */
  scroll-behavior: auto; /* 去除smooth以保证滚轮响应无延迟 */
}

/* 隐藏横向滚动条 (针对 webkit) */
.gallery-track::-webkit-scrollbar {
  display: none;
}
.gallery-track {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.spacer {
  min-width: 40px; /* 末尾留白 */
  height: 1px;
}

/* ================== 角色卡片 (尖塔状) ================== */
.char-card-wrapper {
  position: relative;
  /* 卡片尺寸设计，比例近似 1:2.8 */
  width: 130px;
  height: 360px;
  flex-shrink: 0;
  cursor: pointer;
  perspective: 1000px; /* 增加3D透视感 */
}

/* Glow 层：利用 drop-shadow 实现跨越 clip-path 边界的外发光 */
.char-card-glow {
  width: 100%;
  height: 100%;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.8));
}

.char-card-wrapper:hover .char-card-glow {
  transform: translateY(-15px) scale(1.05);
  /* 悬停时的塔尖高光/弧光 */
  filter: drop-shadow(0 0 15px rgba(120, 200, 255, 0.8));
}

/* 实际被切割的卡片主体 */
.char-card {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #1e2638 0%, #0f1322 100%);
  /* 尖塔切割：上下各有一个尖角 */
  clip-path: polygon(50% 0%, 100% 10%, 100% 90%, 50% 100%, 0% 90%, 0% 10%);
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  /* 增加内发光假象 */
  box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.1);
}

/* 内部动态弧光线 (使用伪元素在边缘扫过) */
.char-card::after {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(transparent, rgba(150, 200, 255, 0.4), transparent 30%);
  animation: rotateGlow 6s linear infinite;
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}
.char-card-wrapper:hover .char-card::after {
  opacity: 1;
}
@keyframes rotateGlow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 立绘图设置 */
.char-portrait {
  width: 100%;
  height: 100%;
  /* 居中裁剪 */
  object-fit: cover;
  object-position: center;
  transition: opacity 0.3s, transform 0.5s;
  z-index: 1;
  /* 如果没图，显示底色 */
  background: rgba(30, 40, 60, 0.5);
}
.char-card-wrapper:hover .char-portrait {
  transform: scale(1.08); /* 图片内放大 */
}

/* 底部名字标签 */
.char-name-overlay {
  position: absolute;
  bottom: 15%; /* 避开底部尖塔 */
  width: 100%;
  text-align: center;
  z-index: 2;
  background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%);
  padding: 20px 0 5px;
}
.char-name-overlay span {
  font-family: serif;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 1px;
  text-shadow: 0 2px 4px #000;
}

/* ================== 详情视图 MVP ================== */
.detail-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.back-btn {
  align-self: flex-start;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}
.back-btn:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.5);
}
.back-btn .icon { font-size: 10px; margin-right: 4px; }

.detail-content {
  flex: 1;
  display: flex;
  gap: 30px;
  min-height: 0;
}

.detail-left {
  flex: 0 0 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 详情里的大立绘同样保持尖塔风格，尺寸更大 */
.large-portrait-glow {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 20px rgba(100, 150, 255, 0.3));
}
.large-portrait-card {
  width: 100%;
  height: 100%;
  clip-path: polygon(50% 0%, 100% 5%, 100% 95%, 50% 100%, 0% 95%, 0% 5%);
  background: #111;
}

.detail-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
  overflow-y: auto;
}

.detail-header h1 {
  margin: 0;
  font-size: 32px;
  color: #fff;
}
.level-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  background: #3a5a8a;
  border-radius: 12px;
  font-size: 12px;
  color: #ddeeef;
}

.attr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.attr-box {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.attr-label { font-size: 12px; color: #889; }
.attr-value { font-size: 20px; color: #fff; font-weight: bold; }

.extra-info-placeholder {
  flex: 1;
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #556;
}
.extra-info-placeholder h3 { margin: 0 0 8px; }
.extra-info-placeholder p { margin: 0; font-size: 13px; }

/* 页面切换动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-slide-enter-from { opacity: 0; transform: translateX(20px); }
.fade-slide-leave-to { opacity: 0; transform: translateX(-20px); }
</style>