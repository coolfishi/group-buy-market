<script setup lang="ts">
import { computed } from 'vue'
import { appConfig } from '@/config/env'
import { categoryName } from '@/data/products'
import type { Product } from '@/types'
import { characterName } from '@/utils/format'

const props = defineProps<{ product: Product }>()
const isDemo = appConfig.mode === 'demo'
const cover = computed(() => props.product.images[0])
</script>

<template>
  <article class="exhibit">
    <!-- 手办盒：顶部作品色条写系列名，中间开窗露出手办，侧边竖排作品名，拼团价做成贴纸 -->
    <RouterLink :to="`/products/${product.id}`" class="box" :class="product.category">
      <p class="box-top">
        <span class="line">{{ product.line }}</span>
        <span v-if="isDemo">{{ product.demoTarget }} 人团</span>
      </p>
      <div class="window">
        <img :src="cover.src" :alt="cover.alt" width="550" height="800" loading="lazy" />
      </div>
      <p class="side" aria-hidden="true">{{ categoryName(product.category) }}</p>
      <div class="nameplate">
        <h3 class="name" :title="product.name">{{ characterName(product) }}</h3>
        <p v-if="isDemo" class="was">单买 <s class="num">¥{{ product.demoPrice.original }}</s></p>
        <p v-else class="was">拼团价以商品页为准</p>
      </div>
      <p class="sticker">
        <span>拼团价</span>
        <b v-if="isDemo" class="num">¥{{ product.demoPrice.group }}</b>
        <b v-else class="more">看详情</b>
      </p>
    </RouterLink>
  </article>
</template>

<style scoped>
.box {
  --series: var(--naruto);
  --series-fg: var(--ink);
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  border-radius: 10px;
  background: var(--card);
  box-shadow: var(--shadow-box);
  text-decoration: none;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.box.jjk {
  --series: var(--jjk);
  --series-fg: #fff;
}

.box:hover {
  transform: translateY(-4px);
}

.box-top {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px 10px 0 0;
  background: var(--series);
  color: var(--series-fg);
  font-size: var(--t-xs);
  font-weight: 700;
  line-height: 1.5;
}

.line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-num);
  font-weight: 400;
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}

/* 开窗：官方图是 11:16 竖版棚拍，窗口略矮，按 cover 裁切 */
.window {
  position: relative;
  margin: 10px 0 0 10px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--ink);
}

.window img {
  width: 100%;
  aspect-ratio: 11 / 14;
  object-fit: cover;
  object-position: center 30%;
}

/* 吸塑窗的两道反光 */
.window::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.2) 0 14%, transparent 14% 70%, rgba(255, 255, 255, 0.1) 70% 76%, transparent 76%);
  pointer-events: none;
}

.side {
  grid-row: 2 / 4;
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
  writing-mode: vertical-rl;
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.3em;
  color: var(--series);
}

.nameplate {
  padding: 10px 6px 14px 14px;
}

.name {
  font-size: 1.5rem;
  line-height: 1.2;
}

.was {
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--graphite);
}

.was s {
  font-size: 0.95rem;
}

/* 拼团价贴纸：黄色爆炸贴，斜贴在开窗右上角 */
.sticker {
  position: absolute;
  z-index: 1;
  top: 28px;
  right: 14px;
  display: grid;
  place-content: center;
  width: 80px;
  height: 80px;
  background: var(--sticker);
  color: var(--ink);
  text-align: center;
  line-height: 1.05;
  transform: rotate(10deg);
  clip-path: polygon(50% 0, 61% 12%, 76% 6%, 79% 22%, 94% 25%, 89% 40%, 100% 50%, 89% 60%, 94% 75%, 79% 78%, 76% 94%, 61% 88%, 50% 100%, 39% 88%, 24% 94%, 21% 78%, 6% 75%, 11% 60%, 0 50%, 11% 40%, 6% 25%, 21% 22%, 24% 6%, 39% 12%);
}

.sticker span {
  font-size: 11px;
  font-weight: 900;
}

.sticker b {
  font-size: 1.5rem;
}

.sticker .more {
  font-size: 0.8125rem;
  font-weight: 900;
}

@media (max-width: 480px) {
  .box {
    grid-template-columns: minmax(0, 1fr) 20px;
  }
  .window {
    margin: 8px 0 0 8px;
    border-radius: 12px;
  }
  .side {
    font-size: 0.75rem;
  }
  .name {
    font-size: 1.125rem;
  }
  .box-top > span:last-child:not(.line) {
    display: none;
  }
  .sticker {
    top: 22px;
    right: 6px;
    width: 62px;
    height: 62px;
  }
  .sticker b {
    font-size: 1.125rem;
  }
}
</style>
