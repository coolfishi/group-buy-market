<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProductCard from '@/components/ProductCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { useNow } from '@/composables/useNow'
import { categories, filterProducts, findProduct, products } from '@/data/products'
import { api, errorMessage } from '@/services'
import type { ActiveTeam, CategoryId } from '@/types'
import { characterName, formatCountdown } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const now = useNow()

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const category = ref<CategoryId | 'all'>(
  categories.some((c) => c.id === route.query.c) ? (route.query.c as CategoryId) : 'all',
)
const results = computed(() => filterProducts(products, query.value, category.value))

// 筛选条件写回地址栏，刷新和返回时保留
watch([query, category], ([q, c]) => {
  router.replace({
    query: { ...(q.trim() ? { q: q.trim() } : {}), ...(c !== 'all' ? { c } : {}) },
    hash: route.hash,
  })
})

function clearFilters() {
  query.value = ''
  category.value = 'all'
}

const teams = ref<ActiveTeam[] | null>(null)
const teamsState = ref<'loading' | 'ready' | 'error'>('loading')
const teamsError = ref('')

async function loadTeams() {
  teamsState.value = 'loading'
  try {
    teams.value = await api.listActiveTeams(4)
    teamsState.value = 'ready'
  } catch (e) {
    teamsError.value = errorMessage(e)
    teamsState.value = 'error'
  }
}

// 主视觉：搁板上并排的三盒，左鸣人、中五条悟、右虎杖
const heroProducts = ['NR-01', 'JJ-01', 'JJ-02'].map((id) => findProduct(id)!)

const liveTeams = computed(() => (teams.value ?? []).filter((t) => t.validEndTime > now.value))

onMounted(loadTeams)
</script>

<template>
  <section class="hero" aria-labelledby="hero-title">
    <div class="container hero-grid">
      <div class="hero-copy">
        <h1 id="hero-title"><span>拉上朋友</span><span>拼团开盒</span></h1>
        <p>《火影忍者》和《咒术回战》六款正版手办。两三个人拼一团，每人都按拼团价买；到期没凑齐，付的钱原路退回。</p>
        <div class="hero-actions">
          <a href="#shelf" class="btn btn-primary">看全部新品</a>
          <a href="#teams" class="btn btn-secondary">加入正在进行的拼团</a>
        </div>
      </div>

      <div class="hero-shelf">
        <div v-for="p in heroProducts" :key="p.id" class="hero-slot">
          <ProductCard :product="p" />
        </div>
      </div>
    </div>
  </section>

  <section id="shelf" class="container shelf" aria-labelledby="shelf-title">
    <div class="shelf-head">
      <h2 id="shelf-title">货架上的全部</h2>
      <div class="filters">
        <div class="search">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <input v-model="query" type="search" placeholder="搜索角色、作品、系列" aria-label="搜索展品" />
        </div>
        <div class="chips" role="group" aria-label="按分类筛选">
          <button type="button" class="chip" :aria-pressed="category === 'all'" @click="category = 'all'">全部</button>
          <button
            v-for="c in categories"
            :key="c.id"
            type="button"
            class="chip"
            :aria-pressed="category === c.id"
            @click="category = c.id"
          >
            {{ c.name }}
          </button>
        </div>
      </div>
    </div>
    <p class="count" aria-live="polite">共 {{ results.length }} 件</p>

    <div v-if="results.length" class="grid">
      <div v-for="p in results" :key="p.id" class="slot">
        <ProductCard :product="p" />
      </div>
    </div>
    <StateBlock
      v-else
      kind="empty"
      :title="`没有找到“${query.trim() || '所选分类'}”相关的展品`"
      detail="换个关键词试试，或者清除筛选看看全部六款。"
      action-label="清除筛选"
      @action="clearFilters"
    />
  </section>

  <section id="teams" class="teams" aria-labelledby="teams-title">
    <div class="container">
      <div class="teams-head">
        <h2 id="teams-title">正在拼团</h2>
        <p>补上最后一个名额，马上成团。</p>
      </div>
      <StateBlock v-if="teamsState === 'loading'" kind="loading" title="正在加载拼团" />
      <StateBlock
        v-else-if="teamsState === 'error'"
        kind="error"
        title="拼团列表没有加载出来"
        :detail="teamsError"
        action-label="重新加载"
        @action="loadTeams"
      />
      <p v-else-if="teams === null" class="teams-note">
        实时拼团按商品查询。打开任意商品页，就能看到这件商品正在进行的拼团。
      </p>
      <StateBlock
        v-else-if="liveTeams.length === 0"
        kind="empty"
        title="现在没有可以加入的拼团"
        detail="挑一件喜欢的展品，自己发起一个吧。"
      />
      <ul v-else class="team-strip">
        <li v-for="t in liveTeams" :key="t.teamId">
          <RouterLink
            :to="{ path: `/products/${t.productId}`, hash: '#teams' }"
            class="team-card"
            :class="findProduct(t.productId)?.category"
          >
            <img :src="findProduct(t.productId)?.images[0].src" alt="" width="96" height="96" loading="lazy" />
            <span class="team-body">
              <span class="team-name">{{ characterName(findProduct(t.productId)!) }}</span>
              <span class="team-meta">
                <span class="seats" aria-hidden="true">
                  <i v-for="i in t.targetCount" :key="i" :class="{ on: i <= t.lockCount }" />
                </span>
                还差 {{ t.targetCount - t.lockCount }} 人，剩余
                <span class="num">{{ formatCountdown(t.validEndTime - now) }}</span>
              </span>
            </span>
            <span class="team-go">去参团</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>

  <section class="container how" aria-labelledby="how-title">
    <h2 id="how-title">怎么拼团</h2>
    <ol class="steps">
      <li>
        <h3>选一件展品</h3>
        <p>在商品页发起新拼团，或者加入别人还没满员的拼团。</p>
      </li>
      <li>
        <h3>付款锁定名额</h3>
        <p>按拼团价付款后名额就是你的。每个拼团都有倒计时，到点就停止加入。</p>
      </li>
      <li>
        <h3>人齐成团</h3>
        <p>人数凑齐即拼团成功，等待发货。到期没凑齐，已付款项原路退回。</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
/* 主视觉：左侧大字，右侧一块搁板上立着三盒 */
.hero {
  padding: clamp(32px, 5vw, 64px) 0 clamp(40px, 6vw, 80px);
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 6fr);
  align-items: end;
  gap: clamp(24px, 5vw, 64px);
}

.hero-copy h1 {
  font-size: clamp(3rem, 6.6vw, 5.75rem);
  line-height: 1;
}

.hero-copy h1 span {
  display: block;
}

.hero-copy p {
  margin-top: 18px;
  max-width: 26em;
  color: var(--graphite);
  font-size: var(--t-lg);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.hero-shelf {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: clamp(12px, 2vw, 24px);
  padding: 0 clamp(4px, 1.5vw, 20px) 14px;
  animation: rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.hero-slot:nth-child(1) {
  transform: rotate(-3deg);
}

.hero-slot:nth-child(2) {
  z-index: 1;
  transform: translateY(-18px) scale(1.06);
}

.hero-slot:nth-child(3) {
  transform: rotate(3deg);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

/* 盒子脚下一团柔和的接触阴影，像立在台面上，不再画搁板 */
.hero-slot,
.slot {
  position: relative;
}

.hero-slot::after,
.slot::after {
  content: '';
  position: absolute;
  z-index: -1;
  left: 6%;
  right: 6%;
  bottom: -14px;
  height: 28px;
  background: radial-gradient(closest-side, rgba(22, 26, 58, 0.22), transparent);
}

.shelf {
  padding-top: 40px;
  scroll-margin-top: 90px;
}

.shelf-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

h2 {
  font-size: clamp(2rem, 3.4vw, 2.5rem);
  line-height: 1;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search {
  position: relative;
  flex: 1 1 220px;
}

.search svg {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--graphite);
}

.search input {
  width: 100%;
  height: 44px;
  padding: 0 14px 0 40px;
  border: 2px solid var(--line);
  border-radius: var(--r-field);
  background: var(--card);
}

.search input:focus {
  border-color: var(--ink);
  outline: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  height: 40px;
  padding: 0 16px;
  border: 2px solid var(--ink);
  border-radius: 10px;
  background: var(--card);
  font-size: var(--t-sm);
  font-weight: 700;
  cursor: pointer;
}

.chip:hover {
  background: var(--sticker);
}

.chip[aria-pressed='true'] {
  background: var(--ink);
  color: #fff;
}

.count {
  margin: 20px 0 16px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

/* 商品格 */
.grid {
  --shelf-gap: 36px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 48px var(--shelf-gap);
  padding: 0 12px 16px;
  isolation: isolate;
}


/* 正在拼团：整条墨蓝色带 */
.teams {
  margin-top: 88px;
  padding: 56px 0 64px;
  background: var(--ink);
  color: #fff;
  scroll-margin-top: 60px;
}

.teams-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 24px;
}

.teams-head p {
  color: rgba(255, 255, 255, 0.72);
}

.teams :deep(.state) {
  color: var(--ink);
}

.teams-note {
  padding: 20px 24px;
  border-radius: var(--r-plinth);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.team-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-card {
  --series: var(--naruto);
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 16px 10px 10px;
  border-radius: 12px;
  border-left: 8px solid var(--series);
  background: var(--card);
  color: var(--ink);
  text-decoration: none;
  transition: transform 0.15s;
}

.team-card.jjk {
  --series: var(--jjk);
}

.team-card:hover {
  transform: translateY(-2px);
}

.team-card img {
  width: 64px;
  height: 80px;
  border-radius: 8px;
  background: var(--plinth);
  object-fit: cover;
  object-position: center 25%;
}

.team-body {
  display: grid;
  min-width: 0;
}

.team-name {
  font-family: var(--font-display);
  font-size: 1.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-meta {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.seats {
  display: inline-flex;
  gap: 3px;
  margin-right: 6px;
  vertical-align: -1px;
}

.seats i {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  border: 2px solid var(--series);
}

.seats i.on {
  background: var(--series);
}

.team-meta .num {
  color: var(--ink);
  font-size: 0.95rem;
}

.team-go {
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  font-weight: 900;
  font-size: var(--t-sm);
  white-space: nowrap;
}

.how {
  padding-top: 72px;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  counter-increment: step;
  position: relative;
  padding: 22px 22px 22px 84px;
  border-radius: var(--r-plinth);
  background: var(--card);
  box-shadow: var(--shadow-box);
}

/* 玩法是真实的先后步骤，所以用序号，做成黄色贴纸 */
.steps li::before {
  content: counter(step);
  position: absolute;
  left: 20px;
  top: 20px;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--sticker);
  font-family: var(--font-num);
  font-size: 1.5rem;
  line-height: 1;
}

.steps h3 {
  font-size: 1.375rem;
}

.steps p {
  margin-top: 4px;
  color: var(--graphite);
  font-size: var(--t-sm);
}

@media (max-width: 960px) {
  .grid {
    --shelf-gap: 24px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 44px var(--shelf-gap);
  }
  .steps {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .hero-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .hero-shelf {
    width: min(100%, 600px);
    margin-inline: auto;
  }
}

@media (max-width: 720px) {
  .team-strip {
    grid-template-columns: 1fr;
  }
  .hero-actions .btn {
    flex: 1 1 auto;
  }
}

@media (max-width: 480px) {
  .grid {
    --shelf-gap: 14px;
    gap: 32px var(--shelf-gap);
    padding-inline: 4px;
  }
  .hero-shelf {
    gap: 8px;
  }
  .hero-slot:nth-child(2) {
    transform: translateY(-10px) scale(1.04);
  }
  .shelf-head {
    align-items: stretch;
  }
  .filters {
    width: 100%;
  }
  .chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    width: 100%;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
  }
  .team-card {
    grid-template-columns: 52px 1fr auto;
    gap: 10px;
  }
  .team-card img {
    width: 52px;
    height: 66px;
  }
}
</style>
