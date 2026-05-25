<script setup lang="ts">
import type { CompanyResponse, ProjectResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const userCompany = ref('')
const myUsername = ref('')
const allCompanies = ref<CompanyResponse[]>([])
const projects = ref<ProjectResponse[]>([])
const loadError = ref('')

onMounted(async () => {
  try {
    const [me, cmps] = await Promise.all([
      api.auth.me(auth.token),
      api.companies.list(auth.token),
    ])
    userCompany.value = me.company
    myUsername.value = me.username
    allCompanies.value = cmps
  } catch { /* stay blank */ }
  await fetchProjects()
})

async function fetchProjects() {
  loadError.value = ''
  try {
    projects.value = await api.projects.list(auth.token)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load projects'
  }
}

// ── Create project ────────────────────────────────────────────────────────────

const showCreateForm = ref(false)
const newProjId = ref('')
const newDisplayName = ref('')
const newDescription = ref('')
const createError = ref('')
const creating = ref(false)

async function createProject() {
  createError.value = ''
  if (!newProjId.value.trim() || !newDisplayName.value.trim()) {
    createError.value = 'Project ID and Display Name are required.'
    return
  }
  creating.value = true
  try {
    await api.projects.create({
      proj_id: newProjId.value.trim(),
      display_name: newDisplayName.value.trim(),
      description: newDescription.value.trim() || undefined,
    }, auth.token)
    newProjId.value = ''
    newDisplayName.value = ''
    newDescription.value = ''
    showCreateForm.value = false
    await fetchProjects()
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : 'Failed to create project'
  } finally {
    creating.value = false
  }
}

// ── Add / remove company ──────────────────────────────────────────────────────

const addingCompany = ref<Record<string, boolean>>({})
const newCmpInput = ref<Record<string, string>>({})

async function addCompany(projId: string) {
  const cmp = newCmpInput.value[projId]?.trim()
  if (!cmp) return
  try {
    await api.projects.addCompany(projId, cmp, auth.token)
    newCmpInput.value[projId] = ''
    addingCompany.value[projId] = false
    await fetchProjects()
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to add company')
  }
}

async function removeCompany(projId: string, cmpId: string) {
  const name = allCompanies.value.find(c => c.cmp_id === cmpId)?.display_name ?? cmpId
  if (!confirm(`Remove "${name}" from this project?`)) return
  try {
    await api.projects.removeCompany(projId, cmpId, auth.token)
    await fetchProjects()
  } catch { /* silently ignore */ }
}

// ── Delete project ────────────────────────────────────────────────────────────

async function deleteProject(projId: string) {
  if (!confirm(`Delete project "${projId}"? This cannot be undone.`)) return
  try {
    await api.projects.delete(projId, auth.token)
    await fetchProjects()
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to delete project')
  }
}

// ── Company display mode ──────────────────────────────────────────────────────

const DISPLAY_MODES = ['truncated', 'collapsible', 'badge'] as const
type DisplayMode = typeof DISPLAY_MODES[number]
const companyDisplayMode = ref<DisplayMode>('truncated')
const expandedCompanies = ref<Record<string, boolean>>({})
const CHIPS_VISIBLE = 3

function modeLabel(m: DisplayMode) {
  return m === 'truncated' ? 'Truncated' : m === 'collapsible' ? 'Collapsible' : 'Badge'
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/home" class="text-sm text-slate-400 hover:text-slate-700 transition">← Home</NuxtLink>
          <span class="text-slate-200 select-none">|</span>
          <h1 class="font-semibold text-slate-900 text-sm">Projects</h1>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition">Logout</button>
      </div>
    </nav>

    <div class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-3">

      <!-- Create project panel -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4">
          <span class="font-medium text-slate-800 text-sm">Create Project</span>
          <button @click="showCreateForm = !showCreateForm"
            class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
            {{ showCreateForm ? 'Cancel' : '+ New' }}
          </button>
        </div>
        <div v-if="showCreateForm" class="border-t border-slate-50 px-5 py-4 space-y-3">
          <div class="flex gap-3 flex-wrap">
            <input v-model="newProjId" type="text" placeholder="Project ID (e.g. project-alpha)"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
            <input v-model="newDisplayName" type="text" placeholder="Display Name"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
          </div>
          <textarea v-model="newDescription" placeholder="Description (optional)"
            class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none h-20" />
          <div v-if="createError" class="text-sm text-red-600 font-medium">{{ createError }}</div>
          <button @click="createProject" :disabled="creating"
            class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="loadError"
        class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">{{ loadError }}</div>

      <!-- Empty state -->
      <div v-if="projects.length === 0 && !loadError"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center">
        <p class="text-slate-400 text-sm">No projects yet.</p>
        <button @click="showCreateForm = true"
          class="mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold">Create the first one</button>
      </div>

      <!-- Mode switcher -->
      <div v-if="projects.length > 0" class="flex items-center gap-2">
        <span class="text-xs text-slate-400 font-medium shrink-0">Company display:</span>
        <div class="flex items-center gap-0.5 bg-white rounded-xl ring-1 ring-slate-900/5 p-1">
          <button
            v-for="m in DISPLAY_MODES" :key="m"
            @click="companyDisplayMode = m; expandedCompanies = {}"
            :class="companyDisplayMode === m
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition">
            {{ modeLabel(m) }}
          </button>
        </div>
      </div>

      <!-- Project cards -->
      <div class="space-y-3">
        <div v-for="project in projects" :key="project.proj_id"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 space-y-4">

          <!-- Header -->
          <div class="flex gap-3 items-start justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-semibold text-slate-900">{{ project.display_name }}</h3>
                <span class="font-mono text-xs bg-slate-100 text-slate-500 rounded-md px-2 py-0.5">{{ project.proj_id }}</span>
              </div>
              <p v-if="project.description" class="text-sm text-slate-500">{{ project.description }}</p>
              <p class="text-xs text-slate-400">Created by {{ project.created_by }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <NuxtLink
                :to="`/config?proj=${encodeURIComponent(project.proj_id)}`"
                class="bg-blue-600 text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 transition whitespace-nowrap">
                Manage Config
              </NuxtLink>
              <button @click="deleteProject(project.proj_id)"
                class="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition text-sm"
                title="Delete project">✕</button>
            </div>
          </div>

          <!-- ── Mode A: Truncated chips ── -->
          <template v-if="companyDisplayMode === 'truncated'">
            <div class="flex flex-wrap gap-1.5 items-center">
              <span v-if="project.companies.length === 0 && !addingCompany[project.proj_id]"
                class="text-xs text-slate-400">No companies linked</span>

              <NuxtLink
                v-for="cmp in (expandedCompanies[project.proj_id]
                  ? project.companies
                  : project.companies.slice(0, CHIPS_VISIBLE))"
                :key="cmp"
                :to="`/config?proj=${encodeURIComponent(project.proj_id)}&cmp=${encodeURIComponent(cmp)}`"
                class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-blue-100 transition">
                {{ allCompanies.find(c => c.cmp_id === cmp)?.display_name ?? cmp }}
                <button @click.prevent.stop="removeCompany(project.proj_id, cmp)"
                  class="text-blue-400 hover:text-red-500 transition leading-none ml-0.5">×</button>
              </NuxtLink>

              <button
                v-if="!expandedCompanies[project.proj_id] && project.companies.length > CHIPS_VISIBLE"
                @click="expandedCompanies[project.proj_id] = true"
                class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full px-2.5 py-1 text-xs font-semibold transition">
                +{{ project.companies.length - CHIPS_VISIBLE }} more
              </button>
              <button
                v-if="expandedCompanies[project.proj_id] && project.companies.length > CHIPS_VISIBLE"
                @click="expandedCompanies[project.proj_id] = false"
                class="text-xs text-slate-400 hover:text-slate-600 transition">
                show less
              </button>

              <template v-if="addingCompany[project.proj_id]">
                <CompanySearch
                  v-model="newCmpInput[project.proj_id]"
                  :companies="allCompanies.filter(c => !project.companies.includes(c.cmp_id))"
                  placeholder="Search company…"
                  input-class="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-xs bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-36 transition"
                />
                <button @click="addCompany(project.proj_id)"
                  class="text-xs text-blue-600 hover:text-blue-800 font-semibold transition">✓</button>
                <button @click="addingCompany[project.proj_id] = false"
                  class="text-xs text-slate-400 hover:text-slate-600 transition">✕</button>
              </template>
              <button v-else-if="myUsername && myUsername === project.created_by"
                @click="addingCompany[project.proj_id] = true"
                class="text-xs text-slate-400 hover:text-blue-600 transition px-2 py-0.5 rounded-full hover:bg-blue-50">
                + add
              </button>
            </div>
          </template>

          <!-- ── Mode B: Collapsible section ── -->
          <template v-else-if="companyDisplayMode === 'collapsible'">
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <button
                  @click="expandedCompanies[project.proj_id] = !expandedCompanies[project.proj_id]"
                  class="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition">
                  <span
                    class="inline-block transition-transform duration-150 text-slate-300 text-[10px]"
                    :class="expandedCompanies[project.proj_id] ? 'rotate-90' : ''">▶</span>
                  <span v-if="project.companies.length === 0">No companies linked</span>
                  <span v-else>{{ project.companies.length }} {{ project.companies.length === 1 ? 'company' : 'companies' }}</span>
                </button>
                <template v-if="addingCompany[project.proj_id]">
                  <CompanySearch
                    v-model="newCmpInput[project.proj_id]"
                    :companies="allCompanies.filter(c => !project.companies.includes(c.cmp_id))"
                    placeholder="Search company…"
                    input-class="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-xs bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-36 transition"
                  />
                  <button @click="addCompany(project.proj_id)"
                    class="text-xs text-blue-600 hover:text-blue-800 font-semibold transition">✓</button>
                  <button @click="addingCompany[project.proj_id] = false"
                    class="text-xs text-slate-400 hover:text-slate-600 transition">✕</button>
                </template>
                <button v-else-if="myUsername && myUsername === project.created_by"
                  @click="addingCompany[project.proj_id] = true"
                  class="text-xs text-slate-400 hover:text-blue-600 transition px-2 py-0.5 rounded-full hover:bg-blue-50">
                  + add
                </button>
              </div>

              <div v-if="expandedCompanies[project.proj_id] && project.companies.length > 0"
                class="flex flex-wrap gap-1.5 pl-4">
                <NuxtLink v-for="cmp in project.companies" :key="cmp"
                  :to="`/config?proj=${encodeURIComponent(project.proj_id)}&cmp=${encodeURIComponent(cmp)}`"
                  class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-blue-100 transition">
                  {{ allCompanies.find(c => c.cmp_id === cmp)?.display_name ?? cmp }}
                  <button @click.prevent.stop="removeCompany(project.proj_id, cmp)"
                    class="text-blue-400 hover:text-red-500 transition leading-none ml-0.5">×</button>
                </NuxtLink>
              </div>
            </div>
          </template>

          <!-- ── Mode C: Count badge ── -->
          <template v-else>
            <div class="flex items-center gap-3">
              <NuxtLink v-if="project.companies.length > 0"
                :to="`/config?proj=${encodeURIComponent(project.proj_id)}`"
                class="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-full px-3 py-1 text-xs font-semibold transition">
                {{ project.companies.length }} {{ project.companies.length === 1 ? 'company' : 'companies' }} →
              </NuxtLink>
              <span v-else class="text-xs text-slate-400">No companies linked</span>

              <template v-if="addingCompany[project.proj_id]">
                <CompanySearch
                  v-model="newCmpInput[project.proj_id]"
                  :companies="allCompanies.filter(c => !project.companies.includes(c.cmp_id))"
                  placeholder="Search company…"
                  input-class="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-xs bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-36 transition"
                />
                <button @click="addCompany(project.proj_id)"
                  class="text-xs text-blue-600 hover:text-blue-800 font-semibold transition">✓</button>
                <button @click="addingCompany[project.proj_id] = false"
                  class="text-xs text-slate-400 hover:text-slate-600 transition">✕</button>
              </template>
              <button v-else-if="myUsername && myUsername === project.created_by"
                @click="addingCompany[project.proj_id] = true"
                class="text-xs text-slate-400 hover:text-blue-600 transition px-2 py-0.5 rounded-full hover:bg-blue-50">
                + add
              </button>
            </div>
          </template>

        </div>
      </div>

    </div>
  </div>
</template>
