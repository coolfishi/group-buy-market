<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, fmtMoney, fmtTime, type Page } from '@/api'
import Badge from '@/components/Badge.vue'
import Pager from '@/components/Pager.vue'

interface Team {
  team_id: string
  activity_id: number
  activity_name: string | null
  target_count: number
  lock_count: number
  complete_count: number
  status: number
  pay_price: number
  valid_start_time: string
  valid_end_time: string
}
interface Member {
  user_id: string
  order_id: string
  goods_id: string
  pay_price: number
  status: number
  out_trade_no: string
  out_trade_time: string | null
  create_time: string
}

const teamStatus: Record<string, { label: string; tone: 'violet' | 'ok' | 'danger' | 'muted' }> = {
  0: { label: '拼团中', tone: 'violet' },
  timeout: { label: '已超时', tone: 'muted' },
  1: { label: '已成团', tone: 'ok' },
  2: { label: '已失败', tone: 'danger' },
  3: { label: '已成团（含退单）', tone: 'ok' },
}
const memberStatus: Record<number, string> = { 0: '已锁单，待付款', 1: '已付款', 2: '已退单' }

const status = ref('')
const keyword = ref('')
const page = ref(1)
const data = ref<Page<Team> | null>(null)
const loading = ref(true)
const error = ref('')
const expanded = ref<string | null>(null)
const members = ref<Record<string, Member[]>>({})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const q = new URLSearchParams({ page: String(page.value), pageSize: '20', status: status.value, keyword: keyword.value.trim() })
    data.value = await api<Page<Team>>(`/teams?${q}`)
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

async function toggle(teamId: string) {
  if (expanded.value === teamId) {
    expanded.value = null
    return
  }
  expanded.value = teamId
  if (!members.value[teamId]) {
    try {
      members.value[teamId] = await api<Member[]>(`/teams/${teamId}/members`)
    } catch {
      members.value[teamId] = []
    }
  }
}

/** 状态 0 且已过截止时间：显示为已超时 */
function statusKey(t: Team): string {
  return t.status === 0 && new Date(t.valid_end_time).getTime() <= Date.now() ? 'timeout' : String(t.status)
}

function mask(id: string) {
  return id.length <= 6 ? id : `${id.slice(0, 3)}***${id.slice(-3)}`
}

onMounted(load)
</script>

<template>
  <form class="toolbar" @submit.prevent="search">
    <select v-model="status" class="input narrow" aria-label="队伍状态" @change="search">
      <option value="">全部状态</option>
      <option v-for="(s, k) in teamStatus" :key="k" :value="k">{{ s.label }}</option>
    </select>
    <input v-model="keyword" class="input search" placeholder="队伍 ID 或活动 ID" aria-label="搜索队伍" />
    <button type="submit" class="btn btn-secondary">查询</button>
  </form>

  <p v-if="loading && !data" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <div v-else-if="data && !data.list.length" class="empty">没有符合条件的拼团队伍。</div>
  <template v-else-if="data">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>队伍</th>
            <th>活动</th>
            <th>状态</th>
            <th class="num">进度（付款 / 锁单 / 目标）</th>
            <th class="num">拼团价</th>
            <th>开始</th>
            <th>截止</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="t in data.list" :key="t.team_id">
            <tr>
              <td class="num">{{ t.team_id }}</td>
              <td>{{ t.activity_name ?? '—' }} <span class="muted num">#{{ t.activity_id }}</span></td>
              <td><Badge :tone="teamStatus[statusKey(t)]?.tone ?? 'muted'" :label="teamStatus[statusKey(t)]?.label ?? String(t.status)" /></td>
              <td class="num">
                <span class="progress" :aria-label="`已付款 ${t.complete_count}，已锁单 ${t.lock_count}，目标 ${t.target_count}`">
                  <span class="bar lock" :style="{ width: `${(t.lock_count / t.target_count) * 100}%` }" />
                  <span class="bar paid" :style="{ width: `${(t.complete_count / t.target_count) * 100}%` }" />
                </span>
                {{ t.complete_count }} / {{ t.lock_count }} / {{ t.target_count }}
              </td>
              <td class="num">{{ fmtMoney(t.pay_price) }}</td>
              <td class="muted">{{ fmtTime(t.valid_start_time) }}</td>
              <td class="muted">{{ fmtTime(t.valid_end_time) }}</td>
              <td>
                <button type="button" class="btn btn-link" :aria-expanded="expanded === t.team_id" @click="toggle(t.team_id)">
                  {{ expanded === t.team_id ? '收起' : '成员' }}
                </button>
              </td>
            </tr>
            <tr v-if="expanded === t.team_id" class="detail">
              <td colspan="8">
                <p v-if="!members[t.team_id]" class="muted">正在加载成员…</p>
                <table v-else class="inner">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>订单号</th>
                      <th>商品</th>
                      <th class="num">金额</th>
                      <th>状态</th>
                      <th>付款时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in members[t.team_id]" :key="m.order_id">
                      <td class="num">{{ mask(m.user_id) }}</td>
                      <td class="num">{{ m.out_trade_no }}</td>
                      <td>{{ m.goods_id }}</td>
                      <td class="num">{{ fmtMoney(m.pay_price) }}</td>
                      <td>{{ memberStatus[m.status] ?? m.status }}</td>
                      <td class="muted">{{ fmtTime(m.out_trade_time) }}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
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
  width: 220px;
}
.progress {
  position: relative;
  display: inline-block;
  width: 64px;
  height: 6px;
  margin-right: 8px;
  vertical-align: middle;
  border-radius: 999px;
  background: var(--plinth);
  overflow: hidden;
}
.bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
}
.bar.lock {
  background: #c9b2ff;
}
.bar.paid {
  background: var(--violet);
}
.detail > td {
  background: #fdfbf7;
  padding: 8px 12px 14px 36px;
}
.inner th,
.inner td {
  padding: 6px 10px;
}
</style>
