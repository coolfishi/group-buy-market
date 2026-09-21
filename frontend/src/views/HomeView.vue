<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProductCard from '@/components/ProductCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { useNow } from '@/composables/useNow'
import { categories, filterProducts, findProduct, products } from '@/data/products'
import { api, errorMessage } from '@/services'
import type { ActiveTeam, CategoryId } from '@/types'
import { formatCountdown } from '@/utils/format'

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

// 主视觉三张海报：左鸣人、中五条悟、右虎杖
const heroPosters = (
  [
    ['NR-01', 'left'],
    ['JJ-01', 'center'],
    ['JJ-02', 'right'],
  ] as const
).map(([id, pos]) => {
  const p = findProduct(id)!
  return { id, pos, src: p.images[0].src, alt: p.images[0].alt }
})

const liveTeams = computed(() => (teams.value ?? []).filter((t) => t.validEndTime > now.value))

onMounted(loadTeams)
</script>

<template>
  <section class="window" aria-labelledby="hero-title">
    <div class="container stage">
      <p class="wordmark" aria-hidden="true">TOYSPACE</p>
      <div class="posters">
        <RouterLink v-for="p in heroPosters" :key="p.id" :to="`/products/${p.id}`" class="poster" :class="p.pos">
          <img :src="p.src" :alt="p.alt" width="550" height="800" fetchpriority="high" />
        </RouterLink>
      </div>
    </div>
    <div class="floor">
      <div class="container intro">
        <div class="intro-copy">
          <h1 id="hero-title">忍者与咒术师上展台</h1>
          <p>《火影忍者》和《咒术回战》六款手办。约上朋友一起拼，人齐就按拼团价成交。</p>
        </div>
        <div class="intro-actions">
          <a href="#shelf" class="btn btn-primary">看全部新品</a>
          <a href="#teams" class="btn btn-secondary">加入正在进行的拼团</a>
        </div>
      </div>
    </div>
  </section>

  <section id="shelf" class="container shelf" aria-labelledby="shelf-title">
    <div class="shelf-head">
      <h2 id="shelf-title">本季展品</h2>
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
      <ProductCard v-for="p in results" :key="p.id" :product="p" />
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

  <section id="teams" class="container teams" aria-labelledby="teams-title">
    <h2 id="teams-title">正在拼团</h2>
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
        <RouterLink :to="{ path: `/products/${t.productId}`, hash: '#teams' }" class="team-card">
          <img :src="findProduct(t.productId)?.images[0].src" alt="" width="96" height="96" loading="lazy" />
          <span class="team-body">
            <span class="team-name">{{ findProduct(t.productId)?.name }}</span>
            <span class="team-meta">
              还差 {{ t.targetCount - t.lockCount }} 人，剩余
              <span class="num">{{ formatCountdown(t.validEndTime - now) }}</span>
            </span>
          </span>
          <span class="team-go">去参团</span>
        </RouterLink>
      </li>
    </ul>
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
/* 橱窗：巨大字标在后，三张手办海报压在字标下半部分 */
.window {
  overflow: hidden;
  padding-top: clamp(20px, 4vw, 48px);
}

.stage {
  position: relative;
  z-index: 1;
}

/* 展台地面：海报底部落在地面上 */
.floor {
  margin-top: clamp(-120px, -9vw, -36px);
  padding-top: clamp(48px, 8vw, 120px);
  background: var(--plinth);
}

.wordmark {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(3.9rem, 17.2vw, 14.25rem);
  line-height: 0.82;
  letter-spacing: -0.045em;
  text-align: center;
  color: var(--ink);
  user-select: none;
  white-space: nowrap;
}

.posters {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: clamp(10px, 2vw, 24px);
  margin-top: clamp(-120px, -9vw, -34px);
  animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.poster {
  display: block;
  width: clamp(92px, 20vw, 250px);
  aspect-ratio: 11 / 16;
  border-radius: var(--r-plinth);
  overflow: hidden;
  background: var(--ink);
  outline: 6px solid var(--paper);
}

.poster.center {
  width: clamp(116px, 25vw, 310px);
}

.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.poster:hover img {
  transform: scale(1.04);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
}

.intro {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px 40px;
  padding-block: clamp(20px, 3vw, 36px) 44px;
}

.intro-copy {
  max-width: 34em;
}

.intro h1 {
  font-size: var(--t-3xl);
  letter-spacing: -0.02em;
}

.intro p {
  margin-top: 10px;
  color: var(--graphite);
  font-size: var(--t-lg);
}

.intro-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.shelf {
  padding-top: 72px;
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
  font-size: var(--t-2xl);
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
  border: 1.5px solid var(--line);
  border-radius: var(--r-field);
  background: #fff;
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
  border: 1.5px solid var(--line);
  border-radius: 999px;
  background: transparent;
  font-size: var(--t-sm);
  cursor: pointer;
}

.chip:hover {
  border-color: var(--ink);
}

.chip[aria-pressed='true'] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
  font-weight: 700;
}

.count {
  margin: 20px 0 16px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 40px 28px;
}

.teams {
  padding-top: 88px;
  scroll-margin-top: 90px;
}

.teams h2 {
  margin-bottom: 20px;
}

.teams-note {
  padding: 20px 24px;
  border-radius: var(--r-plinth);
  background: var(--plinth);
  color: var(--graphite);
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
  display: grid;
  grid-template-columns: 72px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 10px 18px 10px 10px;
  border-radius: 18px;
  background: var(--violet-mist);
  text-decoration: none;
}

.team-card img {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: var(--plinth);
  object-fit: cover;
  object-position: center 25%;
}

.team-body {
  display: grid;
  min-width: 0;
}

.team-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-meta {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.team-meta .num {
  color: var(--ink);
  font-weight: 700;
}

.team-go {
  font-weight: 700;
  color: var(--violet);
  font-size: var(--t-sm);
}

.team-card:hover {
  background: #e4d9ff;
}

.how {
  padding-top: 88px;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  counter-increment: step;
  padding-top: 16px;
  border-top: 2px solid var(--ink);
}

/* 玩法是真实的先后步骤，所以用序号 */
.steps li::before {
  content: counter(step);
  display: block;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 2.5rem;
  line-height: 1;
  color: var(--violet);
  margin-bottom: 12px;
}

.steps h3 {
  font-size: var(--t-lg);
}

.steps p {
  margin-top: 6px;
  color: var(--graphite);
  font-size: var(--t-sm);
  max-width: 26em;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px 20px;
  }
}

@media (max-width: 720px) {
  .team-strip,
  .steps {
    grid-template-columns: 1fr;
  }
  .intro-actions {
    width: 100%;
  }
  .intro-actions .btn {
    flex: 1 1 auto;
  }
}

@media (max-width: 480px) {
  .grid {
    gap: 28px 14px;
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
    grid-template-columns: 56px 1fr auto;
    gap: 12px;
  }
  .team-card img {
    width: 56px;
    height: 56px;
  }
}
</style>
