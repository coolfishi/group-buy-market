import type { Pool, ResultSetHeader } from 'mysql2/promise'
import type { Row } from './db.js'
import type { OrderStatus, OrderStore, PayOrder, TeamSnapshot } from './orders.js'

const columns: Record<keyof Omit<PayOrder, 'id'>, string> = {
  orderId: 'order_id',
  userId: 'user_id',
  productId: 'product_id',
  productName: 'product_name',
  orderTime: 'order_time',
  totalAmount: 'total_amount',
  payAmount: 'pay_amount',
  marketType: 'market_type',
  marketDeduction: 'market_deduction',
  activityId: 'activity_id',
  teamId: 'team_id',
  status: 'status',
  payForm: 'pay_form',
  payTime: 'pay_time',
  tradeNo: 'trade_no',
  settleStatus: 'settle_status',
  closeReason: 'close_reason',
  refundTime: 'refund_time',
}

export function rowToOrder(r: Row): PayOrder {
  return {
    id: Number(r.id),
    orderId: String(r.order_id),
    userId: String(r.user_id),
    productId: String(r.product_id),
    productName: String(r.product_name),
    orderTime: new Date(r.order_time as Date),
    totalAmount: Number(r.total_amount),
    payAmount: Number(r.pay_amount),
    marketType: Number(r.market_type) === 1 ? 1 : 0,
    marketDeduction: Number(r.market_deduction),
    activityId: r.activity_id === null ? null : Number(r.activity_id),
    teamId: (r.team_id as string | null) ?? null,
    status: r.status as OrderStatus,
    payForm: (r.pay_form as string | null) ?? null,
    payTime: r.pay_time ? new Date(r.pay_time as Date) : null,
    tradeNo: (r.trade_no as string | null) ?? null,
    settleStatus: Number(r.settle_status) as 0 | 1 | 2,
    closeReason: (r.close_reason as string | null) ?? null,
    refundTime: r.refund_time ? new Date(r.refund_time as Date) : null,
  }
}

export function maskUser(id: string) {
  if (id.length <= 4) return id
  return `${id.slice(0, 2)}${'*'.repeat(Math.min(id.length - 4, 4))}${id.slice(-2)}`
}

export function createMysqlStore(mall: Pool, gbm: Pool): OrderStore {
  return {
    async findProduct(goodsId) {
      const [rows] = await gbm.query<Row[]>('SELECT goods_id, goods_name, original_price FROM sku WHERE goods_id = ? LIMIT 1', [goodsId])
      const r = rows[0]
      return r ? { goodsId: String(r.goods_id), goodsName: String(r.goods_name), originalPrice: Number(r.original_price) } : null
    },

    async insert(o) {
      const keys = Object.keys(columns) as (keyof typeof columns)[]
      await mall.query(
        `INSERT INTO pay_order (${keys.map((k) => columns[k]).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        keys.map((k) => o[k]),
      )
    },

    async update(orderId, patch, expectStatus) {
      const keys = (Object.keys(patch) as (keyof typeof columns)[]).filter((k) => k in columns)
      if (!keys.length) return false
      let sql = `UPDATE pay_order SET ${keys.map((k) => `${columns[k]} = ?`).join(', ')} WHERE order_id = ?`
      const params: unknown[] = [...keys.map((k) => patch[k]), orderId]
      if (expectStatus?.length) {
        sql += ` AND status IN (${expectStatus.map(() => '?').join(', ')})`
        params.push(...expectStatus)
      }
      const [res] = await mall.query<ResultSetHeader>(sql, params)
      return res.affectedRows > 0
    },

    async get(orderId) {
      const [rows] = await mall.query<Row[]>('SELECT * FROM pay_order WHERE order_id = ?', [orderId])
      return rows[0] ? rowToOrder(rows[0]) : null
    },

    async findReusable(userId, productId, marketType, teamId) {
      const [rows] = await mall.query<Row[]>(
        `SELECT * FROM pay_order
         WHERE user_id = ? AND product_id = ? AND market_type = ? AND status = 'PAY_WAIT'
           AND order_time > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
         ORDER BY id DESC LIMIT 5`,
        [userId, productId, marketType],
      )
      // 开团（teamId 为空）不复用已加入别人队伍的单，参团只复用同一队伍的单
      const match = rows.map(rowToOrder).find((o) => (teamId ? o.teamId === teamId : true))
      return match ?? null
    },

    async listByUser(userId, beforeId, size) {
      const [rows] = await mall.query<Row[]>(
        `SELECT * FROM pay_order WHERE user_id = ? ${beforeId !== null ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
        beforeId !== null ? [userId, beforeId, size] : [userId, size],
      )
      return rows.map(rowToOrder)
    },

    async listByStatus(status, limit) {
      const [rows] = await mall.query<Row[]>('SELECT * FROM pay_order WHERE status = ? ORDER BY id LIMIT ?', [status, limit])
      return rows.map(rowToOrder)
    },

    async listUnsettled(limit) {
      const [rows] = await mall.query<Row[]>(
        `SELECT * FROM pay_order WHERE market_type = 1 AND settle_status = 0 AND status = 'PAY_SUCCESS' ORDER BY id LIMIT ?`,
        [limit],
      )
      return rows.map(rowToOrder)
    },

    async listPaidGroupOrders(limit) {
      const [rows] = await mall.query<Row[]>(
        `SELECT * FROM pay_order WHERE market_type = 1 AND status = 'PAY_SUCCESS' AND team_id IS NOT NULL ORDER BY id LIMIT ?`,
        [limit],
      )
      return rows.map(rowToOrder)
    },

    async teamsByIds(teamIds, userId) {
      if (!teamIds.length) return []
      const [teams] = await gbm.query<Row[]>(
        `SELECT team_id, status, target_count, lock_count, complete_count, valid_end_time
         FROM group_buy_order WHERE team_id IN (?)`,
        [teamIds],
      )
      // 成员：排除已退单（status=2）；status=1 已付款，0 已锁单待付款
      const [members] = await gbm.query<Row[]>(
        `SELECT team_id, user_id, status FROM group_buy_order_list
         WHERE team_id IN (?) AND status IN (0, 1) ORDER BY id`,
        [teamIds],
      )
      return teams.map((t): TeamSnapshot => {
        const list = members.filter((m) => String(m.team_id) === String(t.team_id))
        return {
          teamId: String(t.team_id),
          status: Number(t.status),
          targetCount: Number(t.target_count),
          lockCount: Number(t.lock_count),
          completeCount: Number(t.complete_count),
          validEndTime: new Date(t.valid_end_time as Date).getTime(),
          members: list.map((m, i) => ({
            label: maskUser(String(m.user_id)),
            paid: Number(m.status) === 1,
            isMe: String(m.user_id) === userId,
            isLeader: i === 0,
          })),
        }
      })
    },
  }
}
