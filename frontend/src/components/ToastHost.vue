<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toast.items" :key="t.id" class="toast" :class="t.tone" role="status">
        <span>{{ t.text }}</span>
        <button type="button" aria-label="关闭提示" @click="toast.dismiss(t.id)">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  z-index: 200;
  left: 50%;
  top: calc(var(--header-h) + 44px);
  transform: translateX(-50%);
  display: grid;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

@media (min-width: 761px) {
  .toasts {
    left: auto;
    right: max(var(--gutter), calc((100vw - var(--maxw)) / 2 + var(--gutter)));
    transform: none;
    width: 360px;
  }
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 12px 18px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  box-shadow: 0 10px 24px -10px rgba(22, 26, 58, 0.6);
  font-size: var(--t-sm);
  pointer-events: auto;
}

.toast.success {
  background: var(--ok);
}

.toast.error {
  background: var(--danger);
}

.toast button {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
