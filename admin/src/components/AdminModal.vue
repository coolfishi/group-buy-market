<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; busy?: boolean; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let restore: HTMLElement | null = null

const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

function close() {
  if (!props.busy) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') return close()
  if (e.key !== 'Tab' || !panel.value) return
  const items = Array.from(panel.value.querySelectorAll<HTMLElement>(selector))
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restore = document.activeElement as HTMLElement | null
      await nextTick()
      panel.value?.querySelector<HTMLElement>('input, select, textarea, button.btn-primary')?.focus()
    } else if (restore && document.contains(restore)) {
      restore.focus()
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @mousedown.self="close">
      <div ref="panel" class="panel" :class="{ wide }" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown="onKeydown">
        <header>
          <h2 :id="titleId">{{ title }}</h2>
          <button type="button" class="x" aria-label="关闭" :disabled="busy" @click="close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </header>
        <div class="body"><slot /></div>
        <footer v-if="$slots.actions"><slot name="actions" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(34, 32, 30, 0.45);
}
.panel {
  width: min(520px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 22px;
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 24px 60px rgba(34, 32, 30, 0.28);
}
.panel.wide {
  width: min(760px, 100%);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.x:hover {
  background: var(--plinth);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
