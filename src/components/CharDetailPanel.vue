<template>
  <div class="char-panel">
    <!-- 角色头部信息 -->
    <div class="char-header">
      <div class="avatar">👤</div>
      <div class="char-info">
        <h3>{{ char.name }}</h3>
        <p>等级：Lv.{{ char.level }}</p>
      </div>
    </div>

    <!-- 角色属性（核心扩展区） -->
    <div class="char-attrs">
      <div class="attr-item">
        <span>生命值</span>
        <span>{{ char.hp }} / 100</span>
      </div>
      <div class="attr-item">
        <span>攻击力</span>
        <span>{{ char.atk }}</span>
      </div>
      <div class="attr-item">
        <span>防御力</span>
        <span>{{ char.def }}</span>
      </div>
    </div>

    <!-- 扩展区域：装备/技能/背包 -->
    <div class="char-extra">
      <p>✅ 装备栏 / 技能树 / 背包 在此扩展</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 角色数据（后续可替换为Pinia全局状态）
const char = ref({
  name: '冒险者',
  level: 1,
  hp: 80,
  atk: 15,
  def: 8
})
</script>

<style scoped>
.char-panel {
  width: 100%;
  height: 100%;
  color: #eee;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.char-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.avatar {
  width: 50px;
  height: 50px;
  background: #223;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border: 2px solid #559;
}

.char-info h3 {
  margin: 0;
  font-size: 18px;
}
.char-info p {
  margin: 4px 0 0;
  color: #aaa;
}

/* 属性列表 */
.char-attrs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attr-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #16213e;
  border-radius: 4px;
}

.char-extra {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #667;
  border: 1px dashed #334;
  border-radius: 6px;
}
</style>