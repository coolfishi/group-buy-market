import { reactive } from 'vue'

export const toasts = reactive<{ id: number; text: string; tone: 'ok' | 'error' }[]>([])
let seq = 0

export function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  const id = ++seq
  toasts.push({ id, text, tone })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, tone === 'error' ? 5000 : 2800)
}
