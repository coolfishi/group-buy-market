import type { Redis } from 'ioredis'
import type { Pool, ResultSetHeader } from 'mysql2/promise'
import type { Row } from '../db.js'
import type { GbmClient } from '../gbm.js'
import { MallError } from '../orders.js'
import { Check, checkMarketExpr } from './validate.js'

const ACTIVITY_CACHE = 'group_buy_market_cn.bugstack.infrastructure.dao.po.GroupBuyActivity_'
const DISCOUNT_CACHE = 'group_buy_market_cn.bugstack.infrastructure.dao.po.GroupBuyDiscount_'
const DCC_PREFIX = 'group-buy-market_'

/** 动态配置项：键名与 Java 端 DCCService / 限流组件一致 */
export const DCC_ITEMS = [
  { key: 'downgradeSwitch', label: '降级开关', kind: 'switch', on: '1', off: '0', hint: '开启后拼团试算直接拒绝，用于故障时保护系统' },
  { key: 'cutRange', label: '切量比例', kind: 'range', hint: '0 到 100，用户 ID 哈希落在比例内才能参与拼团' },
  { key: 'scBlacklist', label: '渠道黑名单', kind: 'text', hint: '渠道加来源拼接，逗号分隔，例如 s02c02' },
  { key: 'cacheSwitch', label: '活动配置缓存', kind: 'switch', on: '0', off: '1', hint: '开启时活动和优惠配置走 Redis 缓存' },
  { key: 'rateLimiterSwitch', label: '接口限流', kind: 'switch', on: 'open', off: 'close', hint: '拼团查询接口按用户每秒 1 次' },
] as const

type Paged = { page?: unknown; pageSize?: unknown }

function paging(q: Paged) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export interface AdminDeps {
  gbmDb: Pool
  mallDb: Pool
  redis: Redis
  gbm: GbmClient
  internalBaseUrl: string
  source: string
  channel: string
}

export function createAdminService(d: AdminDeps) {
  const { gbmDb, mallDb, redis } = d

  async function count(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
    const [rows] = await pool.query<Row[]>(sql, params)
    return Number(rows[0]?.c ?? 0)
  }

  async function page(pool: Pool, base: string, where: string[], params: unknown[], order: string, q: Paged) {
    const { page, pageSize, offset } = paging(q)
    const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = await count(pool, `SELECT COUNT(*) c FROM (${base} ${w}) t`, params)
    const [rows] = await pool.query<Row[]>(`${base} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, pageSize, offset])
    return { total, page, pageSize, list: rows }
  }

  async function evictActivity(activityId: number) {
    await redis.del(ACTIVITY_CACHE + activityId)
  }

  return {
    async overview() {
      // 状态 0 但已过截止时间的队伍视为超时（拼团服务的超时任务只处理未付款锁单）
      const [teamRows] = await gbmDb.query<Row[]>(
        "SELECT IF(status = 0 AND valid_end_time <= NOW(), 'timeout', status) s, COUNT(*) c FROM group_buy_order GROUP BY s",
      )
      const teams = Object.fromEntries(teamRows.map((r) => [String(r.s), Number(r.c)]))
      const [orderRows] = await mallDb.query<Row[]>(
        `SELECT status, COUNT(*) c, COALESCE(SUM(pay_amount), 0) amount FROM pay_order
         WHERE order_time >= CURDATE() GROUP BY status`,
      )
      const today = Object.fromEntries(orderRows.map((r) => [String(r.status), { count: Number(r.c), amount: Number(r.amount) }]))
      return {
        skuCount: await count(gbmDb, 'SELECT COUNT(*) c FROM sku'),
        activeActivityCount: await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_activity WHERE status = 1 AND end_time > NOW()'),
        teams: {
          ongoing: teams['0'] ?? 0,
          complete: (teams['1'] ?? 0) + (teams['3'] ?? 0),
          failed: (teams['2'] ?? 0) + (teams.timeout ?? 0),
        },
        todayOrders: today,
        pendingRefunds: await count(mallDb, "SELECT COUNT(*) c FROM pay_order WHERE status = 'WAIT_REFUND'"),
        failedNotifies: await count(gbmDb, 'SELECT COUNT(*) c FROM notify_task WHERE notify_status = 3'),
        dcc: await this.dcc(),
      }
    },

    // ---------- 商品 ----------
    async listSkus() {
      const [rows] = await gbmDb.query<Row[]>(
        `SELECT s.id, s.goods_id, s.goods_name, s.original_price, s.source, s.channel, s.update_time,
                b.activity_id, a.activity_name
         FROM sku s
         LEFT JOIN sc_sku_activity b ON b.goods_id = s.goods_id AND b.source = s.source AND b.channel = s.channel
         LEFT JOIN group_buy_activity a ON a.activity_id = b.activity_id
         ORDER BY s.id DESC`,
      )
      return rows
    },

    async saveSku(body: Record<string, unknown>, existingGoodsId?: string) {
      const c = new Check(body)
      const goodsId = existingGoodsId ?? c.str('goodsId', '商品 ID', { max: 16, pattern: /^[A-Za-z0-9_-]+$/, patternHint: '只能用字母、数字、横线和下划线' })
      const goodsName = c.str('goodsName', '商品名称', { max: 128 })
      const price = c.money('originalPrice', '商品价格')
      const activityRaw = body.activityId
      const activityId = activityRaw === '' || activityRaw === null || activityRaw === undefined ? null : Number(activityRaw)
      if (activityId !== null) {
        const exists = await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_activity WHERE activity_id = ?', [activityId])
        if (!exists) throw new MallError('0002', '绑定的拼团活动不存在。', 400)
      }
      if (existingGoodsId) {
        const [res] = await gbmDb.query<ResultSetHeader>('UPDATE sku SET goods_name = ?, original_price = ? WHERE goods_id = ?', [goodsName, price, goodsId])
        if (!res.affectedRows) throw new MallError('NOT_FOUND', '商品不存在。', 404)
      } else {
        const dup = await count(gbmDb, 'SELECT COUNT(*) c FROM sku WHERE goods_id = ?', [goodsId])
        if (dup) throw new MallError('0002', '商品 ID 已存在。', 400)
        await gbmDb.query('INSERT INTO sku (source, channel, goods_id, goods_name, original_price) VALUES (?, ?, ?, ?, ?)', [d.source, d.channel, goodsId, goodsName, price])
      }
      // 商品与活动的绑定（按当前渠道）
      if (activityId === null) {
        await gbmDb.query('DELETE FROM sc_sku_activity WHERE source = ? AND channel = ? AND goods_id = ?', [d.source, d.channel, goodsId])
      } else {
        await gbmDb.query(
          `INSERT INTO sc_sku_activity (source, channel, activity_id, goods_id) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE activity_id = VALUES(activity_id)`,
          [d.source, d.channel, activityId, goodsId],
        )
      }
      return { goodsId }
    },

    async deleteSku(goodsId: string) {
      const used = await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_order_list WHERE goods_id = ?', [goodsId])
      if (used) throw new MallError('0002', '这件商品已有拼团订单，不能删除。可以解除活动绑定让它停止拼团。', 400)
      await gbmDb.query('DELETE FROM sc_sku_activity WHERE goods_id = ?', [goodsId])
      await gbmDb.query('DELETE FROM sku WHERE goods_id = ?', [goodsId])
    },

    // ---------- 优惠 ----------
    async listDiscounts() {
      const [rows] = await gbmDb.query<Row[]>(
        `SELECT d.*, (SELECT COUNT(*) FROM group_buy_activity a WHERE a.discount_id = d.discount_id) activity_count
         FROM group_buy_discount d ORDER BY d.id DESC`,
      )
      return rows
    },

    async saveDiscount(body: Record<string, unknown>, existingId?: string) {
      const c = new Check(body)
      const name = c.str('discountName', '优惠名称', { max: 64 })
      const desc = c.str('discountDesc', '优惠说明', { max: 256, required: false }) || name
      const plan = c.oneOf('marketPlan', '优惠方式', ['ZJ', 'MJ', 'ZK', 'N'] as const)
      const expr = checkMarketExpr(plan, c.str('marketExpr', '优惠规则', { max: 32 }))
      let discountId = existingId
      if (existingId) {
        const [res] = await gbmDb.query<ResultSetHeader>(
          'UPDATE group_buy_discount SET discount_name = ?, discount_desc = ?, market_plan = ?, market_expr = ? WHERE discount_id = ?',
          [name, desc, plan, expr, existingId],
        )
        if (!res.affectedRows) throw new MallError('NOT_FOUND', '优惠不存在。', 404)
        await redis.del(DISCOUNT_CACHE + existingId)
      } else {
        discountId = await nextId(gbmDb, 'group_buy_discount', 'discount_id', 8)
        await gbmDb.query(
          'INSERT INTO group_buy_discount (discount_id, discount_name, discount_desc, discount_type, market_plan, market_expr) VALUES (?, ?, ?, 0, ?, ?)',
          [discountId, name, desc, plan, expr],
        )
      }
      return { discountId }
    },

    async deleteDiscount(discountId: string) {
      const used = await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_activity WHERE discount_id = ?', [discountId])
      if (used) throw new MallError('0002', '还有活动在用这条优惠，不能删除。', 400)
      await gbmDb.query('DELETE FROM group_buy_discount WHERE discount_id = ?', [discountId])
      await redis.del(DISCOUNT_CACHE + discountId)
    },

    // ---------- 活动 ----------
    async listActivities() {
      const [rows] = await gbmDb.query<Row[]>(
        `SELECT a.*, d.discount_name, d.market_plan, d.market_expr,
                (SELECT COUNT(*) FROM sc_sku_activity b WHERE b.activity_id = a.activity_id) sku_count,
                (SELECT COUNT(*) FROM group_buy_order o WHERE o.activity_id = a.activity_id) team_count
         FROM group_buy_activity a LEFT JOIN group_buy_discount d ON d.discount_id = a.discount_id
         ORDER BY a.id DESC`,
      )
      return rows
    },

    async saveActivity(body: Record<string, unknown>, existingId?: number) {
      const c = new Check(body)
      const name = c.str('activityName', '活动名称', { max: 128 })
      const discountId = c.str('discountId', '优惠', { max: 8 })
      if (!(await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_discount WHERE discount_id = ?', [discountId]))) {
        throw new MallError('0002', '选择的优惠不存在。', 400)
      }
      const groupType = c.oneOf('groupType', '成团方式', [0, 1] as const)
      const takeLimit = c.int('takeLimitCount', '每人参与次数', 1, 100)
      const target = c.int('target', '成团人数', 1, 20)
      const validTime = c.int('validTime', '拼团时长', 1, 7 * 24 * 60)
      const status = c.oneOf('status', '活动状态', [0, 1, 2, 3] as const)
      const start = c.date('startTime', '开始时间')
      const end = c.date('endTime', '结束时间')
      if (end <= start) throw new MallError('0002', '结束时间要晚于开始时间。', 400)
      const values = [name, discountId, groupType, takeLimit, target, validTime, status, start, end]
      if (existingId) {
        const [res] = await gbmDb.query<ResultSetHeader>(
          `UPDATE group_buy_activity SET activity_name = ?, discount_id = ?, group_type = ?, take_limit_count = ?, target = ?,
           valid_time = ?, status = ?, start_time = ?, end_time = ? WHERE activity_id = ?`,
          [...values, existingId],
        )
        if (!res.affectedRows) throw new MallError('NOT_FOUND', '活动不存在。', 404)
        await evictActivity(existingId)
        return { activityId: existingId }
      }
      const activityId = Number(await nextId(gbmDb, 'group_buy_activity', 'activity_id', 6))
      await gbmDb.query(
        `INSERT INTO group_buy_activity (activity_id, activity_name, discount_id, group_type, take_limit_count, target, valid_time, status, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [activityId, ...values],
      )
      return { activityId }
    },

    async deleteActivity(activityId: number) {
      if (await count(gbmDb, 'SELECT COUNT(*) c FROM group_buy_order WHERE activity_id = ?', [activityId])) {
        throw new MallError('0002', '活动已有拼团记录，不能删除。可以把状态改为“废弃”。', 400)
      }
      await gbmDb.query('DELETE FROM sc_sku_activity WHERE activity_id = ?', [activityId])
      await gbmDb.query('DELETE FROM group_buy_activity WHERE activity_id = ?', [activityId])
      await evictActivity(activityId)
    },

    // ---------- 监控 ----------
    async listTeams(q: Paged & { status?: string; keyword?: string }) {
      const where: string[] = []
      const params: unknown[] = []
      if (q.status === 'timeout') {
        where.push('o.status = 0 AND o.valid_end_time <= NOW()')
      } else if (q.status === '0') {
        where.push('o.status = 0 AND o.valid_end_time > NOW()')
      } else if (q.status !== undefined && q.status !== '') {
        where.push('o.status = ?')
        params.push(Number(q.status))
      }
      if (q.keyword) {
        where.push('(o.team_id = ? OR o.activity_id = ?)')
        params.push(q.keyword, q.keyword)
      }
      return page(
        gbmDb,
        `SELECT o.id, o.team_id, o.activity_id, a.activity_name, o.target_count, o.lock_count, o.complete_count, o.status,
                o.pay_price, o.valid_start_time, o.valid_end_time, o.notify_type, o.create_time
         FROM group_buy_order o LEFT JOIN group_buy_activity a ON a.activity_id = o.activity_id`,
        where,
        params,
        'o.id DESC',
        q,
      )
    },

    async teamMembers(teamId: string) {
      const [rows] = await gbmDb.query<Row[]>(
        `SELECT user_id, order_id, goods_id, pay_price, status, out_trade_no, out_trade_time, create_time
         FROM group_buy_order_list WHERE team_id = ? ORDER BY id`,
        [teamId],
      )
      return rows
    },

    async listOrders(q: Paged & { status?: string; keyword?: string }) {
      const where: string[] = []
      const params: unknown[] = []
      if (q.status) {
        where.push('status = ?')
        params.push(q.status)
      }
      if (q.keyword) {
        where.push('(order_id = ? OR user_id = ? OR product_id = ? OR team_id = ?)')
        params.push(q.keyword, q.keyword, q.keyword, q.keyword)
      }
      return page(
        mallDb,
        `SELECT id, order_id, user_id, product_id, product_name, order_time, total_amount, pay_amount, market_type,
                market_deduction, activity_id, team_id, status, pay_time, trade_no, settle_status, close_reason, refund_time
         FROM pay_order`,
        where,
        params,
        'id DESC',
        q,
      )
    },

    // ---------- 动态配置 ----------
    async dcc() {
      const values = await redis.mget(DCC_ITEMS.map((i) => DCC_PREFIX + i.key))
      return DCC_ITEMS.map((item, i) => {
        let value: string | null = values[i]
        if (value !== null) {
          try {
            value = String(JSON.parse(value))
          } catch {
            /* 原样返回 */
          }
        }
        return { ...item, value }
      })
    },

    async updateDcc(key: string, value: string) {
      const item = DCC_ITEMS.find((i) => i.key === key)
      if (!item) throw new MallError('0002', '未知的配置项。', 400)
      const v = String(value ?? '').trim()
      if (item.kind === 'switch' && v !== item.on && v !== item.off) throw new MallError('0002', '开关取值不正确。', 400)
      if (item.kind === 'range' && !(/^\d+$/.test(v) && Number(v) <= 100)) throw new MallError('0002', '切量比例应为 0 到 100 的整数。', 400)
      if (item.kind === 'text' && (v.length > 256 || !/^[A-Za-z0-9,]*$/.test(v))) throw new MallError('0002', '黑名单只能包含字母、数字和逗号。', 400)
      await d.gbm.updateDcc(key, v)
    },

    // ---------- 通知任务 ----------
    async listNotifyTasks(q: Paged & { status?: string }) {
      const where: string[] = []
      const params: unknown[] = []
      if (q.status !== undefined && q.status !== '') {
        where.push('notify_status = ?')
        params.push(Number(q.status))
      }
      return page(
        gbmDb,
        `SELECT id, activity_id, team_id, notify_category, notify_type, notify_mq, notify_url, notify_count, notify_status,
                parameter_json, uuid, create_time, update_time FROM notify_task`,
        where,
        params,
        'id DESC',
        q,
      )
    },

    /** HTTP 回调立即重发；MQ 任务改回“待重试”，由拼团服务的通知任务发送 */
    async retryNotifyTask(id: number) {
      const [rows] = await gbmDb.query<Row[]>('SELECT * FROM notify_task WHERE id = ?', [id])
      const task = rows[0]
      if (!task) throw new MallError('NOT_FOUND', '通知任务不存在。', 404)
      if (Number(task.notify_status) === 1) throw new MallError('0002', '这条通知已经成功，不需要重发。', 400)
      if (task.notify_type !== 'HTTP') {
        await gbmDb.query('UPDATE notify_task SET notify_status = 2 WHERE id = ?', [id])
        return { result: 'queued' as const }
      }
      const url = String(task.notify_url ?? '')
      if (!url.startsWith(d.internalBaseUrl + '/')) throw new MallError('0002', '只能重发到本商城的回调地址。', 400)
      let ok = false
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: String(task.parameter_json),
          signal: AbortSignal.timeout(8000),
        })
        ok = (await res.text()).trim() === 'success'
      } catch {
        ok = false
      }
      await gbmDb.query('UPDATE notify_task SET notify_count = notify_count + 1, notify_status = ? WHERE id = ?', [ok ? 1 : 2, id])
      return { result: ok ? ('success' as const) : ('failed' as const) }
    },
  }
}

/** 生成下一个数字 ID（按现有最大值递增，位数不足时补齐） */
async function nextId(pool: Pool, table: string, column: string, digits: number): Promise<string> {
  const [rows] = await pool.query<Row[]>(`SELECT MAX(CAST(${column} AS UNSIGNED)) m FROM ${table}`)
  const max = Number(rows[0]?.m ?? 0)
  const base = 10 ** (digits - 1)
  return String(Math.max(max + 1, base))
}

export type AdminService = ReturnType<typeof createAdminService>
