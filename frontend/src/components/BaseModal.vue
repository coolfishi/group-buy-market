<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** 处理中时禁止关闭 */
    locked?: boolean
  }>(),
  { locked: false },
)
const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let restoreTarget: HTMLElement | null = null

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  return panel.value ? Array.from(panel.value.querySelectorAll<HTMLElement>(focusableSelector)) : []
}

function requestClose() {
  if (!props.locked) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    requestClose()
    return
  }
  if (e.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) {
    e.preventDefault()
    panel.value?.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === panel.value)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreTarget = document.activeElement as HTMLElement | null
      document.body.style.overflow = 'hidden'
      await nextTick()
      const preferred = panel.value?.querySelector<HTMLElement>('[data-autofocus]')
      ;(preferred ?? focusables()[0] ?? panel.value)?.focus()
    } else {
      document.body.style.overflow = ''
      // 关闭后焦点回到触发按钮
      if (restoreTarget && document.contains(restoreTarget)) restoreTarget.focus()
      restoreTarget = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="overlay" @mousedown.self="requestClose">
        <div
          ref="panel"
          class="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <header class="head">
            <h2 :id="titleId">{{ title }}</h2>
            <button class="close" type="button" :disabled="locked" aria-label="关闭" @click="requestClose">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </header>
          <div class="body">
            <slot />
          </div>
          <footer v-if="$slots.actions" class="actions">
            <slot name="actions" />
          </footer>
        </div>
      </div>
    </Transition>
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
  background: rgba(22, 26, 58, 0.55);
}

.panel {
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  background: var(--card);
  border-radius: var(--r-dialog);
  border-top: 8px solid var(--ink);
  box-shadow: 0 24px 60px rgba(22, 26, 58, 0.35);
  padding: 24px;
}

.panel:focus {
  outline: none;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.head h2 {
  font-size: 1.75rem;
}

.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: -8px -8px 0 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.close:not(:disabled):hover {
  background: var(--plinth);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.actions :deep(.btn) {
  flex: 1 1 160px;
}

@media (max-width: 560px) {
  .overlay {
    align-items: end;
    padding: 0;
  }
  .panel {
    width: 100%;
    border-radius: var(--r-dialog) var(--r-dialog) 0 0;
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-active .panel,
.modal-leave-active .panel {
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .panel,
.modal-leave-to .panel {
  transform: translateY(16px);
}
</style>
