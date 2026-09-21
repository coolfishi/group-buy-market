<script setup lang="ts">
import { ref } from 'vue'
import type { ProductImage } from '@/types'

const props = defineProps<{ images: ProductImage[] }>()
const current = ref(0)
const labels = ['正面', '细节', '包装']

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') current.value = (current.value + 1) % props.images.length
  else if (e.key === 'ArrowLeft') current.value = (current.value - 1 + props.images.length) % props.images.length
  else return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')[current.value]?.focus()
}
</script>

<template>
  <div class="gallery">
    <div class="main">
      <img :src="images[current].src" :alt="images[current].alt" width="800" height="800" />
    </div>
    <div class="thumbs" role="group" aria-label="切换商品图片" @keydown="onKeydown">
      <button
        v-for="(img, i) in images"
        :key="img.src"
        type="button"
        class="thumb"
        :aria-pressed="i === current"
        :aria-label="`查看${labels[i] ?? `第 ${i + 1} 张`}图`"
        @click="current = i"
      >
        <img :src="img.src" alt="" width="120" height="120" loading="lazy" />
        <span>{{ labels[i] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.main {
  aspect-ratio: 1 / 1;
  border-radius: var(--r-plinth);
  background: var(--plinth);
  overflow: hidden;
}

.main img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumbs {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.thumb {
  display: grid;
  gap: 4px;
  justify-items: center;
  width: 84px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: var(--t-xs);
  color: var(--graphite);
  cursor: pointer;
}

.thumb img {
  width: 84px;
  height: 84px;
  object-fit: contain;
  border-radius: 12px;
  background: var(--plinth);
  border: 2px solid transparent;
}

.thumb[aria-pressed='true'] {
  color: var(--ink);
  font-weight: 700;
}

.thumb[aria-pressed='true'] img {
  border-color: var(--ink);
}

@media (max-width: 480px) {
  .thumb,
  .thumb img {
    width: 64px;
  }
  .thumb img {
    height: 64px;
  }
}
</style>
