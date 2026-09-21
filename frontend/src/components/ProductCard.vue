<script setup lang="ts">
import { computed } from 'vue'
import { appConfig } from '@/config/env'
import { categoryName } from '@/data/products'
import type { Product } from '@/types'
import PriceTag from './PriceTag.vue'

const props = defineProps<{ product: Product }>()
const isDemo = appConfig.mode === 'demo'
const cover = computed(() => props.product.images[0])
</script>

<template>
  <article class="exhibit">
    <RouterLink :to="`/products/${product.id}`" class="link">
      <div class="plinth">
        <img :src="cover.src" :alt="cover.alt" width="550" height="800" loading="lazy" />
      </div>
      <div class="placard">
        <p class="cat">{{ categoryName(product.category) }}</p>
        <h3 class="name">{{ product.name }}</h3>
        <p class="spec">{{ product.size }}</p>
        <p v-if="isDemo" class="prices">
          <span class="group">拼团 <PriceTag :value="product.demoPrice.group" tone="violet" /></span>
          <span class="single">单买 <PriceTag :value="product.demoPrice.original" size="sm" tone="muted" /></span>
        </p>
        <p v-else class="prices live">拼团价以商品页为准</p>
      </div>
    </RouterLink>
  </article>
</template>

<style scoped>
.link {
  display: block;
  text-decoration: none;
  border-radius: var(--r-plinth);
}

/* 官方图是 11:16 的竖版棚拍，按原比例铺满 */
.plinth {
  aspect-ratio: 11 / 16;
  border-radius: var(--r-plinth);
  background: var(--plinth);
  overflow: hidden;
}

.plinth img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.link:hover .plinth img {
  transform: scale(1.035);
}

/* 展签：左侧一条炭黑竖线，像博物馆说明牌 */
.placard {
  margin-top: 14px;
  padding-left: 14px;
  border-left: 2px solid var(--ink);
}

.cat {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.name {
  margin-top: 2px;
  font-size: var(--t-lg);
  font-weight: 700;
}

.link:hover .name {
  color: var(--violet);
}

.spec {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.prices {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 10px;
  font-size: var(--t-sm);
}

.group,
.single {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.single {
  color: var(--graphite);
}

.live {
  color: var(--graphite);
}
</style>
