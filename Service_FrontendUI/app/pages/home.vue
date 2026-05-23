<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const statuses = ref<Record<string, 'ok' | 'error' | 'checking'>>({
  login: 'checking',
  config: 'checking',
  template: 'checking',
  version: 'checking',
})

async function checkHealth() {
  const checks: [string, () => Promise<{ status: string }>][] = [
    ['login', api.health.login],
    ['config', api.health.config],
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
  <div class="max-w-lg mx-auto mt-12 px-4 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">Service Health</h1>
      <div class="flex items-center gap-4">
        <NuxtLink to="/projects" class="text-sm text-blue-600 hover:underline">Projects</NuxtLink>
        <NuxtLink to="/config" class="text-sm text-blue-600 hover:underline">Config Manager</NuxtLink>
        <button @click="auth.logout()" class="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
      </div>
    </div>
    <div class="space-y-2">
      <div v-for="(status, name) in statuses" :key="name" class="flex items-center gap-4">
        <span class="w-28 text-gray-700 capitalize">{{ name }}</span>
        <span :class="{
          'text-green-600 font-semibold': status === 'ok',
          'text-red-600 font-semibold': status === 'error',
          'text-gray-400': status === 'checking',
        }">{{ status }}</span>
      </div>
    </div>
    <button @click="checkHealth"
      class="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm transition">
      Refresh
    </button>
  </div>
</template>
