<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, fmtTime, toLocalInput } from '@/api'
import AdminModal from '@/components/AdminModal.vue'
import Badge from '@/components/Badge.vue'
import { toast } from '@/toast'

interface Activity {
  activity_id: number
  activity_name: string
  discount_id: string
  discount_name: string | null
  market_plan: string | null
  market_expr: string | null
  group_type: number
  take_limit_count: number
  target: number
  valid_time: number
  status: number
  start_time: string
  end_time: string
  sku_count: number
  team_count: number
}
interface Discount {
  discount_id: string
  discount_name: string
  discount_desc: string
  market_plan: string
  market_expr: string
  activity_count: number
}

const plans: Record<string, { label: string; hint: string; placeholder: string }> = {
  ZJ: { label: '直减', hint: '在原价上减去固定金额', placeholder: '20' },
  MJ: { label: '满减', hint: '满多少减多少，用英文逗号分隔', placeholder: '100,10' },
  ZK: { label: '折扣', hint: '0 到 1 之间，0.8 表示八折', placeholder: '0.8' },
  N: { label: 'N 元购', hint: '直接按这个价格成交', placeholder: '9.9' },
}
const statusView: Record<number, { label: string; tone: 'muted' | 'ok' | 'warn' | 'danger' }> = {
  0: { label: '未生效', tone: 'muted' },
  1: { label: '生效中', tone: 'ok' },
  2: { label: '已过期', tone: 'warn' },
  3: { label: '已废弃', tone: 'danger' },
}

function describe(plan: string | null, expr: string | null) {
  if (!plan || !expr) return '—'
  if (plan === 'ZJ') return `直减 ¥${expr}`
  if (plan === 'MJ') {
    const [x, y] = expr.split(',')
    return `满 ¥${x} 减 ¥${y}`
  }
  if (plan === 'ZK') return `${Number(expr) * 10} 折`
  if (plan === 'N') return `${expr} 元购`
  return expr
}

const activities = ref<Activity[]>([])
const discounts = ref<Discount[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    ;[activities.value, discounts.value] = await Promise.all([api<Activity[]>('/activities'), api<Discount[]>('/discounts')])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// ---- 活动编辑 ----
const actOpen = ref(false)
const actEditing = ref<number | null>(null)
const actError = ref('')
const act = reactive({
  activityName: '',
  discountId: '',
  groupType: 0,
  takeLimitCount: 1,
  target: 3,
  validTime: 60,
  status: 1,
  startTime: '',
  endTime: '',
})

function newActivity() {
  actEditing.value = null
  const end = new Date()
  end.setMonth(end.getMonth() + 3)
  Object.assign(act, {
    activityName: '',
    discountId: discounts.value[0]?.discount_id ?? '',
    groupType: 0,
    takeLimitCount: 1,
    target: 3,
    validTime: 60,
    status: 1,
    startTime: toLocalInput(new Date()),
    endTime: toLocalInput(end),
  })
  actError.value = ''
  actOpen.value = true
}

function editActivity(a: Activity) {
  actEditing.value = a.activity_id
  Object.assign(act, {
    activityName: a.activity_name,
    discountId: a.discount_id,
    groupType: a.group_type,
    takeLimitCount: a.take_limit_count,
    target: a.target,
    validTime: a.valid_time,
    status: a.status,
    startTime: toLocalInput(a.start_time),
    endTime: toLocalInput(a.end_time),
  })
  actError.value = ''
  actOpen.value = true
}

async function saveActivity() {
  busy.value = true
  actError.value = ''
  try {
    const body = { ...act, startTime: new Date(act.startTime).getTime(), endTime: new Date(act.endTime).getTime() }
    if (actEditing.value) await api(`/activities/${actEditing.value}`, { method: 'PUT', body })
    else await api('/activities', { method: 'POST', body })
    toast(actEditing.value ? '活动已保存，缓存已刷新' : '活动已创建')
    actOpen.value = false
    await load()
  } catch (e) {
    actError.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}

// ---- 优惠编辑 ----
const disOpen = ref(false)
const disEditing = ref<string | null>(null)
const disError = ref('')
const dis = reactive({ discountName: '', discountDesc: '', marketPlan: 'ZJ', marketExpr: '' })
const planInfo = computed(() => plans[dis.marketPlan])

function newDiscount() {
  disEditing.value = null
  Object.assign(dis, { discountName: '', discountDesc: '', marketPlan: 'ZJ', marketExpr: '' })
  disError.value = ''
  disOpen.value = true
}

function editDiscount(d: Discount) {
  disEditing.value = d.discount_id
  Object.assign(dis, { discountName: d.discount_name, discountDesc: d.discount_desc, marketPlan: d.market_plan, marketExpr: d.market_expr })
  disError.value = ''
  disOpen.value = true
}

async function saveDiscount() {
  busy.value = true
  disError.value = ''
  try {
    if (disEditing.value) await api(`/discounts/${disEditing.value}`, { method: 'PUT', body: dis })
    else await api('/discounts', { method: 'POST', body: dis })
    toast(disEditing.value ? '优惠已保存，缓存已刷新' : '优惠已创建')
    disOpen.value = false
    await load()
  } catch (e) {
    disError.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}

const confirm = ref<{ kind: 'activity' | 'discount'; id: string | number; name: string } | null>(null)
async function remove() {
  const c = confirm.value
  if (!c) return
  busy.value = true
  try {
    await api(c.kind === 'activity' ? `/activities/${c.id}` : `/discounts/${c.id}`, { method: 'DELETE' })
    toast('已删除')
    confirm.value = null
    await load()
  } catch (e) {
    toast(e instanceof Error ? e.message : '删除失败', 'error')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <p v-if="loading" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <div v-else class="stack sections">
    <section>
      <div class="toolbar">
        <h2>拼团活动</h2>
        <span class="spacer" />
        <button type="button" class="btn btn-primary" :disabled="!discounts.length" @click="newActivity">新增活动</button>
      </div>
      <div v-if="!activities.length" class="empty">还没有活动。先建一条优惠，再新增活动。</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>活动</th>
              <th>状态</th>
              <th>优惠</th>
              <th class="num">成团人数</th>
              <th class="num">拼团时长</th>
              <th class="num">每人限参</th>
              <th>有效期</th>
              <th class="num">商品 / 队伍</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in activities" :key="a.activity_id">
              <td>{{ a.activity_name }} <span class="muted num">#{{ a.activity_id }}</span></td>
              <td><Badge :tone="statusView[a.status]?.tone ?? 'muted'" :label="statusView[a.status]?.label ?? String(a.status)" /></td>
              <td>{{ describe(a.market_plan, a.market_expr) }}</td>
              <td class="num">{{ a.target }}</td>
              <td class="num">{{ a.valid_time }} 分钟</td>
              <td class="num">{{ a.take_limit_count }} 次</td>
              <td class="muted">{{ fmtTime(a.start_time) }} 至 {{ fmtTime(a.end_time) }}</td>
              <td class="num">{{ a.sku_count }} / {{ a.team_count }}</td>
              <td>
                <button type="button" class="btn btn-link" @click="editActivity(a)">编辑</button>
                <button
                  type="button"
                  class="btn btn-link danger"
                  :disabled="a.team_count > 0"
                  :title="a.team_count > 0 ? '已有拼团记录，只能改为废弃' : ''"
                  @click="confirm = { kind: 'activity', id: a.activity_id, name: a.activity_name }"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <div class="toolbar">
        <h2>优惠规则</h2>
        <span class="spacer" />
        <button type="button" class="btn btn-secondary" @click="newDiscount">新增优惠</button>
      </div>
      <div v-if="!discounts.length" class="empty">还没有优惠规则。</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>规则</th>
              <th>说明</th>
              <th class="num">使用中的活动</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in discounts" :key="d.discount_id">
              <td>{{ d.discount_name }} <span class="muted num">#{{ d.discount_id }}</span></td>
              <td>{{ describe(d.market_plan, d.market_expr) }}</td>
              <td class="muted">{{ d.discount_desc }}</td>
              <td class="num">{{ d.activity_count }}</td>
              <td>
                <button type="button" class="btn btn-link" @click="editDiscount(d)">编辑</button>
                <button
                  type="button"
                  class="btn btn-link danger"
                  :disabled="d.activity_count > 0"
                  @click="confirm = { kind: 'discount', id: d.discount_id, name: d.discount_name }"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <AdminModal :open="actOpen" :title="actEditing ? '编辑活动' : '新增活动'" :busy="busy" wide @close="actOpen = false">
    <form id="act-form" class="stack" @submit.prevent="saveActivity">
      <div class="grid-2">
        <label class="field">
          <span>活动名称</span>
          <input v-model="act.activityName" class="input" maxlength="128" required />
        </label>
        <label class="field">
          <span>优惠规则</span>
          <select v-model="act.discountId" class="input" required>
            <option v-for="d in discounts" :key="d.discount_id" :value="d.discount_id">{{ d.discount_name }}（{{ describe(d.market_plan, d.market_expr) }}）</option>
          </select>
        </label>
        <label class="field">
          <span>成团人数</span>
          <input v-model.number="act.target" class="input" type="number" min="1" max="20" required />
        </label>
        <label class="field">
          <span>拼团时长（分钟）</span>
          <input v-model.number="act.validTime" class="input" type="number" min="1" max="10080" required />
          <small>开团后多久内凑齐人数，超时未成团会退款。</small>
        </label>
        <label class="field">
          <span>每人参与次数</span>
          <input v-model.number="act.takeLimitCount" class="input" type="number" min="1" max="100" required />
        </label>
        <label class="field">
          <span>成团方式</span>
          <select v-model.number="act.groupType" class="input">
            <option :value="0">到时自动成团</option>
            <option :value="1">人数达到目标才成团</option>
          </select>
        </label>
        <label class="field">
          <span>开始时间</span>
          <input v-model="act.startTime" class="input" type="datetime-local" required />
        </label>
        <label class="field">
          <span>结束时间</span>
          <input v-model="act.endTime" class="input" type="datetime-local" required />
        </label>
        <label class="field">
          <span>状态</span>
          <select v-model.number="act.status" class="input">
            <option v-for="(s, k) in statusView" :key="k" :value="Number(k)">{{ s.label }}</option>
          </select>
        </label>
      </div>
      <p v-if="actError" class="error-line" role="alert">{{ actError }}</p>
    </form>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="actOpen = false">取消</button>
      <button type="submit" form="act-form" class="btn btn-primary" :disabled="busy">{{ busy ? '正在保存' : '保存' }}</button>
    </template>
  </AdminModal>

  <AdminModal :open="disOpen" :title="disEditing ? '编辑优惠' : '新增优惠'" :busy="busy" @close="disOpen = false">
    <form id="dis-form" class="stack" @submit.prevent="saveDiscount">
      <label class="field">
        <span>优惠名称</span>
        <input v-model="dis.discountName" class="input" maxlength="64" required />
      </label>
      <label class="field">
        <span>优惠方式</span>
        <select v-model="dis.marketPlan" class="input">
          <option v-for="(p, k) in plans" :key="k" :value="k">{{ p.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>规则</span>
        <input v-model="dis.marketExpr" class="input" :placeholder="planInfo?.placeholder" maxlength="32" required />
        <small>{{ planInfo?.hint }}</small>
      </label>
      <label class="field">
        <span>说明（选填）</span>
        <input v-model="dis.discountDesc" class="input" maxlength="256" />
      </label>
      <p v-if="disError" class="error-line" role="alert">{{ disError }}</p>
    </form>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="disOpen = false">取消</button>
      <button type="submit" form="dis-form" class="btn btn-primary" :disabled="busy">{{ busy ? '正在保存' : '保存' }}</button>
    </template>
  </AdminModal>

  <AdminModal :open="!!confirm" :title="`删除“${confirm?.name}”？`" :busy="busy" @close="confirm = null">
    <p v-if="confirm?.kind === 'activity'">活动删除后，绑定它的商品会停止拼团。</p>
    <p v-else>这条优惠没有活动在使用，删除后不可恢复。</p>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirm = null">保留</button>
      <button type="button" class="btn btn-danger" :disabled="busy" @click="remove">删除</button>
    </template>
  </AdminModal>
</template>

<style scoped>
.sections {
  gap: 36px;
}
</style>
