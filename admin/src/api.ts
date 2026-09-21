import { reactive } from 'vue'

const TOKEN_KEY = 'toyspace.admin.token'

export const session = reactive({
  token: read(),
  username: '',
})

function read(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string, username: string) {
  session.token = token
  session.username = username
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 仅内存保存 */
  }
}

export function clearToken() {
  session.token = ''
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

let onUnauthorized: () => void = () => {}
export function handleUnauthorized(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/admin${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    throw new AdminError(e instanceof DOMException && e.name === 'TimeoutError' ? '请求超时，请重试。' : '无法连接服务，请检查网络。', 0)
  }
  let payload: { code?: string; info?: string; data?: T } = {}
  try {
    payload = await res.json()
  } catch {
    /* 非 JSON 响应 */
  }
  if (res.status === 401 && path !== '/login') {
    clearToken()
    onUnauthorized()
    throw new AdminError('登录已失效，请重新登录。', 401)
  }
  if (!res.ok || payload.code !== '0000') throw new AdminError(payload.info ?? `请求失败（${res.status}）`, res.status)
  return payload.data as T
}

export interface Page<T> {
  total: number
  page: number
  pageSize: number
  list: T[]
}

export function fmtTime(v: unknown): string {
  if (!v) return '—'
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtMoney(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? `¥${n.toFixed(2)}` : '—'
}

/** datetime-local 输入框的值 */
export function toLocalInput(v: unknown): string {
  const d = v ? new Date(v as string) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
