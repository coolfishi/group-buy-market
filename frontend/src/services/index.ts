import { appConfig } from '@/config/env'
import type { Order } from '@/types'
import { demoEndpointOf } from '@/xray/mechanisms'
import { observeOrders } from '@/xray/serverEvents'
import { recordEnd, recordStart } from '@/xray/trace'
import { createDemoApi } from './demo/demoApi'
import { ApiError } from './http'
import { createLiveApi } from './live/liveApi'
import type { ShopApi } from './types'

const demo = appConfig.mode === 'demo' ? createDemoApi({ storage: window.localStorage }) : null

/**
 * 透视模式的旁路：演示模式把每次调用记成“模拟请求”（真实模式由 http.ts 记录真实请求），
 * 两种模式都从返回的订单里推断付款到账、成团、自动退款等服务端事件。不改变任何返回值。
 */
export function withXray(inner: ShopApi): ShopApi {
  const isDemo = inner.mode === 'demo'
  const eventSource = isDemo ? 'demo' : 'server'

  function ordersIn(result: unknown): Order[] {
    if (!result || typeof result !== 'object') return []
    const r = result as { orders?: Order[]; order?: Order; orderId?: string; status?: string }
    if (Array.isArray(r.orders)) return r.orders
    if (r.order) return [r.order]
    if (r.orderId && r.status) return [r as Order]
    return []
  }

  const wrapped = { ...inner } as ShopApi
  for (const key of Object.keys(demoEndpointOf) as (keyof ShopApi)[]) {
    const fn = inner[key]
    if (typeof fn !== 'function') continue
    ;(wrapped as unknown as Record<string, unknown>)[key] = async (...args: unknown[]) => {
      const id = isDemo
        ? recordStart({ source: 'demo', endpoint: demoEndpointOf[key], method: String(key), request: args.slice(1) })
        : null
      try {
        const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(inner, args)
        recordEnd(id, { ok: true, response: result })
        observeOrders(ordersIn(result), eventSource)
        return result
      } catch (e) {
        recordEnd(id, { ok: false, code: e instanceof ApiError ? (e.code ?? e.kind) : 'error', response: e instanceof Error ? e.message : undefined })
        throw e
      }
    }
  }
  return wrapped
}

export const api: ShopApi = withXray(demo ?? createLiveApi(appConfig))

/** 仅演示模式可用：清空本地演示数据 */
export function resetDemoData() {
  demo?.reset()
}

export { ApiError, errorMessage, isApiError } from './http'
