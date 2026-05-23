<script setup lang="ts">
import type { ProjectResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const userCompany = ref('')
const myUsername = ref('')
const projects = ref<ProjectResponse[]>([])
const loadError = ref('')

onMounted(async () => {
  try {
    const me = await api.auth.me(auth.token)
    userCompany.value = me.company
    myUsername.value = me.username
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
</script>

<template>
  <div class="max-w-3xl mx-auto mt-10 px-4 pb-16 space-y-8">

    <!-- Header -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <NuxtLink to="/home" class="text-sm text-gray-400 hover:text-gray-600 transition">← Home</NuxtLink>
        <h1 class="text-2xl font-bold">Projects</h1>
      </div>
      <button @click="auth.logout()" class="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
    </div>

    <!-- Create project panel -->
    <div class="bg-white rounded-lg border p-6 space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="font-semibold text-gray-700">Create Project</h2>
        <button @click="showCreateForm = !showCreateForm"
          class="text-sm text-blue-600 hover:text-blue-800 transition">
          {{ showCreateForm ? 'Cancel' : '+ New Project' }}
        </button>
      </div>

      <div v-if="showCreateForm" class="space-y-3">
        <div class="flex gap-3 flex-wrap">
          <input v-model="newProjId" type="text" placeholder="Project ID (e.g. project-alpha)"
            class="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-40" />
          <input v-model="newDisplayName" type="text" placeholder="Display Name"
            class="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-40" />
        </div>
        <textarea v-model="newDescription" placeholder="Description (optional)"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20" />
        <div v-if="createError" class="text-sm text-red-600">{{ createError }}</div>
        <button @click="createProject" :disabled="creating"
          class="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 transition disabled:opacity-50">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>

    <!-- Load error -->
    <p v-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

    <!-- Project list -->
    <div v-if="projects.length === 0 && !loadError" class="text-sm text-gray-400 text-center py-8">
      No projects found. Create one above.
    </div>

    <div v-for="project in projects" :key="project.proj_id"
      class="bg-white rounded-lg border p-6 space-y-4">

      <!-- Project header -->
      <div class="flex justify-between items-start">
        <div class="space-y-1">
          <h3 class="font-semibold text-gray-800">{{ project.display_name }}</h3>
          <span class="font-mono text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{{ project.proj_id }}</span>
          <p v-if="project.description" class="text-sm text-gray-500">{{ project.description }}</p>
          <p class="text-xs text-gray-400">Created by {{ project.created_by }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <NuxtLink
            :to="`/config?proj=${encodeURIComponent(project.proj_id)}&cmp=${encodeURIComponent(userCompany)}`"
            class="bg-blue-600 text-white rounded px-3 py-1.5 text-sm hover:bg-blue-700 transition whitespace-nowrap">
            Manage Config
          </NuxtLink>
          <button @click="deleteProject(project.proj_id)"
            class="text-gray-400 hover:text-red-500 transition text-lg leading-none"
            title="Delete project">
            🗑
          </button>
        </div>
      </div>

      <!-- Companies -->
      <div class="flex flex-wrap gap-2 items-center">
        <span v-if="project.companies.length === 0 && !addingCompany[project.proj_id]"
          class="text-xs text-gray-400">No companies</span>
        <span v-for="cmp in project.companies" :key="cmp"
          class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-3 py-0.5 text-xs font-medium">
          {{ cmp }}
          <button @click="removeCompany(project.proj_id, cmp)"
            class="text-blue-400 hover:text-red-500 transition leading-none text-base">×</button>
        </span>
        <template v-if="addingCompany[project.proj_id]">
          <input v-model="newCmpInput[project.proj_id]"
            @keydown.enter="addCompany(project.proj_id)"
            @keydown.escape="addingCompany[project.proj_id] = false"
            placeholder="company ID"
            class="border rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
            autofocus />
          <button @click="addCompany(project.proj_id)"
            class="text-xs text-blue-600 hover:text-blue-800 transition">✓</button>
          <button @click="addingCompany[project.proj_id] = false"
            class="text-xs text-gray-400 hover:text-gray-600 transition">✕</button>
        </template>
        <button v-else-if="myUsername && myUsername === project.created_by"
          @click="addingCompany[project.proj_id] = true"
          class="text-xs text-gray-400 hover:text-blue-600 transition">+ add</button>
      </div>

    </div>

  </div>
</template>
