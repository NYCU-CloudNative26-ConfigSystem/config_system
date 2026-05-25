<script setup lang="ts">
const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const { error, setError, clear } = useFormError()
const registerSuccess = route.query.registered === '1'

async function login() {
  clear()
  try {
    const res = await api.auth.login(email.value, password.value)
    auth.setToken(res.access_token)
    navigateTo('/home')
  } catch (e: unknown) {
    setError(e, 'Login failed. Please try again.')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/30">
          <span class="text-white text-sm font-bold tracking-tight">CS</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p class="text-sm text-slate-500 mt-1">Sign in to Config System</p>
      </div>

      <div class="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-7 space-y-4">
        <div v-if="registerSuccess"
          class="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-3 py-2.5">
          <span class="font-bold shrink-0">✓</span>
          <span>Account created — you can now sign in.</span>
        </div>

        <form @submit.prevent="login" class="space-y-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
            <input v-model="email" type="email" placeholder="you@example.com" required
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Password</label>
            <input v-model="password" type="password" placeholder="••••••••" required
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
          </div>
          <div v-if="error"
            class="flex items-start gap-2 rounded-xl bg-red-50 ring-1 ring-red-200 px-3 py-2.5 text-sm text-red-700">
            <span class="mt-0.5 shrink-0">⚠</span><span>{{ error }}</span>
          </div>
          <button type="submit"
            class="w-full bg-blue-600 text-white rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-blue-700 active:scale-[0.99] transition">
            Sign in
          </button>
        </form>
      </div>

      <p class="text-sm text-center text-slate-500 mt-5">
        No account?
        <NuxtLink to="/register" class="text-blue-600 hover:text-blue-700 font-semibold">Create one</NuxtLink>
      </p>
    </div>
  </div>
</template>
