import { reactive, ref } from 'vue'

/**
 * 透视模式的追踪总线：记录前端发出的每次调用（真实请求或演示模拟）
 * 以及从订单状态变化推断出的服务端事件，供透视面板展示。
 * 开关关闭时不记录任何内容。
 */

export type TraceSource = 'live' | 'demo' | 'server'
export type TraceStatus = 'pending' | 'ok' | 'error'

export interface TraceEntry {
  id: number
  at: number
  source: TraceSource
  /** 机制目录里的键，一般是接口名，例如 lock_market_pay_order */
  endpoint: string
  method: string
  status: TraceStatus
  durationMs?: number
  /** 业务码或 HTTP 状态 */
  code?: string
  request?: unknown
  response?: unknown
  /** 服务端事件的补充说明，例如订单号和状态变化 */
  detail?: string
  /** 连续重复的轮询请求合并成一条，这里记次数 */
  repeat?: number
}

const MAX_ENTRIES = 100
/** 同一接口在这个间隔内重复调用（轮询）时合并为一条 */
const MERGE_WINDOW_MS = 15_000
const STORAGE_KEY = 'toyspace.xray'

function readStored(): boolean {
  try {
    if (typeof window === 'undefined') return false
    // 通过 ?xray=1 链接打开时记住，之后在站内跳转、刷新都保持开启
    if (new URLSearchParams(window.location.search).get('xray') === '1') {
      window.localStorage.setItem(STORAGE_KEY, '1')
      return true
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const xrayEnabled = ref(readStored())
export const entries = reactive<TraceEntry[]>([])
let seq = 0

export function setXray(on: boolean) {
  xrayEnabled.value = on
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* 隐私模式等情况下存不了，只影响刷新后是否保持 */
  }
}

export function clearTrace() {
  entries.splice(0, entries.length)
}

/** 开始一条记录；开关关闭时返回 null，调用方据此跳过后续记录 */
export function recordStart(e: Pick<TraceEntry, 'source' | 'endpoint' | 'method'> & { request?: unknown }): number | null {
  if (!xrayEnabled.value) return null
  const last = entries[0]
  if (
    last &&
    last.method !== 'EVENT' &&
    last.status !== 'pending' &&
    last.endpoint === e.endpoint &&
    last.source === e.source &&
    Date.now() - last.at < MERGE_WINDOW_MS
  ) {
    Object.assign(last, { at: Date.now(), status: 'pending', repeat: (last.repeat ?? 1) + 1, request: redact(e.request) })
    return last.id
  }
  const entry: TraceEntry = { id: ++seq, at: Date.now(), status: 'pending', ...e, request: redact(e.request) }
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES)
  return entry.id
}

export function recordEnd(id: number | null, result: { ok: boolean; code?: string; response?: unknown }) {
  if (id === null) return
  const entry = entries.find((x) => x.id === id)
  if (!entry) return
  entry.status = result.ok ? 'ok' : 'error'
  entry.durationMs = Date.now() - entry.at
  entry.code = result.code
  entry.response = redact(result.response)
}

/** 一次性事件（服务端推断事件） */
export function recordEvent(e: Pick<TraceEntry, 'source' | 'endpoint' | 'detail'>) {
  const id = recordStart({ ...e, method: 'EVENT' })
  if (id === null) return
  const entry = entries.find((x) => x.id === id)
  if (entry) Object.assign(entry, { status: 'ok', detail: e.detail })
}

// ---------------- 脱敏 ----------------

const SECRET_KEYS = /^(authorization|token|password|sign|ticket|app_cert_sn|alipay_root_cert_sn)$/i
const USER_KEYS = /^(userId|openid|user_id|buyer_id)$/i
const MAX_STRING = 120
const MAX_ARRAY = 8

export function maskId(id: string): string {
  if (id.length <= 4) return '****'
  return `${id.slice(0, 2)}****${id.slice(-2)}`
}

/** 深拷贝并脱敏：去掉令牌和签名，用户标识打码，支付表单只留网关和字段名，长字符串截断 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value
  if (depth > 4) return '…'
  if (typeof value === 'string') {
    if (/<form[\s>]/i.test(value)) return summarizeForm(value)
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…（共 ${value.length} 字）` : value
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1))
    return value.length > MAX_ARRAY ? [...head, `…另有 ${value.length - MAX_ARRAY} 项`] : head
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(k)) out[k] = '（已隐藏）'
    else if (USER_KEYS.test(k) && typeof v === 'string') out[k] = maskId(v)
    else if (k === 'form' && typeof v === 'string') out[k] = summarizeForm(v)
    else out[k] = redact(v, depth + 1)
  }
  return out
}

/** 支付表单只保留提交地址和字段名，不展示签名与业务参数的值 */
function summarizeForm(html: string): string {
  const action = /action="([^"?]*)/i.exec(html)?.[1] ?? '未知地址'
  const names = [...html.matchAll(/name="([^"]+)"/gi)].map((m) => m[1]).filter((n) => n !== 'punchout_form')
  return `支付表单 → ${action}（字段：${names.join('、') || '无'}，值已隐藏）`
}
