import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorMessage, request } from '@/services/http'

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('request', () => {
  it('成功时返回 data，并以 JSON 发送请求体', async () => {
    const fetch = mockFetch(async () => json({ code: '0000', info: '成功', data: { ok: 1 } }))
    await expect(request('/x', { body: { a: 1 }, timeoutMs: 1000 })).resolves.toEqual({ ok: 1 })
    const init = fetch.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
  })

  it('业务失败码转换为可读提示', async () => {
    mockFetch(async () => json({ code: 'E0006', info: '拼团组队完结，锁单量已达成' }))
    const err = await request<never>('/x', { timeoutMs: 1000 }).catch((e: ApiError) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('business')
    expect(err.code).toBe('E0006')
    expect(err.message).toContain('满员')
  })

  it('未知业务码使用后端 info', async () => {
    mockFetch(async () => json({ code: 'X9', info: '库存同步中' }))
    await expect(request('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'business', message: '库存同步中' })
  })

  it('限流码 0006 与 HTTP 429 归为 rate_limit', async () => {
    mockFetch(async () => json({ code: '0006', info: '接口限流' }))
    await expect(request('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'rate_limit' })
    mockFetch(async () => new Response('', { status: 429 }))
    await expect(request('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'rate_limit' })
  })

  it('401/403 视为登录失效', async () => {
    mockFetch(async () => new Response('', { status: 401 }))
    const err = await request<never>('/x', { timeoutMs: 1000 }).catch((e: ApiError) => e)
    expect(err.kind).toBe('unauthorized')
    expect(errorMessage(err)).toContain('重新登录')
  })

  it('超时后中止请求', async () => {
    vi.useFakeTimers()
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = request<never>('/x', { timeoutMs: 500 }).catch((e: ApiError) => e)
    await vi.advanceTimersByTimeAsync(600)
    const err = await pending
    expect(err.kind).toBe('timeout')
    expect(errorMessage(err)).toContain('超时')
  })

  it('网络错误与 5xx', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(request('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'network' })
    mockFetch(async () => new Response('', { status: 502 }))
    await expect(request('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ kind: 'http', code: '502' })
  })

  it('GET 请求拼接查询参数', async () => {
    const fetch = mockFetch(async () => json({ code: '0000', data: 't' }))
    await request('/login', { method: 'GET', query: { sceneStr: 'A B' }, timeoutMs: 1000 })
    expect(fetch.mock.calls[0][0]).toBe('/login?sceneStr=A+B')
  })
})
