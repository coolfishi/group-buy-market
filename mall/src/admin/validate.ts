import { MallError } from '../orders.js'

/** 管理接口的入参校验，失败时返回可直接展示的中文提示 */
export class Check {
  constructor(private readonly body: Record<string, unknown>) {}

  private fail(msg: string): never {
    throw new MallError('0002', msg, 400)
  }

  str(key: string, label: string, opts: { max: number; required?: boolean; pattern?: RegExp; patternHint?: string }): string {
    const raw = this.body[key]
    const v = raw === undefined || raw === null ? '' : String(raw).trim()
    if (!v) {
      if (opts.required === false) return ''
      this.fail(`请填写${label}。`)
    }
    if (v.length > opts.max) this.fail(`${label}不能超过 ${opts.max} 个字符。`)
    if (opts.pattern && !opts.pattern.test(v)) this.fail(`${label}格式不正确${opts.patternHint ? `：${opts.patternHint}` : ''}。`)
    return v
  }

  int(key: string, label: string, min: number, max: number): number {
    const v = Number(this.body[key])
    if (!Number.isInteger(v) || v < min || v > max) this.fail(`${label}应为 ${min} 到 ${max} 之间的整数。`)
    return v
  }

  money(key: string, label: string): number {
    const v = Number(this.body[key])
    if (!Number.isFinite(v) || v <= 0 || v > 99_999_999) this.fail(`${label}应大于 0。`)
    if (Math.round(v * 100) !== v * 100) this.fail(`${label}最多两位小数。`)
    return v
  }

  oneOf<T extends string | number>(key: string, label: string, values: readonly T[]): T {
    const raw = this.body[key]
    const hit = values.find((x) => String(x) === String(raw))
    if (hit === undefined) this.fail(`${label}取值不正确。`)
    return hit
  }

  date(key: string, label: string): Date {
    const raw = this.body[key]
    const d = new Date(typeof raw === 'number' ? raw : String(raw ?? ''))
    if (Number.isNaN(d.getTime())) this.fail(`请填写正确的${label}。`)
    return d
  }
}

/** 按优惠方式校验表达式，与 Java 端的计算逻辑对应 */
export function checkMarketExpr(plan: string, expr: string): string {
  const e = expr.trim()
  const num = (s: string) => /^\d+(\.\d{1,2})?$/.test(s) && Number(s) > 0
  switch (plan) {
    case 'ZJ':
      if (!num(e)) throw new MallError('0002', '直减金额应为大于 0 的数字，例如 20。', 400)
      return e
    case 'MJ': {
      const [x, y] = e.split(',').map((s) => s.trim())
      if (!x || !y || !num(x) || !num(y) || Number(y) >= Number(x)) {
        throw new MallError('0002', '满减应写成“满多少,减多少”，例如 100,10，且减免小于门槛。', 400)
      }
      return `${x},${y}`
    }
    case 'ZK': {
      const r = Number(e)
      if (!/^0?\.\d{1,2}$/.test(e) || r <= 0 || r >= 1) throw new MallError('0002', '折扣应为 0 到 1 之间的小数，例如 0.8 表示八折。', 400)
      return e
    }
    case 'N':
      if (!num(e)) throw new MallError('0002', 'N 元购价格应为大于 0 的数字，例如 9.9。', 400)
      return e
    default:
      throw new MallError('0002', '优惠方式取值不正确。', 400)
  }
}
