import '@fontsource-variable/bricolage-grotesque/wdth.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { handleUnauthorized, session } from './api'
import App from './App.vue'
import './styles/base.css'

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { title: '登录', public: true } },
    { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { title: '概览' } },
    { path: '/products', name: 'products', component: () => import('./views/ProductsView.vue'), meta: { title: '商品' } },
    { path: '/activities', name: 'activities', component: () => import('./views/ActivitiesView.vue'), meta: { title: '拼团活动' } },
    { path: '/teams', name: 'teams', component: () => import('./views/TeamsView.vue'), meta: { title: '拼团队伍' } },
    { path: '/orders', name: 'orders', component: () => import('./views/OrdersView.vue'), meta: { title: '商城订单' } },
    { path: '/switches', name: 'switches', component: () => import('./views/SwitchesView.vue'), meta: { title: '运行开关' } },
    { path: '/notify', name: 'notify', component: () => import('./views/NotifyView.vue'), meta: { title: '通知任务' } },
    { path: '/:p(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (!to.meta.public && !session.token) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && session.token) return '/'
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '')} | 玩集管理台`
})

handleUnauthorized(() => {
  const current = router.currentRoute.value
  if (current.name !== 'login') router.push({ name: 'login', query: { redirect: current.fullPath } })
})

createApp(App).use(router).mount('#app')
