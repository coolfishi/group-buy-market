<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, setToken } from '@/api'

const route = useRoute()
const router = useRouter()
const username = ref('admin')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await api<{ token: string; username: string }>('/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    setToken(res.token, res.username)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
    router.replace(redirect ? (route.query.redirect as string) : '/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="wrap">
    <form class="card" @submit.prevent="submit">
      <p class="brand"><span class="cn">玩集</span> <span class="en">TOYSPACE</span></p>
      <h1>管理台登录</h1>
      <label class="field">
        <span>用户名</span>
        <input v-model="username" class="input" autocomplete="username" required />
      </label>
      <label class="field">
        <span>密码</span>
        <input v-model="password" class="input" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary" :disabled="busy">
        <span v-if="busy" class="spinner" aria-hidden="true" />
        {{ busy ? '正在登录' : '登录' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.wrap {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 16px;
  background: var(--ink);
}
.card {
  display: grid;
  gap: 16px;
  width: min(380px, 100%);
  padding: 30px;
  border-radius: 20px;
  background: var(--paper);
}
.brand .cn {
  font-weight: 900;
}
.brand .en {
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--violet);
}
.btn {
  height: 42px;
}
</style>
