import type { PayForm } from '@/types'
import { ApiError } from '../http'

/**
 * 解析支付商城返回的支付表单 HTML。
 * 使用 DOMParser 解析为惰性文档，其中的 <script> 不会执行；
 * 只接受 action 属于允许列表的表单。
 */
export function parsePayForm(html: string, allowedOrigins: string[]): PayForm {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new ApiError('business', '支付服务没有返回支付信息，请稍后重试。', 'PAY_FORM_EMPTY')
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('form')
  if (!form) throw new ApiError('business', '支付信息格式无法识别，请稍后重试。', 'PAY_FORM_INVALID')

  const rawAction = form.getAttribute('action') ?? ''
  let action: URL
  try {
    action = new URL(rawAction)
  } catch {
    throw new ApiError('business', '支付地址无效，已停止跳转。', 'PAY_FORM_ACTION')
  }
  if (action.protocol !== 'https:' && action.protocol !== 'http:') {
    throw new ApiError('business', '支付地址无效，已停止跳转。', 'PAY_FORM_ACTION')
  }
  const allowed = allowedOrigins.map((o) => {
    try {
      return new URL(o).origin
    } catch {
      return ''
    }
  })
  if (!allowed.includes(action.origin)) {
    throw new ApiError('business', '支付地址不在允许列表中，已停止跳转。', 'PAY_FORM_ORIGIN')
  }

  const method = (form.getAttribute('method') ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
  const fields: [string, string][] = []
  form.querySelectorAll('input, textarea').forEach((el) => {
    const name = el.getAttribute('name')
    if (!name) return
    const value = el instanceof HTMLTextAreaElement ? el.value || el.textContent || '' : el.getAttribute('value') ?? ''
    fields.push([name, value])
  })
  return { action: action.toString(), method, fields }
}

/** 由前端重新构建表单并提交，不插入原始 HTML */
export function submitPayForm(payForm: PayForm, target?: string) {
  const form = document.createElement('form')
  form.method = payForm.method
  form.action = payForm.action
  form.acceptCharset = 'utf-8'
  form.style.display = 'none'
  if (target) form.target = target
  for (const [name, value] of payForm.fields) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}
