<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, fmtMoney, fmtTime } from '@/api'
import AdminModal from '@/components/AdminModal.vue'
import { toast } from '@/toast'

interface Sku {
  goods_id: string
  goods_name: string
  original_price: number
  source: string
  channel: string
  activity_id: number | null
  activity_name: string | null
  update_time: string
}
interface Activity {
  activity_id: number
  activity_name: string
  status: number
}

const rows = ref<Sku[]>([])
const activities = ref<Activity[]>([])
const loading = ref(true)
const error = ref('')

const editing = ref<string | null>(null)
const open = ref(false)
const busy = ref(false)
const formError = ref('')
const form = reactive({ goodsId: '', goodsName: '', originalPrice: '', activityId: '' as string | number })

const confirmDelete = ref<Sku | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    ;[rows.value, activities.value] = await Promise.all([api<Sku[]>('/skus'), api<Activity[]>('/activities')])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function create() {
  editing.value = null
  Object.assign(form, { goodsId: '', goodsName: '', originalPrice: '', activityId: '' })
  formError.value = ''
  open.value = true
}

function edit(s: Sku) {
  editing.value = s.goods_id
  Object.assign(form, { goodsId: s.goods_id, goodsName: s.goods_name, originalPrice: String(s.original_price), activityId: s.activity_id ?? '' })
  formError.value = ''
  open.value = true
}

async function save() {
  busy.value = true
  formError.value = ''
  try {
    const body = { ...form, originalPrice: Number(form.originalPrice), activityId: form.activityId === '' ? null : Number(form.activityId) }
    if (editing.value) await api(`/skus/${encodeURIComponent(editing.value)}`, { method: 'PUT', body })
    else await api('/skus', { method: 'POST', body })
    toast(editing.value ? '商品已保存' : '商品已创建')
    open.value = false
    await load()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}

async function remove() {
  const s = confirmDelete.value
  if (!s) return
  busy.value = true
  try {
    await api(`/skus/${encodeURIComponent(s.goods_id)}`, { method: 'DELETE' })
    toast('商品已删除')
    confirmDelete.value = null
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
  <div class="toolbar">
    <p class="muted">商品的价格和拼团活动在这里维护；商品图片和介绍在前端商品配置里。商品 ID 需与前端配置一致（例如 JJ-01）。</p>
    <span class="spacer" />
    <button type="button" class="btn btn-primary" @click="create">新增商品</button>
  </div>

  <p v-if="loading" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <div v-else-if="!rows.length" class="empty">还没有商品，先新增一件。</div>
  <div v-else class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>商品 ID</th>
          <th>名称</th>
          <th class="num">原价</th>
          <th>拼团活动</th>
          <th>渠道</th>
          <th>更新时间</th>
          <th><span class="visually-hidden">操作</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in rows" :key="s.goods_id">
          <td class="num">{{ s.goods_id }}</td>
          <td>{{ s.goods_name }}</td>
          <td class="num">{{ fmtMoney(s.original_price) }}</td>
          <td>
            <template v-if="s.activity_id">{{ s.activity_name }} <span class="muted num">#{{ s.activity_id }}</span></template>
            <span v-else class="muted">未参加拼团</span>
          </td>
          <td class="muted">{{ s.source }} / {{ s.channel }}</td>
          <td class="muted">{{ fmtTime(s.update_time) }}</td>
          <td>
            <button type="button" class="btn btn-link" @click="edit(s)">编辑</button>
            <button type="button" class="btn btn-link danger" @click="confirmDelete = s">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <AdminModal :open="open" :title="editing ? '编辑商品' : '新增商品'" :busy="busy" @close="open = false">
    <form id="sku-form" class="stack" @submit.prevent="save">
      <label class="field">
        <span>商品 ID</span>
        <input v-model="form.goodsId" class="input" :disabled="!!editing" maxlength="16" placeholder="例如 JJ-01" required />
        <small>字母、数字、横线，最多 16 位；创建后不能修改。</small>
      </label>
      <label class="field">
        <span>商品名称</span>
        <input v-model="form.goodsName" class="input" maxlength="128" required />
      </label>
      <label class="field">
        <span>原价（元）</span>
        <input v-model="form.originalPrice" class="input" type="number" min="0.01" step="0.01" required />
      </label>
      <label class="field">
        <span>拼团活动</span>
        <select v-model="form.activityId" class="input">
          <option value="">不参加拼团</option>
          <option v-for="a in activities" :key="a.activity_id" :value="a.activity_id">
            {{ a.activity_name }}（#{{ a.activity_id }}{{ a.status === 1 ? '' : '，未生效' }}）
          </option>
        </select>
      </label>
      <p v-if="formError" class="error-line" role="alert">{{ formError }}</p>
    </form>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="open = false">取消</button>
      <button type="submit" form="sku-form" class="btn btn-primary" :disabled="busy">{{ busy ? '正在保存' : '保存' }}</button>
    </template>
  </AdminModal>

  <AdminModal :open="!!confirmDelete" title="删除商品？" :busy="busy" @close="confirmDelete = null">
    <p>删除“{{ confirmDelete?.goods_name }}”后，前端对应的商品将无法购买。已有拼团订单的商品不能删除。</p>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="confirmDelete = null">保留</button>
      <button type="button" class="btn btn-danger" :disabled="busy" @click="remove">删除商品</button>
    </template>
  </AdminModal>
</template>

