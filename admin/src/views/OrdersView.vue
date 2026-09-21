<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, fmtMoney, fmtTime, type Page } from '@/api'
import Badge from '@/components/Badge.vue'
import Pager from '@/components/Pager.vue'

interface Order {
  order_id: string
  user_id: string
  product_id: string
  product_name: string
  order_time: string
  total_amount: number
  pay_amount: number
  market_type: number
  team_id: string | null
  status: string
  pay_time: string | null
  trade_no: string | null
  settle_status: number
  close_reason: string | null
}

const statuses: Record<string, { label: string; tone: 'warn' | 'violet' | 'ok' | 'danger' | 'muted' }> = {
  CREATE: { label: '已创建', tone: 'muted' },
  PAY_WAIT: { label: '待支付', tone: 'warn' },
  PAY_SUCCESS: { label: '支付完成', tone: 'violet' },
  DEAL_DONE: { label: '拼团成功', tone: 'ok' },
  WAIT_REFUND: { label: '退款处理中', tone: 'danger' },
  CLOSE: { label: '已关闭', tone: 'muted' },
}
const settle: Record<number, string> = { 0: '未结算', 1: '已结算', 2: '被拒' }

const route = useRoute()
const status = ref(typeof route.query.status === 'string' ? route.query.status : '')
const keyword = ref('')
const page = ref(1)
const data = ref<Page<Order> | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const q = new URLSearchParams({ page: String(page.value), pageSize: '20', status: status.value, keyword: keyword.value.trim() })
    data.value = await api<Page<Order>>(`/orders?${q}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function mask(id: string) {
  return id.length <= 6 ? id : `${id.slice(0, 3)}***${id.slice(-3)}`
}

onMounted(load)
</script>

<template>
  <form class="toolbar" @submit.prevent="search">
    <select v-model="status" class="input narrow" aria-label="订单状态" @change="search">
      <option value="">全部状态</option>
      <option v-for="(s, k) in statuses" :key="k" :value="k">{{ s.label }}</option>
    </select>
    <input v-model="keyword" class="input search" placeholder="订单号、用户、商品或队伍 ID" aria-label="搜索订单" />
    <button type="submit" class="btn btn-secondary">查询</button>
    <span class="spacer" />
    <span class="muted">用户在商城里下的订单，拼团单与拼团队伍一一对应</span>
  </form>

  <p v-if="loading && !data" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <div v-else-if="data && !data.list.length" class="empty">没有符合条件的订单。</div>
  <template v-else-if="data">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>订单号</th>
            <th>商品</th>
            <th>用户</th>
            <th>方式</th>
            <th class="num">原价</th>
            <th class="num">实付</th>
            <th>状态</th>
            <th>下单时间</th>
            <th>付款时间</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in data.list" :key="o.order_id">
            <td class="num">{{ o.order_id }}</td>
            <td>{{ o.product_name }} <span class="muted">{{ o.product_id }}</span></td>
            <td class="num">{{ mask(o.user_id) }}</td>
            <td>
              <template v-if="o.market_type === 1">拼团 <span class="muted num">{{ o.team_id }}</span></template>
              <template v-else>单独购买</template>
            </td>
            <td class="num">{{ fmtMoney(o.total_amount) }}</td>
            <td class="num">{{ fmtMoney(o.pay_amount) }}</td>
            <td><Badge :tone="statuses[o.status]?.tone ?? 'muted'" :label="statuses[o.status]?.label ?? o.status" /></td>
            <td class="muted">{{ fmtTime(o.order_time) }}</td>
            <td class="muted">{{ fmtTime(o.pay_time) }}</td>
            <td class="muted">
              <template v-if="o.close_reason">{{ o.close_reason }}</template>
              <template v-else-if="o.market_type === 1 && o.pay_time">结算：{{ settle[o.settle_status] }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pager :page="data.page" :page-size="data.pageSize" :total="data.total" @change="(p) => ((page = p), load())" />
  </template>
</template>

<style scoped>
.narrow {
  width: 160px;
}
.search {
  width: 260px;
}
</style>
