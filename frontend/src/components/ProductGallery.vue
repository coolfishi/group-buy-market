<script setup lang="ts">
import { ref } from 'vue'
import type { ProductImage } from '@/types'

const props = defineProps<{ images: ProductImage[] }>()
const current = ref(0)

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
      <img :src="images[current].src" :alt="images[current].alt" width="550" height="800" />
    </div>
    <div class="thumbs" role="group" aria-label="切换商品图片" @keydown="onKeydown">
      <button
        v-for="(img, i) in images"
        :key="img.src"
        type="button"
        class="thumb"
        :aria-pressed="i === current"
        :aria-label="`查看${img.label}图`"
        @click="current = i"
      >
        <img :src="img.src" alt="" width="84" height="122" loading="lazy" />
        <span>{{ img.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.main {
  position: relative;
  aspect-ratio: 11 / 16;
  max-height: calc(100vh - 180px);
  margin-inline: auto;
  border-radius: 16px;
  background: var(--ink);
  overflow: hidden;
}

/* 吸塑窗反光 */
.main::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.18) 0 12%, transparent 12% 72%, rgba(255, 255, 255, 0.08) 72% 77%, transparent 77%);
  pointer-events: none;
}

.main img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  height: 122px;
  object-fit: cover;
  border-radius: 10px;
  background: var(--plinth);
  border: 3px solid transparent;
}

.thumb[aria-pressed='true'] {
  color: var(--ink);
  font-weight: 700;
}

.thumb[aria-pressed='true'] img {
  border-color: var(--series, var(--ink));
}

@media (max-width: 480px) {
  .thumb,
  .thumb img {
    width: 64px;
  }
  .thumb img {
    height: 93px;
  }
}
</style>
