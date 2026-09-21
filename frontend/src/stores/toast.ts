import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

export const useToastStore = defineStore('toast', () => {
  const items = ref<Toast[]>([])
  let seq = 0
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number) {
    items.value = items.value.filter((t) => t.id !== id)
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function show(text: string, tone: Toast['tone'] = 'info') {
    const id = ++seq
    items.value = [...items.value.slice(-2), { id, text, tone }]
    timers.set(
      id,
      setTimeout(() => dismiss(id), tone === 'error' ? 5000 : 3200),
    )
  }

  return { items, show, dismiss }
})
