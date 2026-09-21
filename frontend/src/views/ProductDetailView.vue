<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CheckoutDialog from '@/components/CheckoutDialog.vue'
import PriceTag from '@/components/PriceTag.vue'
import ProductGallery from '@/components/ProductGallery.vue'
import StateBlock from '@/components/StateBlock.vue'
import TeamItem from '@/components/TeamItem.vue'
import { categoryName, copyrightNotice, findProduct } from '@/data/products'
import { api, errorMessage, isApiError } from '@/services'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import type { MarketInfo, PurchaseRequest, PurchaseType, Team } from '@/types'
import { saveIntent, takeIntent } from '@/utils/intent'

const props = defineProps<{ goodsId: string }>()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToastStore()

const product = computed(() => findProduct(props.goodsId))
const purchasability = computed(() => api.purchasability(props.goodsId))
const isLive = api.mode === 'live'

const market = ref<MarketInfo | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'error' | 'login'>('idle')
const loadError = ref('')
const retryCooldown = ref(false)

const checkoutOpen = ref(false)
const pending = ref<PurchaseRequest | null>(null)

async function loadMarket() {
  if (!product.value) return
  if (!purchasability.value.ok) {
    state.value = 'idle'
    return
  }
  // 真实模式价格和队伍需要登录后查询
  if (isLive && !session.user) {
    state.value = 'login'
    return
  }
  state.value = 'loading'
  try {
    market.value = await api.getMarket(props.goodsId, session.user)
    state.value = 'ready'
    resumeIntent()
  } catch (e) {
    if (isApiError(e) && e.kind === 'unauthorized') return onUnauthorized()
    loadError.value = errorMessage(e)
    state.value = 'error'
    if (isApiError(e) && e.kind === 'rate_limit') {
      retryCooldown.value = true
      setTimeout(() => (retryCooldown.value = false), 3000)
    }
  }
}

/** 静默刷新拼团状态（下单后），失败不打断用户 */
async function refreshMarket() {
  try {
    market.value = await api.getMarket(props.goodsId, session.user)
  } catch {
    /* 保留旧数据 */
  }
}

function onUnauthorized() {
  session.logout()
  toast.show('登录已失效，请重新登录。', 'error')
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}

function isJoinable(team: Team | undefined) {
  return !!team && !team.isMine && team.validEndTime > Date.now() && team.lockCount < team.targetCount
}

function startPurchase(type: PurchaseType, team?: Team) {
  if (!product.value || !purchasability.value.ok) return
  if (!session.user) {
    saveIntent({ productId: product.value.id, type, teamId: team?.teamId })
    router.push({ name: 'login', query: { redirect: route.path } })
    return
  }
  if (!market.value) return
  if (type === 'join' && !isJoinable(team)) {
    toast.show('这个拼团已结束或满员，可以另开一团。', 'error')
    return
  }
  pending.value = {
    productId: product.value.id,
    type,
    activityId: market.value.activityId,
    teamId: team?.teamId,
  }
  checkoutOpen.value = true
}

// 登录回来后恢复购买意图，但仍需用户在弹窗里确认
function resumeIntent() {
  const intent = takeIntent(props.goodsId)
  if (!intent || !market.value) return
  if (intent.type === 'join') {
    const team = market.value.teams.find((t) => t.teamId === intent.teamId)
    if (!isJoinable(team)) {
      toast.show('你之前选的拼团已结束或满员，可以另开一团。')
      return
    }
    startPurchase('join', team)
  } else {
    startPurchase(intent.type)
  }
}

function onCheckoutChanged() {
  refreshMarket()
}

watch(() => props.goodsId, loadMarket, { immediate: true })
watch(
  () => product.value?.name,
  (name) => {
    if (name) document.title = `${name} | 玩集 TOYSPACE`
  },
  { immediate: true },
)

const saving = computed(() => (market.value ? market.value.originalPrice - market.value.payPrice : 0))
const targetText = computed(() => {
  const t = market.value?.teams[0]?.targetCount ?? (isLive ? null : product.value?.demoTarget)
  return t ? `${t} 人成团` : '人齐成团'
})
</script>

<template>
  <div v-if="!product" class="container missing">
    <StateBlock kind="empty" title="没有找到这件商品" detail="链接可能写错了，或者商品已经下架。">
      <RouterLink to="/" class="btn btn-primary btn-small">回到首页</RouterLink>
    </StateBlock>
  </div>

  <article v-else class="container detail" :class="{ 'has-bar': purchasability.ok }">
    <nav class="crumbs" aria-label="当前位置">
      <RouterLink to="/">首页</RouterLink>
      <span aria-hidden="true">/</span>
      <RouterLink :to="{ path: '/', query: { c: product.category }, hash: '#shelf' }">{{
        categoryName(product.category)
      }}</RouterLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ product.name }}</span>
    </nav>

    <div class="top">
      <ProductGallery :images="product.images" />

      <section class="buy" aria-labelledby="product-name">
        <p class="kicker">{{ categoryName(product.category) }}，{{ product.maker }} {{ product.line }}</p>
        <h1 id="product-name">{{ product.name }}</h1>
        <p class="tagline">{{ product.tagline }}</p>

        <div v-if="!purchasability.ok" class="notice warn" role="status">
          {{ purchasability.reason }}
        </div>

        <div v-else-if="state === 'login'" class="price-box">
          <p>登录后查看拼团价和正在进行的拼团。</p>
          <RouterLink :to="{ name: 'login', query: { redirect: route.path } }" class="btn btn-primary btn-small">
            登录
          </RouterLink>
        </div>

        <div v-else-if="state === 'loading' || state === 'idle'" class="price-box skeleton" aria-busy="true">
          <span class="visually-hidden">正在加载价格</span>
        </div>

        <StateBlock
          v-else-if="state === 'error'"
          kind="error"
          title="价格没有加载出来"
          :detail="loadError"
          :action-label="retryCooldown ? '稍等几秒' : '重新加载'"
          @action="!retryCooldown && loadMarket()"
        />

        <template v-else-if="market">
          <div class="price-box">
            <div class="price-main">
              <span class="price-label">拼团价</span>
              <PriceTag :value="market.payPrice" size="lg" tone="violet" />
            </div>
            <p class="price-sub">
              单买 <PriceTag :value="market.originalPrice" size="sm" tone="muted" strike />
              <span v-if="saving > 0" class="save">拼团省 ¥{{ saving }}</span>
            </p>
            <p class="rule">{{ targetText }}，到期没凑齐原路退款。</p>
          </div>
          <p class="stats">
            已开团 {{ market.stats.teamCount }} 个，参团 {{ market.stats.userCount }} 人
            <span v-if="!isLive" class="demo-tag">演示数据</span>
          </p>
          <div class="actions">
            <button type="button" class="btn btn-secondary" @click="startPurchase('single')">
              单独购买 ¥{{ market.originalPrice }}
            </button>
            <button type="button" class="btn btn-primary" @click="startPurchase('open')">
              发起拼团 ¥{{ market.payPrice }}
            </button>
          </div>
        </template>
      </section>
    </div>

    <section id="teams" class="block" aria-labelledby="teams-title">
      <h2 id="teams-title">正在拼团</h2>
      <template v-if="state === 'ready' && market">
        <ul v-if="market.teams.length" class="teams">
          <TeamItem
            v-for="t in market.teams"
            :key="t.teamId"
            :team="t"
            :busy="checkoutOpen"
            @join="startPurchase('join', $event)"
          />
        </ul>
        <p v-else class="empty-teams">还没有人开团。发起拼团后，把商品页分享给朋友一起拼。</p>
      </template>
      <p v-else-if="state === 'login'" class="empty-teams">登录后可以看到这件商品正在进行的拼团。</p>
      <p v-else-if="!purchasability.ok" class="empty-teams">这件商品暂不开放拼团。</p>
      <p v-else class="empty-teams">拼团信息加载后显示在这里。</p>
    </section>

    <section class="block about" aria-labelledby="about-title">
      <div class="about-body">
        <h2 id="about-title">设计介绍</h2>
        <p v-for="(para, i) in product.description" :key="i">{{ para }}</p>
        <p class="disclaimer">
          {{ copyrightNotice }}
          <a :href="product.sourceUrl" target="_blank" rel="noopener noreferrer">查看官方产品页</a>
        </p>
      </div>
      <div>
        <h2>尺寸与材质</h2>
        <dl class="specs">
          <div><dt>尺寸</dt><dd>{{ product.size }}</dd></div>
          <div><dt>材质</dt><dd>{{ product.material }}</dd></div>
          <div><dt>比例</dt><dd>{{ product.scale }}</dd></div>
          <div><dt>厂商</dt><dd>{{ product.maker }}</dd></div>
          <div><dt>系列</dt><dd>{{ product.line }}</dd></div>
          <div><dt>官方定价</dt><dd>{{ product.officialPriceJpy.toLocaleString('zh-CN') }} 日元（本站价格为演示价）</dd></div>
        </dl>
      </div>
    </section>

    <!-- 手机底部购买栏 -->
    <div v-if="purchasability.ok" class="buy-bar" role="region" aria-label="购买">
      <template v-if="state === 'ready' && market">
        <button type="button" class="btn btn-secondary" @click="startPurchase('single')">
          单买 ¥{{ market.originalPrice }}
        </button>
        <button type="button" class="btn btn-primary" @click="startPurchase('open')">
          发起拼团 ¥{{ market.payPrice }}
        </button>
      </template>
      <RouterLink
        v-else-if="state === 'login'"
        :to="{ name: 'login', query: { redirect: route.path } }"
        class="btn btn-primary"
        >登录后购买</RouterLink
      >
      <button v-else type="button" class="btn btn-primary" disabled>正在加载</button>
    </div>

    <CheckoutDialog
      v-if="market && session.user"
      :open="checkoutOpen"
      :product="product"
      :market="market"
      :request="pending"
      :user="session.user"
      @close="checkoutOpen = false"
      @changed="onCheckoutChanged"
      @unauthorized="
        checkoutOpen = false;
        onUnauthorized()
      "
    />
  </article>
</template>

<style scoped>
.missing {
  padding-top: 64px;
}

.detail {
  padding-top: 20px;
}

.crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--t-xs);
  color: var(--graphite);
  margin-bottom: 20px;
}

.crumbs a {
  text-decoration: none;
}

.crumbs a:hover {
  color: var(--violet);
}

.top {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: clamp(28px, 5vw, 64px);
  align-items: start;
}

.buy {
  position: sticky;
  top: calc(var(--header-h) + 56px);
}

.kicker {
  font-size: var(--t-sm);
  color: var(--graphite);
}

h1 {
  margin-top: 4px;
  font-size: clamp(1.9rem, 3.6vw, 2.75rem);
  letter-spacing: -0.02em;
}

.tagline {
  margin-top: 10px;
  color: var(--graphite);
  font-size: var(--t-lg);
  max-width: 28em;
}

.price-box {
  margin-top: 24px;
  padding: 20px 22px;
  border-radius: var(--r-plinth);
  background: var(--violet-mist);
}

.price-box > p:first-child:not(.price-sub) {
  margin-bottom: 12px;
}

.skeleton {
  height: 152px;
  background: linear-gradient(90deg, var(--plinth) 0%, #f6f1e9 50%, var(--plinth) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.price-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.price-label {
  font-weight: 700;
  color: var(--violet);
}

.price-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

.save {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--violet);
  color: #fff;
  font-size: var(--t-xs);
  font-weight: 700;
}

.rule {
  margin-top: 10px;
  font-size: var(--t-sm);
}

.stats {
  margin-top: 14px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

.demo-tag {
  margin-left: 6px;
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: var(--t-xs);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 20px;
}

.notice {
  margin-top: 24px;
  padding: 16px 20px;
  border-radius: var(--r-plinth);
}

.notice.warn {
  background: var(--warn-bg);
  color: var(--warn);
}

.buy :deep(.state) {
  margin-top: 24px;
  padding: 28px 20px;
}

.about {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 32px clamp(28px, 5vw, 64px);
}

.specs {
  display: grid;
  margin: 0;
  border-top: 2px solid var(--ink);
}

.specs div {
  display: grid;
  grid-template-columns: 5em 1fr;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: var(--t-sm);
}

.specs dt {
  color: var(--graphite);
}

.specs dd {
  margin: 0;
}

.block {
  margin-top: 72px;
  scroll-margin-top: 110px;
}

.block h2 {
  font-size: var(--t-2xl);
  margin-bottom: 18px;
}

.teams {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty-teams {
  padding: 20px 24px;
  border-radius: var(--r-plinth);
  background: var(--plinth);
  color: var(--graphite);
}

.about-body {
  display: grid;
  gap: 12px;
  max-width: 40em;
  font-size: var(--t-lg);
}

.disclaimer {
  font-size: var(--t-sm);
  color: var(--graphite);
}

.buy-bar {
  display: none;
}

@media (max-width: 860px) {
  .top {
    grid-template-columns: 1fr;
  }
  .buy {
    position: static;
  }
  .teams,
  .about {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .buy .actions {
    display: none;
  }
  .detail.has-bar {
    padding-bottom: 96px;
  }
  .buy-bar {
    position: fixed;
    z-index: 40;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 10px;
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    background: rgba(250, 247, 242, 0.96);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--line);
  }
  .buy-bar > :only-child {
    grid-column: 1 / -1;
  }
  .buy-bar .btn {
    padding: 0 12px;
  }
}
</style>
