import { onScopeDispose } from 'vue'

/**
 * 串行轮询：上一次完成后再计时下一次；离开页面（作用域销毁）自动停止。
 * task 返回 true 表示结束轮询。
 */
export function usePolling(task: () => Promise<boolean>, intervalMs: number, maxDurationMs = Infinity) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let startedAt = 0

  async function tick() {
    if (!active) return
    let done = false
    try {
      done = await task()
    } catch {
      done = false
    }
    if (!active) return
    if (done || Date.now() - startedAt >= maxDurationMs) {
      stop()
      return
    }
    timer = setTimeout(tick, intervalMs)
  }

  function start(immediate = false) {
    stop()
    active = true
    startedAt = Date.now()
    timer = setTimeout(tick, immediate ? 0 : intervalMs)
  }

  function stop() {
    active = false
    if (timer) clearTimeout(timer)
    timer = null
  }

  onScopeDispose(stop)
  return { start, stop, isActive: () => active }
}
