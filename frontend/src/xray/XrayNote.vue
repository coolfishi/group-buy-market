<script setup lang="ts">
import { ref, useId } from 'vue'
import { xrayEnabled } from './trace'

/** 透视模式下贴在页面元素旁的小标签，点开是一句话说明后端怎么处理这里 */
defineProps<{ label: string; text: string }>()
const open = ref(false)
const id = useId()
</script>

<template>
  <span v-if="xrayEnabled" class="note" :class="{ open }">
    <button
      type="button"
      class="pin"
      :aria-expanded="open"
      :aria-controls="id"
      @click.stop.prevent="open = !open"
      @keydown.esc="open = false"
    >
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
      {{ label }}
    </button>
    <span v-show="open" :id="id" class="bubble" role="note">{{ text }}</span>
  </span>
</template>

<style scoped>
.note {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
  margin-left: 8px;
  font-family: var(--font-body);
  line-height: 1.4;
}

.pin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  background: var(--sticker);
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 0 0 0 rgba(255, 217, 46, 0.7);
  animation: ping 2.4s ease-out 2;
}

.open .pin {
  background: var(--ink);
  color: var(--sticker);
}

.bubble {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  width: min(300px, 80vw);
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  font-size: var(--t-xs);
  font-weight: 400;
  box-shadow: 0 12px 24px -12px rgba(0, 0, 0, 0.5);
}

@keyframes ping {
  to {
    box-shadow: 0 0 0 8px rgba(255, 217, 46, 0);
  }
}
</style>
