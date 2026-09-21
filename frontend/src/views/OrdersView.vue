<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal.vue'
import PriceTag from '@/components/PriceTag.vue'
import StateBlock from '@/components/StateBlock.vue'
import { usePolling } from '@/composables/usePolling'
import { findProduct } from '@/data/products'
import { api, errorMessage, isApiError } from '@/services'
import { maskUserId } from '@/services/demo/demoApi'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import type { Order } from '@/types'
import { canRefund, formatDateTime, orderStatusView } from '@/utils/format'
import { clearPendingPayment, readPendingPayment } from '@/utils/pendingPayment'

const PAGE_SIZE = 5

const session = useSessionStore()
const toast = useToastStore()
const router = useRouter()

const orders = ref<Order[]>([])
const lastId = ref<string | null>(null)
const hasMore = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const loadingMore = ref(false)
const loadError = ref('')
const moreError = ref('')

const refundTarget = ref<Order | null>(null)
const refunding = ref(false)
const refundError = ref('')

const pendingPay = ref(readPendingPayment())

function onUnauthorized() {
  session.logout()
  toast.show('登录已失效，请重新登录。', 'error')
  router.push({ name: 'login', query: { redirect: '/orders' } })
}

async function loadFirst() {
  if (!session.user) return
  state.value = 'loading'
  try {
    const page = await api.listOrders(session.user, null, PAGE_SIZE)
    orders.value = page.orders
    lastId.value = page.lastId
    hasMore.value = page.hasMore
    state.value = 'ready'
  } catch (e) {
    if (isApiError(e) && e.kind === 'unauthorized') return onUnauthorized()
    loadError.value = errorMessage(e)
    state.value = 'error'
  }
}

async function loadMore() {
  if (!session.user || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  moreError.value = ''
  try {
    const page = await api.listOrders(session.user, lastId.value, PAGE_SIZE)
    const known = new Set(orders.value.map((o) => o.orderId))
    orders.value = [...orders.value, ...page.orders.filter((o) => !known.has(o.orderId))]
    lastId.value = page.lastId
    hasMore.value = page.hasMore
  } catch (e) {
    if (isApiError(e) && e.kind === 'unauthorized') return onUnauthorized()
    moreError.value = errorMessage(e)
  } finally {
    loadingMore.value = false
  }
}

/** 静默刷新已加载的订单（用于退款处理中、待确认支付） */
async function refreshLoaded(): Promise<boolean> {
  if (!session.user) return true
  const size = Math.max(PAGE_SIZE, orders.value.length)
  const page = await api.listOrders(session.user, null, size)
  orders.value = page.orders
  lastId.value = page.lastId
  hasMore.value = page.hasMore
  if (pendingPay.value) {
    const since = pendingPay.value.since - 60_000
    const paid = page.orders.find(
      (o) =>
        (pendingPay.value?.orderId ? o.orderId === pendingPay.value.orderId : o.productId === pendingPay.value?.productId && o.orderTime >= since) &&
        o.status !== 'PAY_WAIT' &&
        o.status !== 'CREATE',
    )
    if (paid) {
      clearPendingPayment()
      pendingPay.value = null
      toast.show(paid.status === 'CLOSE' ? '支付未完成，订单已关闭。' : '付款结果已确认。', paid.status === 'CLOSE' ? 'info' : 'success')
    }
  }
  return !needsWatching.value
}

const needsWatching = computed(() => !!pendingPay.value || orders.value.some((o) => o.status === 'WAIT_REFUND'))
const watcher = usePolling(refreshLoaded, api.mode === 'demo' ? 3000 : 8000, 10 * 60_000)
watch(needsWatching, (v) => (v ? watcher.start() : watcher.stop()))

function askRefund(order: Order) {
  refundError.value = ''
  refundTarget.value = order
}

async function doRefund() {
  const target = refundTarget.value
  if (!target || !session.user || refunding.value) return
  refunding.value = true
  refundError.value = ''
  try {
    const status = await api.refund(session.user, target.orderId)
    orders.value = orders.value.map((o) =>
      o.orderId === target.orderId
        ? { ...o, status, closeReason: status === 'CLOSE' ? '已取消订单' : o.closeReason }
        : o,
    )
    toast.show(status === 'CLOSE' ? '订单已取消' : '已提交退单，退款处理中', 'success')
    refundTarget.value = null
  } catch (e) {
    if (isApiError(e) && e.kind === 'unauthorized') {
      refundTarget.value = null
      return onUnauthorized()
    }
    refundError.value = errorMessage(e)
  } finally {
    refunding.value = false
  }
}

const refundIsCancel = computed(() => refundTarget.value?.status === 'PAY_WAIT' || refundTarget.value?.status === 'CREATE')

function thumbOf(order: Order) {
  return order.productId ? findProduct(order.productId)?.images[0].src : undefined
}

onMounted(async () => {
  await loadFirst()
  if (needsWatching.value) watcher.start()
})
</script>

<template>
  <section class="container orders">
    <header class="head">
      <h1>我的订单</h1>
      <p v-if="session.user" class="who">{{ session.user.displayName }}（{{ maskUserId(session.user.userId) }}）</p>
    </header>

    <div v-if="pendingPay" class="pending" role="status">
      <span class="spinner" aria-hidden="true" />
      <p>正在确认刚才的付款结果，确认后订单状态会自动更新。</p>
      <button type="button" class="btn btn-quiet" @click="clearPendingPayment(); pendingPay = null">不再等待</button>
    </div>

    <StateBlock v-if="state === 'loading'" kind="loading" title="正在加载订单" />
    <StateBlock
      v-else-if="state === 'error'"
      kind="error"
      title="订单没有加载出来"
      :detail="loadError"
      action-label="重新加载"
      @action="loadFirst"
    />
    <StateBlock
      v-else-if="orders.length === 0"
      kind="empty"
      title="还没有订单"
      detail="挑一件喜欢的展品，发起拼团或者单独购买。"
    >
      <RouterLink to="/" class="btn btn-primary btn-small">去逛逛</RouterLink>
    </StateBlock>

    <template v-else>
      <ul class="list">
        <li v-for="o in orders" :key="o.orderId" class="order" :class="`tone-${orderStatusView(o).tone}`">
          <RouterLink v-if="o.productId" :to="`/products/${o.productId}`" class="thumb" tabindex="-1" aria-hidden="true">
            <img v-if="thumbOf(o)" :src="thumbOf(o)" alt="" width="96" height="96" loading="lazy" />
          </RouterLink>
          <div v-else class="thumb" aria-hidden="true" />
          <div class="main">
            <p class="name">
              <RouterLink v-if="o.productId" :to="`/products/${o.productId}`">{{ o.productName }}</RouterLink>
              <template v-else>{{ o.productName }}</template>
            </p>
            <p class="meta">
              <time :datetime="new Date(o.orderTime).toISOString()">{{ formatDateTime(o.orderTime) }}</time>
              <span class="no">订单号 <span class="num">{{ o.orderId }}</span></span>
            </p>
            <p class="status">
              <span class="badge">{{ orderStatusView(o).label }}</span>
              <span v-if="orderStatusView(o).note" class="note">{{ orderStatusView(o).note }}</span>
            </p>
          </div>
          <div class="side">
            <PriceTag :value="o.payAmount" />
            <button
              v-if="canRefund(o)"
              type="button"
              class="btn btn-secondary btn-small"
              @click="askRefund(o)"
            >
              {{ o.status === 'PAY_WAIT' || o.status === 'CREATE' ? '取消订单' : '申请退单' }}
            </button>
          </div>
        </li>
      </ul>

      <div class="more">
        <p v-if="moreError" class="more-error" role="alert">{{ moreError }}</p>
        <button v-if="hasMore" type="button" class="btn btn-secondary" :disabled="loadingMore" @click="loadMore">
          <span v-if="loadingMore" class="spinner" aria-hidden="true" />
          {{ loadingMore ? '正在加载' : moreError ? '重试加载更多' : '加载更多' }}
        </button>
        <p v-else class="end">已显示全部订单</p>
      </div>
    </template>

    <BaseModal
      :open="!!refundTarget"
      :title="refundIsCancel ? '取消这笔订单？' : '申请退单？'"
      :locked="refunding"
      @close="refundTarget = null"
    >
      <p v-if="refundTarget">
        {{ refundTarget.productName }}，¥{{ refundTarget.payAmount }}。
        <template v-if="refundIsCancel">订单还没付款，取消后直接关闭。</template>
        <template v-else>退单后拼团名额会释放，款项原路退回，处理期间订单显示为“退款处理中”。</template>
      </p>
      <p v-if="refundError" class="refund-error" role="alert">{{ refundError }}</p>
      <template #actions>
        <button type="button" class="btn btn-secondary" :disabled="refunding" data-autofocus @click="refundTarget = null">
          保留订单
        </button>
        <button type="button" class="btn btn-primary" :disabled="refunding" @click="doRefund">
          <span v-if="refunding" class="spinner" aria-hidden="true" />
          {{ refunding ? '正在提交' : refundIsCancel ? '取消订单' : '确认退单' }}
        </button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.orders {
  padding-top: 40px;
  max-width: 920px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin-bottom: 28px;
}

h1 {
  font-size: var(--t-3xl);
  letter-spacing: -0.02em;
}

.who {
  color: var(--graphite);
  font-size: var(--t-sm);
}

.pending {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-bottom: 20px;
  padding: 14px 18px;
  border-radius: var(--r-plinth);
  background: var(--violet-mist);
  color: var(--violet);
}

.pending p {
  flex: 1 1 240px;
  color: var(--ink);
}

.list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 2px solid var(--ink);
}

.order {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  gap: 20px;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}

.thumb {
  width: 96px;
  height: 96px;
  border-radius: 14px;
  background: var(--plinth);
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
}

.name {
  font-weight: 700;
  font-size: var(--t-lg);
}

.name a {
  text-decoration: none;
}

.name a:hover {
  color: var(--violet);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: var(--t-xs);
  color: var(--graphite);
}

.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 8px;
}

.badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--t-xs);
  font-weight: 700;
}

.note {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.tone-wait .badge {
  background: var(--warn-bg);
  color: var(--warn);
}
.tone-paid .badge {
  background: var(--violet-mist);
  color: var(--violet);
}
.tone-done .badge {
  background: var(--ok-bg);
  color: var(--ok);
}
.tone-refund .badge {
  background: var(--danger-bg);
  color: var(--danger);
}
.tone-closed .badge {
  background: var(--plinth);
  color: var(--graphite);
}
.tone-closed .thumb img {
  opacity: 0.55;
}

.side {
  display: grid;
  justify-items: end;
  gap: 12px;
}

.more {
  display: grid;
  justify-items: center;
  gap: 10px;
  margin-top: 28px;
}

.more-error,
.refund-error {
  color: var(--danger);
  font-size: var(--t-sm);
}

.refund-error {
  margin-top: 12px;
}

.end {
  color: var(--graphite);
  font-size: var(--t-sm);
}

@media (max-width: 600px) {
  .order {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px 14px;
    align-items: start;
  }
  .thumb {
    width: 72px;
    height: 72px;
  }
  .side {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
