import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appConfig } from '@/config/env'
import type { User } from '@/types'

// 演示账号与真实账号分别存储，切换模式不会串号
export const SESSION_KEY = appConfig.mode === 'demo' ? 'toyspace.demo.session' : 'toyspace.live.session'

function readSession(): User | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    return parsed && typeof parsed.userId === 'string' ? parsed : null
  } catch {
    return null
  }
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(readSession())
  const isLoggedIn = computed(() => user.value !== null)

  function login(next: User) {
    user.value = next
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      /* 存储不可用时仅保留内存会话 */
    }
  }

  function logout() {
    user.value = null
    try {
      window.localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  return { user, isLoggedIn, login, logout }
})
