<script setup lang="ts">
import type { CompanyResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const companies = ref<CompanyResponse[]>([])
const loadError = ref('')

onMounted(fetchCompanies)

async function fetchCompanies() {
  loadError.value = ''
  try {
    companies.value = await api.companies.list(auth.token)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load companies'
  }
}

// ── Create company ────────────────────────────────────────────────────────────

const showCreateForm = ref(false)
const newCmpId = ref('')
const newDisplayName = ref('')
const newDescription = ref('')
const createError = ref('')
const creating = ref(false)

async function createCompany() {
  createError.value = ''
  if (!newCmpId.value.trim() || !newDisplayName.value.trim()) {
    createError.value = 'Company ID and Display Name are required.'
    return
  }
  creating.value = true
  try {
    await api.companies.create({
      cmp_id: newCmpId.value.trim(),
      display_name: newDisplayName.value.trim(),
      description: newDescription.value.trim() || undefined,
    }, auth.token)
    newCmpId.value = ''
    newDisplayName.value = ''
    newDescription.value = ''
    showCreateForm.value = false
    await fetchCompanies()
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : 'Failed to create company'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/home" class="text-sm text-slate-400 hover:text-slate-700 transition">← Home</NuxtLink>
          <span class="text-slate-200 select-none">|</span>
          <h1 class="font-semibold text-slate-900 text-sm">Companies</h1>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition">Logout</button>
      </div>
    </nav>

    <div class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-3">

      <!-- Create panel -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4">
          <span class="font-medium text-slate-800 text-sm">Create Company</span>
          <button @click="showCreateForm = !showCreateForm"
            class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
            {{ showCreateForm ? 'Cancel' : '+ New' }}
          </button>
        </div>
        <div v-if="showCreateForm" class="border-t border-slate-50 px-5 py-4 space-y-3">
          <div class="flex gap-3 flex-wrap">
            <input v-model="newCmpId" type="text" placeholder="Company ID (e.g. acme-corp)"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
            <input v-model="newDisplayName" type="text" placeholder="Display Name"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
          </div>
          <textarea v-model="newDescription" placeholder="Description (optional)"
            class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none h-20" />
          <div v-if="createError" class="text-sm text-red-600 font-medium">{{ createError }}</div>
          <button @click="createCompany" :disabled="creating"
            class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="loadError"
        class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">{{ loadError }}</div>

      <!-- Empty state -->
      <div v-if="companies.length === 0 && !loadError"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center">
        <p class="text-slate-400 text-sm">No companies yet.</p>
        <button @click="showCreateForm = true"
          class="mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold">Create the first one</button>
      </div>

      <!-- Company list -->
      <div class="space-y-2">
        <div v-for="company in companies" :key="company.cmp_id"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-semibold text-slate-900">{{ company.display_name }}</h3>
                <span class="font-mono text-xs bg-slate-100 text-slate-500 rounded-md px-2 py-0.5">{{ company.cmp_id }}</span>
              </div>
              <p v-if="company.description" class="text-sm text-slate-500 mt-1">{{ company.description }}</p>
              <p class="text-xs text-slate-400 mt-1">Created by {{ company.created_by }}</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
