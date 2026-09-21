import { findProduct, products } from '@/data/products'
import type { ActiveTeam, MarketInfo, Order, OrderPage, PurchaseRequest, User } from '@/types'
import { ApiError } from '../http'
import type { ShopApi } from '../types'

/** 演示数据独立存储，与真实模式互不影响 */
export const DEMO_STORAGE_KEY = 'toyspace.demo.v1'
const MINUTE = 60_000
const TEAM_VALID_MS = 24 * 60 * MINUTE
const REFUND_PROCESS_MS = 8_000
const RESEED_AFTER_MS = 12 * 60 * MINUTE

interface DemoTeam {
  teamId: string
  productId: string
  activityId: number
  ownerId: string
  targetCount: number
  lockCount: number
  completeCount: number
  validEndTime: number
  members: string[]
}

interface DemoOrder {
  seq: number
  orderId: string
  userId: string
  productId: string
  type: PurchaseRequest['type']
  teamId?: string
  amount: number
  createdAt: number
  status: Order['status']
  refundDoneAt?: number
  closeReason?: string
}

interface DemoState {
  version: 1
  seededAt: number
  seq: number
  teams: DemoTeam[]
  orders: DemoOrder[]
}

export interface DemoOptions {
  storage: Storage
  now?: () => number
  /** 模拟网络延迟，测试时设为 0 */
  latencyMs?: number
}

const activityIdOf = (productId: string) => 100 + products.findIndex((p) => p.id === productId)

// 演示队友 ID，仅用于脱敏展示
const fakeUsers = ['toy8812', 'mecha0427', 'cloud3310', 'star0906', 'kit5521', 'frame7763', 'vinyl2048']

function seedTeams(now: number): DemoTeam[] {
  const teams: DemoTeam[] = []
  products.forEach((p, i) => {
    const target = p.demoTarget
    const owner = (k: number) => fakeUsers[(i + k) % fakeUsers.length]
    // 差一人成团：参团即可体验“拼团成功”
    teams.push({
      teamId: `T${p.id}-A`,
      productId: p.id,
      activityId: activityIdOf(p.id),
      ownerId: owner(0),
      targetCount: target,
      lockCount: target - 1,
      completeCount: target - 1,
      validEndTime: now + (25 + i * 7) * MINUTE,
      members: Array.from({ length: target - 1 }, (_, k) => owner(k)),
    })
    if (target > 2) {
      teams.push({
        teamId: `T${p.id}-B`,
        productId: p.id,
        activityId: activityIdOf(p.id),
        ownerId: owner(3),
        targetCount: target,
        lockCount: 1,
        completeCount: 1,
        validEndTime: now + (130 + i * 11) * MINUTE,
        members: [owner(3)],
      })
    }
  })
  // 边界场景：已满员（名额锁定但未全部支付）与已过期
  const full = products[0]
  teams.push({
    teamId: `T${full.id}-FULL`,
    productId: full.id,
    activityId: activityIdOf(full.id),
    ownerId: owner0(5),
    targetCount: full.demoTarget,
    lockCount: full.demoTarget,
    completeCount: full.demoTarget - 1,
    validEndTime: now + 48 * MINUTE,
    members: [owner0(5), owner0(6), owner0(1)],
  })
  const expired = products[4]
  teams.push({
    teamId: `T${expired.id}-EXP`,
    productId: expired.id,
    activityId: activityIdOf(expired.id),
    ownerId: owner0(2),
    targetCount: expired.demoTarget,
    lockCount: 1,
    completeCount: 1,
    validEndTime: now - 2 * MINUTE,
    members: [owner0(2)],
  })
  return teams
}

function owner0(k: number) {
  return fakeUsers[k % fakeUsers.length]
}

export function maskUserId(id: string): string {
  if (id.length <= 4) return id
  return `${id.slice(0, 2)}${'*'.repeat(Math.min(id.length - 4, 4))}${id.slice(-2)}`
}

export function createDemoApi(options: DemoOptions): ShopApi & { reset(): void } {
  const now = options.now ?? (() => Date.now())
  const latency = options.latencyMs ?? 450
  const inflight = new Set<string>()

  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve())

  function load(): DemoState {
    let state: DemoState | null = null
    try {
      const raw = options.storage.getItem(DEMO_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState
        if (parsed.version === 1) state = parsed
      }
    } catch {
      state = null
    }
    if (!state) {
      state = { version: 1, seededAt: now(), seq: 0, teams: seedTeams(now()), orders: [] }
      save(state)
    } else if (now() - state.seededAt > RESEED_AFTER_MS) {
      // 演示队伍过期太久后重新布置，保留用户自己的队伍和订单
      const mine = new Set(state.orders.map((o) => o.teamId).filter(Boolean))
      state.teams = [...state.teams.filter((t) => mine.has(t.teamId)), ...seedTeams(now())]
      state.seededAt = now()
      save(state)
    }
    advance(state)
    return state
  }

  function save(state: DemoState) {
    options.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state))
  }

  /** 推进基于时间的状态：退款到账 */
  function advance(state: DemoState) {
    for (const o of state.orders) {
      if (o.status === 'WAIT_REFUND' && o.refundDoneAt && now() >= o.refundDoneAt) {
        o.status = 'CLOSE'
        o.closeReason = '已退款'
      }
    }
  }

  function toOrder(state: DemoState, o: DemoOrder): Order {
    const product = findProduct(o.productId)
    const team = o.teamId ? state.teams.find((t) => t.teamId === o.teamId) : undefined
    return {
      orderId: o.orderId,
      productId: o.productId,
      productName: product?.name ?? o.productId,
      payAmount: o.amount,
      orderTime: o.createdAt,
      status: o.status,
      purchaseType: o.type,
      teamProgress: team ? { target: team.targetCount, complete: team.completeCount } : undefined,
      closeReason: o.closeReason,
    }
  }

  function releaseSlot(state: DemoState, o: DemoOrder, paid: boolean) {
    const team = o.teamId ? state.teams.find((t) => t.teamId === o.teamId) : undefined
    if (!team) return
    team.lockCount = Math.max(0, team.lockCount - 1)
    if (paid) team.completeCount = Math.max(0, team.completeCount - 1)
    team.members = team.members.filter((m) => m !== o.userId)
    if (team.lockCount === 0) state.teams = state.teams.filter((t) => t !== team)
  }

  function requireProduct(productId: string) {
    const product = findProduct(productId)
    if (!product) throw new ApiError('business', '商品不存在。', 'NOT_FOUND')
    return product
  }

  function findOwnOrder(state: DemoState, user: User, orderId: string) {
    const order = state.orders.find((o) => o.orderId === orderId && o.userId === user.userId)
    if (!order) throw new ApiError('business', '订单不存在或已退单。', 'E0104')
    return order
  }

  return {
    mode: 'demo',

    reset() {
      options.storage.removeItem(DEMO_STORAGE_KEY)
    },

    purchasability(productId) {
      return findProduct(productId) ? { ok: true } : { ok: false, reason: '商品不存在。' }
    },

    async getMarket(productId, user): Promise<MarketInfo> {
      await wait()
      const product = requireProduct(productId)
      const state = load()
      const teams = state.teams.filter((t) => t.productId === productId)
      const userId = user?.userId
      // 与后端一致：自己的队伍置顶
      const sorted = [...teams].sort((a, b) => {
        const am = userId && a.members.includes(userId) ? 0 : 1
        const bm = userId && b.members.includes(userId) ? 0 : 1
        return am - bm || a.validEndTime - b.validEndTime
      })
      return {
        productId,
        activityId: activityIdOf(productId),
        originalPrice: product.demoPrice.original,
        deductionPrice: product.demoPrice.original - product.demoPrice.group,
        payPrice: product.demoPrice.group,
        teams: sorted.map((t) => ({
          teamId: t.teamId,
          activityId: t.activityId,
          ownerLabel: maskUserId(t.ownerId),
          targetCount: t.targetCount,
          lockCount: t.lockCount,
          completeCount: t.completeCount,
          validEndTime: t.validEndTime,
          isMine: !!userId && t.members.includes(userId),
        })),
        stats: {
          teamCount: teams.length,
          completeCount: teams.filter((t) => t.completeCount >= t.targetCount).length,
          userCount: teams.reduce((sum, t) => sum + t.lockCount, 0),
        },
      }
    },

    async listActiveTeams(limit) {
      await wait()
      const state = load()
      const t = now()
      return state.teams
        .filter((team) => team.validEndTime > t && team.lockCount < team.targetCount)
        .sort((a, b) => b.lockCount / b.targetCount - a.lockCount / a.targetCount || a.validEndTime - b.validEndTime)
        .slice(0, limit)
        .map<ActiveTeam>((team) => ({
          teamId: team.teamId,
          productId: team.productId,
          activityId: team.activityId,
          ownerLabel: maskUserId(team.ownerId),
          targetCount: team.targetCount,
          lockCount: team.lockCount,
          completeCount: team.completeCount,
          validEndTime: team.validEndTime,
          isMine: false,
        }))
    },

    async demoLogin() {
      await wait()
      return { userId: 'demo_player', displayName: '体验玩家' }
    },

    async wechatQrTicket() {
      throw new ApiError('config', '演示模式请使用体验账号登录。')
    },

    async wechatCheckLogin() {
      return null
    },

    async checkout(user, req) {
      const key = `${user.userId}:${req.productId}`
      if (inflight.has(key)) throw new ApiError('business', '订单正在提交，请勿重复操作。', 'DUPLICATE')
      inflight.add(key)
      try {
        await wait()
        const product = requireProduct(req.productId)
        const state = load()
        const t = now()
        let teamId: string | undefined
        let amount = product.demoPrice.group

        if (req.type === 'single') {
          amount = product.demoPrice.original
        } else if (req.type === 'join') {
          const team = state.teams.find((x) => x.teamId === req.teamId && x.productId === req.productId)
          if (!team) throw new ApiError('business', '这个拼团不存在了，可以另开一团。', 'TEAM_MISSING')
          if (team.validEndTime <= t) throw new ApiError('business', '这个拼团已结束，可以另开一团。', 'E0102')
          if (team.members.includes(user.userId)) throw new ApiError('business', '你已经在这个拼团里了。', 'E0103')
          if (team.lockCount >= team.targetCount) throw new ApiError('business', '这个拼团已满员，可以另开一团。', 'E0006')
          team.lockCount += 1
          team.members.push(user.userId)
          teamId = team.teamId
        } else {
          const team: DemoTeam = {
            teamId: `T${String(t).slice(-8)}${state.seq + 1}`,
            productId: product.id,
            activityId: activityIdOf(product.id),
            ownerId: user.userId,
            targetCount: product.demoTarget,
            lockCount: 1,
            completeCount: 0,
            validEndTime: t + TEAM_VALID_MS,
            members: [user.userId],
          }
          state.teams.push(team)
          teamId = team.teamId
        }

        state.seq += 1
        const order: DemoOrder = {
          seq: state.seq,
          orderId: `DM${String(t).slice(-9)}${String(state.seq).padStart(3, '0')}`,
          userId: user.userId,
          productId: product.id,
          type: req.type,
          teamId,
          amount,
          createdAt: t,
          status: 'PAY_WAIT',
        }
        state.orders.push(order)
        save(state)
        return { kind: 'demo', order: toOrder(state, order) }
      } finally {
        inflight.delete(key)
      }
    },

    async settleDemoPayment(user, orderId, action) {
      await wait()
      const state = load()
      const order = findOwnOrder(state, user, orderId)
      if (order.status !== 'PAY_WAIT') return toOrder(state, order)

      if (action === 'cancel') {
        order.status = 'CLOSE'
        order.closeReason = '已取消支付'
        releaseSlot(state, order, false)
      } else {
        const team = order.teamId ? state.teams.find((t) => t.teamId === order.teamId) : undefined
        if (team && team.validEndTime <= now()) {
          order.status = 'CLOSE'
          order.closeReason = '拼团已结束，未扣款'
          releaseSlot(state, order, false)
        } else if (team) {
          team.completeCount += 1
          order.status = 'PAY_SUCCESS'
          if (team.completeCount >= team.targetCount) {
            for (const o of state.orders) {
              if (o.teamId === team.teamId && o.status === 'PAY_SUCCESS') o.status = 'DEAL_DONE'
            }
          }
        } else {
          order.status = 'PAY_SUCCESS'
        }
      }
      save(state)
      return toOrder(state, order)
    },

    async findRecentOrder(user, productId, since) {
      await wait()
      const state = load()
      const found = state.orders
        .filter((o) => o.userId === user.userId && o.productId === productId && o.createdAt >= since)
        .sort((a, b) => b.seq - a.seq)[0]
      return found ? toOrder(state, found) : null
    },

    async listOrders(user, lastId, pageSize) {
      await wait()
      const state = load()
      save(state)
      const cursor = lastId === null ? Infinity : Number(lastId)
      const mine = state.orders
        .filter((o) => o.userId === user.userId && o.seq < cursor)
        .sort((a, b) => b.seq - a.seq)
      const page = mine.slice(0, pageSize)
      const result: OrderPage = {
        orders: page.map((o) => toOrder(state, o)),
        hasMore: mine.length > pageSize,
        lastId: page.length ? String(page[page.length - 1].seq) : lastId,
      }
      return result
    },

    async refund(user, orderId) {
      const key = `refund:${orderId}`
      if (inflight.has(key)) throw new ApiError('business', '退单正在处理，请勿重复操作。', 'DUPLICATE')
      inflight.add(key)
      try {
        await wait()
        const state = load()
        const order = findOwnOrder(state, user, orderId)
        if (order.status === 'PAY_WAIT') {
          order.status = 'CLOSE'
          order.closeReason = '已取消订单'
          releaseSlot(state, order, false)
        } else if (order.status === 'PAY_SUCCESS' || order.status === 'DEAL_DONE') {
          if (order.status === 'PAY_SUCCESS') releaseSlot(state, order, true)
          order.status = 'WAIT_REFUND'
          order.refundDoneAt = now() + REFUND_PROCESS_MS
        } else {
          throw new ApiError('business', '这笔订单当前不能退单。', 'REFUND_DENIED')
        }
        save(state)
        return order.status
      } finally {
        inflight.delete(key)
      }
    },
  }
}
