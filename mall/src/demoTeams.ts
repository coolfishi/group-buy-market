import { randomInt } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Pool } from 'mysql2/promise'
import type { Row } from './db.js'

/**
 * 演示拼团：让首页和商品页始终有几个“正在拼”的团。
 * 队伍直接写入拼团库，成员是已付款的演示用户；真实用户可以参团，补满后照常成团、回调商城。
 * 演示数据用 biz_id 前缀 demo_ 标记，过期一天后清理（有真实用户参与的队伍保留）。
 */

const TEAM_STOCK_KEY = 'group_buy_market_team_stock_key_'
const DEMO_BIZ_PREFIX = 'demo_'

// 演示用户名，脱敏后显示为“sa****27”这样
const NAMES = ['sakura', 'kaito', 'haruki', 'mio', 'ren', 'yuna', 'sora', 'akira', 'hinata', 'riku', 'nana', 'toma']

export interface ActivityCandidate {
  goodsId: string
  activityId: number
  target: number
  validTime: number
  activityStart: Date
  activityEnd: Date
  originalPrice: number
  marketPlan: string
  marketExpr: string
  openTeams: number
}

/** 与 Java 端四种优惠计算一致：直减、满减、折扣、N 元购；最低 0.01 */
export function payPriceOf(original: number, plan: string, expr: string): number {
  let pay = original
  if (plan === 'ZJ') pay = original - Number(expr)
  else if (plan === 'MJ') {
    const [x, y] = expr.split(',').map(Number)
    pay = original >= x ? original - y : original
  } else if (plan === 'ZK') pay = Math.floor(original * Number(expr))
  else if (plan === 'N') pay = Number(expr)
  return pay <= 0 ? 0.01 : Math.round(pay * 100) / 100
}

export interface TeamPlan {
  teamId: string
  members: string[]
  validStart: Date
  validEnd: Date
}

/** 规划一个演示队伍：1 到 target-1 个已付款成员，剩余时间在 40 分钟到拼团时长之间 */
export function planTeam(c: ActivityCandidate, now: Date, rnd: (min: number, max: number) => number = randomInt): TeamPlan {
  const count = rnd(1, c.target) // [1, target-1]
  const members = Array.from({ length: count }, () => `${NAMES[rnd(0, NAMES.length)]}${rnd(10, 100)}`)
  const remainMin = rnd(Math.min(40, c.validTime), c.validTime + 1)
  let validEnd = new Date(now.getTime() + remainMin * 60_000)
  if (validEnd > c.activityEnd) validEnd = c.activityEnd
  const validStart = new Date(validEnd.getTime() - c.validTime * 60_000)
  return { teamId: String(rnd(10_000_000, 100_000_000)), members, validStart, validEnd }
}

export interface DemoTeamDeps {
  gbmDb: Pool
  redis: Redis
  source: string
  channel: string
  internalBaseUrl: string
  minOpen: number
  log?: { info(o: unknown, m?: string): void; error(o: unknown, m?: string): void }
}

export function createDemoTeamKeeper(d: DemoTeamDeps) {
  const log = d.log ?? { info() {}, error() {} }
  const notifyUrl = `${d.internalBaseUrl}/api/v1/alipay/group_buy_notify`

  async function candidates(): Promise<ActivityCandidate[]> {
    const [rows] = await d.gbmDb.query<Row[]>(
      `SELECT b.goods_id, a.activity_id, a.target, a.valid_time, a.start_time, a.end_time,
              s.original_price, dc.market_plan, dc.market_expr,
              (SELECT COUNT(*) FROM group_buy_order o
                WHERE o.activity_id = a.activity_id AND o.status = 0 AND o.valid_end_time > NOW()
                  AND o.lock_count < o.target_count) open_teams
       FROM sc_sku_activity b
       JOIN group_buy_activity a ON a.activity_id = b.activity_id
       JOIN sku s ON s.goods_id = b.goods_id
       JOIN group_buy_discount dc ON dc.discount_id = a.discount_id
       WHERE b.source = ? AND b.channel = ? AND a.status = 1 AND a.start_time <= NOW() AND a.end_time > NOW()
         AND a.target >= 2 AND (a.tag_id IS NULL OR a.tag_id = '')`,
      [d.source, d.channel],
    )
    return rows.map((r) => ({
      goodsId: String(r.goods_id),
      activityId: Number(r.activity_id),
      target: Number(r.target),
      validTime: Number(r.valid_time),
      activityStart: new Date(r.start_time as Date),
      activityEnd: new Date(r.end_time as Date),
      originalPrice: Number(r.original_price),
      marketPlan: String(r.market_plan),
      marketExpr: String(r.market_expr),
      openTeams: Number(r.open_teams),
    }))
  }

  async function createTeam(c: ActivityCandidate, now: Date) {
    const plan = planTeam(c, now)
    const pay = payPriceOf(c.originalPrice, c.marketPlan, c.marketExpr)
    const deduction = Math.round((c.originalPrice - pay) * 100) / 100
    const conn = await d.gbmDb.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `INSERT INTO group_buy_order (team_id, activity_id, source, channel, original_price, deduction_price, pay_price,
           target_count, complete_count, lock_count, status, valid_start_time, valid_end_time, notify_type, notify_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'HTTP', ?)`,
        [plan.teamId, c.activityId, d.source, d.channel, c.originalPrice, deduction, pay, c.target,
          plan.members.length, plan.members.length, plan.validStart, plan.validEnd, notifyUrl],
      )
      for (const [i, userId] of plan.members.entries()) {
        const orderNo = 'D' + String(randomInt(0, 1e11)).padStart(11, '0')
        const paidAt = new Date(plan.validStart.getTime() + (i + 1) * randomInt(1, 8) * 60_000)
        await conn.query(
          `INSERT INTO group_buy_order_list (user_id, team_id, order_id, activity_id, start_time, end_time, goods_id, source, channel,
             original_price, deduction_price, pay_price, status, out_trade_no, out_trade_time, biz_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [userId, plan.teamId, orderNo, c.activityId, c.activityStart, c.activityEnd, c.goodsId, d.source, d.channel,
            c.originalPrice, deduction, pay, orderNo, paidAt < now ? paidAt : now, `${DEMO_BIZ_PREFIX}${plan.teamId}_${i}`],
        )
      }
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
    // 拼团服务按“团长之外已占名额”计数，真实用户参团时从这里继续 incr
    const ttl = c.validTime * 60 + 3600
    await d.redis.set(`${TEAM_STOCK_KEY}${c.activityId}_${plan.teamId}`, String(plan.members.length - 1), 'EX', ttl)
    log.info({ teamId: plan.teamId, goodsId: c.goodsId, members: plan.members.length, target: c.target }, '创建演示拼团')
  }

  return {
    /** 进行中的可参团队伍少于 minOpen 时补足；优先补给开团最少的商品 */
    async ensure(now = new Date()) {
      if (d.minOpen <= 0) return 0
      const list = await candidates()
      if (!list.length) return 0
      let open = list.reduce((s, c) => s + c.openTeams, 0)
      let created = 0
      while (open < d.minOpen && created < d.minOpen) {
        list.sort((a, b) => a.openTeams - b.openTeams || Math.random() - 0.5)
        const c = list[0]
        await createTeam(c, now)
        c.openTeams += 1
        open += 1
        created += 1
      }
      return created
    },

    /** 清理过期一天以上、且没有真实用户参与的演示队伍 */
    async cleanup() {
      const [rows] = await d.gbmDb.query<Row[]>(
        `SELECT DISTINCT l.team_id FROM group_buy_order_list l
         JOIN group_buy_order o ON o.team_id = l.team_id
         WHERE l.biz_id LIKE 'demo\\_%' AND o.valid_end_time < DATE_SUB(NOW(), INTERVAL 1 DAY)
           AND NOT EXISTS (SELECT 1 FROM group_buy_order_list r WHERE r.team_id = l.team_id AND r.biz_id NOT LIKE 'demo\\_%')
         LIMIT 200`,
      )
      const ids = rows.map((r) => String(r.team_id))
      if (!ids.length) return 0
      await d.gbmDb.query('DELETE FROM group_buy_order_list WHERE team_id IN (?)', [ids])
      await d.gbmDb.query('DELETE FROM notify_task WHERE team_id IN (?)', [ids])
      await d.gbmDb.query('DELETE FROM group_buy_order WHERE team_id IN (?)', [ids])
      return ids.length
    },

    /** 首页“正在拼团”：所有进行中、未满员的队伍 */
    async listOpen(limit: number) {
      const [rows] = await d.gbmDb.query<Row[]>(
        `SELECT o.team_id, o.activity_id, o.target_count, o.lock_count, o.complete_count, o.valid_end_time,
                (SELECT l.goods_id FROM group_buy_order_list l WHERE l.team_id = o.team_id ORDER BY l.id LIMIT 1) goods_id,
                (SELECT l.user_id FROM group_buy_order_list l WHERE l.team_id = o.team_id ORDER BY l.id LIMIT 1) owner_id
         FROM group_buy_order o
         JOIN group_buy_activity a ON a.activity_id = o.activity_id AND a.status = 1
         WHERE o.status = 0 AND o.valid_end_time > DATE_ADD(NOW(), INTERVAL 2 MINUTE) AND o.lock_count < o.target_count
           AND o.source = ? AND o.channel = ?
         ORDER BY (o.lock_count / o.target_count) DESC, o.valid_end_time ASC
         LIMIT ?`,
        [d.source, d.channel, Math.min(Math.max(limit, 1), 20)],
      )
      return rows
        .filter((r) => r.goods_id)
        .map((r) => ({
          teamId: String(r.team_id),
          productId: String(r.goods_id),
          activityId: Number(r.activity_id),
          targetCount: Number(r.target_count),
          lockCount: Number(r.lock_count),
          completeCount: Number(r.complete_count),
          validEndTime: new Date(r.valid_end_time as Date).getTime(),
          ownerLabel: mask(String(r.owner_id ?? '')),
        }))
    },
  }
}

function mask(id: string) {
  if (id.length <= 4) return id
  return `${id.slice(0, 2)}${'*'.repeat(Math.min(id.length - 4, 4))}${id.slice(-2)}`
}

export type DemoTeamKeeper = ReturnType<typeof createDemoTeamKeeper>
