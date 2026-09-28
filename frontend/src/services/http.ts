import { endpointOf } from '@/xray/mechanisms'
import { recordEnd, recordStart } from '@/xray/trace'

export type ApiErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'business'
  | 'rate_limit'
  | 'unauthorized'
  | 'config'
  | 'not_purchasable'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly code?: string

  constructor(kind: ApiErrorKind, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = code
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

/** 面向用户的错误文案：说明发生了什么、下一步怎么做 */
export function errorMessage(e: unknown): string {
  if (!isApiError(e)) return '操作没有完成，请稍后重试。'
  switch (e.kind) {
    case 'timeout':
      return '请求超时，请检查网络后重试。'
    case 'network':
      return '无法连接服务，请检查网络后重试。'
    case 'rate_limit':
      return '操作太频繁，请等几秒再试。'
    case 'unauthorized':
      return '登录已失效，请重新登录。'
    case 'http':
      return `服务暂时不可用（${e.code ?? '未知状态'}），请稍后重试。`
    default:
      return e.message
  }
}

/** 后端 Response 结构 */
interface ApiResponse<T> {
  code: string
  info?: string
  data?: T
}

const SUCCESS = '0000'
const RATE_LIMITED = '0006'

// 后端 ResponseCode 中与用户相关的业务错误，转换为可理解的提示
const businessMessages: Record<string, string> = {
  '0002': '请求参数不完整，请刷新页面后重试。',
  E0002: '这件商品暂时没有拼团活动。',
  E0003: '拼团活动暂时关闭，请稍后再来。',
  E0004: '拼团活动暂未对你开放。',
  E0006: '这个拼团已满员，可以另开一团。',
  E0007: '你暂时不能参与这个拼团。',
  E0008: '拼团名额已抢完。',
  E0101: '拼团活动还没开始。',
  E0102: '拼团活动已结束。',
  E0103: '你参与这个拼团的次数已达上限。',
  E0104: '订单不存在或已退单。',
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  query?: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function request<T>(url: string, options: RequestOptions): Promise<T> {
  // 透视模式：旁路记录请求与结果，开关关闭时 traceId 为 null、不做任何记录
  const traceId = recordStart({
    source: 'live',
    endpoint: endpointOf(url),
    method: options.method ?? 'POST',
    request: { ...(options.query ?? {}), ...(isPlainObject(options.body) ? options.body : {}) },
  })
  try {
    const data = await send<T>(url, options)
    recordEnd(traceId, { ok: true, code: SUCCESS, response: data })
    return data
  } catch (e) {
    recordEnd(traceId, { ok: false, code: e instanceof ApiError ? (e.code ?? e.kind) : 'error', response: e instanceof Error ? e.message : undefined })
    throw e
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function send<T>(url: string, options: RequestOptions): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  const fullUrl = options.query ? `${url}?${new URLSearchParams(options.query).toString()}` : url

  let response: Response
  try {
    response = await fetch(fullUrl, {
      method: options.method ?? 'POST',
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    if (timedOut) throw new ApiError('timeout', '请求超时')
    if (options.signal?.aborted) throw e
    throw new ApiError('network', '网络连接失败')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError('unauthorized', '登录已失效', String(response.status))
  }
  if (response.status === 429) throw new ApiError('rate_limit', '接口限流', '429')
  if (!response.ok) throw new ApiError('http', `HTTP ${response.status}`, String(response.status))

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError('http', '响应格式错误', 'invalid-json')
  }

  if (payload.code === SUCCESS) return payload.data as T
  if (payload.code === RATE_LIMITED) throw new ApiError('rate_limit', '接口限流', payload.code)
  throw new ApiError(
    'business',
    businessMessages[payload.code] ?? payload.info ?? '操作没有完成，请稍后重试。',
    payload.code,
  )
}
