<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const statuses = ref<Record<string, 'ok' | 'error' | 'checking'>>({
  login: 'checking',
  config: 'checking',
  ssot: 'checking',
  template: 'checking',
  version: 'checking',
})

async function checkHealth() {
  const checks: [string, () => Promise<{ status: string }>][] = [
    ['login', api.health.login],
    ['config', api.health.config],
    ['ssot', api.health.ssot],
    ['template', api.health.template],
    ['version', api.health.version],
  ]
  for (const [key, fn] of checks) {
    statuses.value[key] = 'checking'
    try {
      await fn()
      statuses.value[key] = 'ok'
    } catch {
      statuses.value[key] = 'error'
    }
  }
}

onMounted(checkHealth)
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="bg-white border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span class="text-white text-xs font-bold leading-none">CS</span>
          </div>
          <span class="font-semibold text-slate-900 text-sm">Config System</span>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition">Logout</button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-4">
      <!-- Navigation cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NuxtLink to="/companies"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-violet-200 transition">
            <span class="text-violet-700 text-xs font-bold">CMP</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Companies</p>
          <p class="text-xs text-slate-400 mt-0.5">Manage organizations</p>
        </NuxtLink>

        <NuxtLink to="/projects"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-blue-200 transition">
            <span class="text-blue-700 text-xs font-bold">PRJ</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Projects</p>
          <p class="text-xs text-slate-400 mt-0.5">Assign companies and configs</p>
        </NuxtLink>

        <NuxtLink to="/config"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-200 transition">
            <span class="text-emerald-700 text-xs font-bold">CFG</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Config Manager</p>
          <p class="text-xs text-slate-400 mt-0.5">Browse config snapshots</p>
        </NuxtLink>
      </div>

      <!-- Service health -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <h2 class="font-semibold text-slate-900 text-sm">Service Health</h2>
          <button @click="checkHealth"
            class="text-xs font-medium text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
            Refresh
          </button>
        </div>
        <div class="divide-y divide-slate-50">
          <div v-for="(status, name) in statuses" :key="name"
            class="flex items-center gap-3 px-5 py-3">
            <div :class="{
              'bg-emerald-400': status === 'ok',
              'bg-red-400': status === 'error',
              'bg-slate-300 animate-pulse': status === 'checking',
            }" class="w-2 h-2 rounded-full shrink-0" />
            <span class="text-sm text-slate-700 capitalize flex-1">{{ name }}</span>
            <span :class="{
              'text-emerald-600': status === 'ok',
              'text-red-500': status === 'error',
              'text-slate-400': status === 'checking',
            }" class="text-xs font-semibold">{{ status }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
