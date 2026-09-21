import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '精选' } },
      {
        path: '/products/:goodsId',
        name: 'product',
        component: () => import('@/views/ProductDetailView.vue'),
        props: true,
      },
      { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
      {
        path: '/orders',
        name: 'orders',
        component: () => import('@/views/OrdersView.vue'),
        meta: { title: '我的订单', requiresAuth: true },
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
    ],
    scrollBehavior(to, _from, saved) {
      if (saved) return saved
      if (to.hash) return { el: to.hash, top: 110 }
      return { top: 0 }
    },
  })

  router.beforeEach((to) => {
    const session = useSessionStore()
    if (to.meta.requiresAuth && !session.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.name === 'login' && session.isLoggedIn) {
      return typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') && !to.query.redirect.startsWith('//')
        ? to.query.redirect
        : '/'
    }
  })

  router.afterEach((to) => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : null
    document.title = title ? `${title} | 玩集 TOYSPACE` : '玩集 TOYSPACE'
  })

  return router
}
