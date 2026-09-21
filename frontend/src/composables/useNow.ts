import { onScopeDispose, readonly, ref } from 'vue'

// 所有倒计时共用一个 1 秒节拍，无订阅者时自动停止
const now = ref(Date.now())
let subscribers = 0
let timer: ReturnType<typeof setInterval> | null = null

export function useNow() {
  subscribers += 1
  if (!timer) {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), 1000)
  }
  onScopeDispose(() => {
    subscribers -= 1
    if (subscribers <= 0 && timer) {
      clearInterval(timer)
      timer = null
      subscribers = 0
    }
  })
  return readonly(now)
}
