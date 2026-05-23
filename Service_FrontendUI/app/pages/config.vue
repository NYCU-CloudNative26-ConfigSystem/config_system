<script setup lang="ts">
import type {
  ConfigReadResponse,
  ConfigWriteEntry,
  NodeResolveResponse,
  SearchResult,
  SsotConfigEntry,
} from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()

// ── User info ─────────────────────────────────────────────────────────────────

const userCompany = ref('')
const userName = ref('')
onMounted(async () => {
  try {
    const me = await api.auth.me(auth.token)
    userCompany.value = me.company
    userName.value = me.username
    cmpId.value = me.company
  } catch { /* stay blank */ }

  // pre-fill from query params (e.g. navigating from /projects)
  if (route.query.proj) projId.value = route.query.proj as string
  if (route.query.cmp) cmpId.value = route.query.cmp as string
  if (projId.value && cmpId.value) await loadConfig()
})

// ── Load config ───────────────────────────────────────────────────────────────

const projId = ref('')
const cmpId = ref('')
const loadError = ref('')
const configData = ref<ConfigReadResponse | null>(null)
const loading = ref(false)

async function loadConfig() {
  if (!projId.value || !cmpId.value) return
  loading.value = true
  loadError.value = ''
  configData.value = null
  try {
    configData.value = await api.configTable.getConfig(projId.value, cmpId.value, auth.token)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    loadError.value = msg.includes('404') ? 'No config found for this project.' : msg
  } finally {
    loading.value = false
  }
}

// ── Node resolve modal ────────────────────────────────────────────────────────

const modal = ref<{ uuid: string; data: NodeResolveResponse | null; loading: boolean; error: string } | null>(null)

async function openModal(rawUuid: string) {
  const uuid = rawUuid.startsWith('VALUE:') ? rawUuid.slice(6)
    : rawUuid.startsWith('GROUP:') ? rawUuid.slice(6)
    : rawUuid
  modal.value = { uuid, data: null, loading: true, error: '' }
  try {
    modal.value.data = await api.ssot.resolveNode(uuid, auth.token)
  } catch (e: unknown) {
    modal.value.error = e instanceof Error ? e.message : 'Failed to resolve node'
  } finally {
    if (modal.value) modal.value.loading = false
  }
}

function closeModal() { modal.value = null }

onMounted(() => {
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })
})

// ── Editor ────────────────────────────────────────────────────────────────────

interface EditorRow {
  id: number
  alias: string
  value: string
  isNew: boolean         // true = truth:null, false = existing TruthNode
  truthId: string        // filled when user picks from dropdown
  searchResults: SearchResult[]
  showDropdown: boolean
  searchTimer: ReturnType<typeof setTimeout> | null
}

const showEditor = ref(false)
const rows = ref<EditorRow[]>([])
const submitError = ref('')
const submitSuccess = ref(false)
const submitting = ref(false)
let rowIdCounter = 0

function addRow() {
  rows.value.push({
    id: rowIdCounter++,
    alias: '',
    value: '',
    isNew: true,
    truthId: '',
    searchResults: [],
    showDropdown: false,
    searchTimer: null,
  })
}

function removeRow(id: number) {
  rows.value = rows.value.filter(r => r.id !== id)
}

function onAliasInput(row: EditorRow) {
  if (!row.isNew) return
  if (row.searchTimer) clearTimeout(row.searchTimer)
  if (row.alias.trim().length < 1) { row.searchResults = []; row.showDropdown = false; return }
  row.searchTimer = setTimeout(async () => {
    try {
      row.searchResults = await api.ssot.search(row.alias, auth.token)
      row.showDropdown = row.searchResults.length > 0
    } catch { row.searchResults = []; row.showDropdown = false }
  }, 300)
}

function pickSearchResult(row: EditorRow, result: SearchResult) {
  row.alias = result.name
  row.truthId = result.truth
  row.value = result.latestValue !== null ? String(result.latestValue) : ''
  row.isNew = false
  row.showDropdown = false
}

function toggleNew(row: EditorRow) {
  row.isNew = !row.isNew
  if (row.isNew) { row.truthId = ''; row.value = '' }
  row.showDropdown = false
}

async function submitConfig() {
  submitError.value = ''
  submitSuccess.value = false

  if (rows.value.length === 0) { submitError.value = 'Add at least one row.'; return }
  if (!projId.value || !cmpId.value) { submitError.value = 'Project ID and Company ID are required.'; return }

  submitting.value = true
  try {
    // 1. POST to SSOT
    const ssotPayload = {
      CMPID: cmpId.value,
      projectID: projId.value,
      config: rows.value.map<SsotConfigEntry>(r => ({
        truth: r.isNew ? null : r.truthId,
        alias: r.alias,
        value: isNaN(Number(r.value)) ? r.value : Number(r.value),
      })),
    }
    const ssotRes = await api.ssot.postConfig(ssotPayload, auth.token)

    // 2. POST to Config Table
    const ctPayload = {
      proj_id: projId.value,
      cmp_id: cmpId.value,
      user_id: userName.value || 'unknown',
      entries: ssotRes.entries.map<ConfigWriteEntry>(e => ({
        key: e.nameId,
        val: e.valRef,
        group_entries: e.groupEntries,
      })),
    }
    await api.configTable.writeConfig(ctPayload, auth.token)

    submitSuccess.value = true
    rows.value = []
    showEditor.value = false
    await loadConfig()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
      submitError.value = `Conflict: ${msg}`
    } else {
      submitError.value = msg
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto mt-10 px-4 pb-16 space-y-8">

    <!-- Header -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <NuxtLink to="/home" class="text-sm text-gray-400 hover:text-gray-600 transition">← Home</NuxtLink>
        <h1 class="text-2xl font-bold">Config Manager</h1>
      </div>
      <button @click="auth.logout()" class="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
    </div>

    <!-- Load panel -->
    <div class="bg-white rounded-lg border p-6 space-y-4">
      <h2 class="font-semibold text-gray-700">Load Config</h2>
      <div class="flex gap-3 flex-wrap items-center">
        <div class="relative">
          <input :value="projId" readonly type="text" placeholder="Select a project from Projects page"
            class="border rounded px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed w-64 pr-8" />
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs select-none">🔒</span>
        </div>
        <input v-model="cmpId" type="text" placeholder="Company ID"
          class="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        <button @click="loadConfig" :disabled="loading || !projId || !cmpId"
          class="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 transition disabled:opacity-50">
          {{ loading ? 'Loading…' : 'Load' }}
        </button>
      </div>
      <p v-if="!projId" class="text-xs text-gray-400">
        ← <NuxtLink to="/projects" class="text-blue-500 hover:underline">Go to Projects</NuxtLink> and click "Manage Config" to load a project.
      </p>

      <!-- Error -->
      <p v-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

      <!-- Config table -->
      <div v-if="configData" class="space-y-2">
        <p class="text-xs text-gray-400">
          Snapshot <span class="font-mono">{{ configData.config_relation_uuid }}</span>
          &nbsp;·&nbsp; {{ new Date(configData.date_created).toLocaleString() }}
        </p>
        <div v-if="configData.rows.length === 0" class="text-sm text-gray-400">No rows in this snapshot.</div>
        <table v-else class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="pb-2 font-medium w-1/2">Key (NameNode UUID)</th>
              <th class="pb-2 font-medium w-1/2">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in configData.rows" :key="row.uuid" class="border-b last:border-0">
              <td class="py-2 pr-4">
                <button @click="openModal(row.key)"
                  class="font-mono text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 hover:bg-blue-100 transition break-all text-left">
                  {{ row.key }}
                </button>
              </td>
              <td class="py-2">
                <button @click="openModal(row.val)"
                  class="font-mono text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 hover:bg-gray-200 transition break-all text-left">
                  {{ row.val }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Editor panel -->
    <div class="bg-white rounded-lg border p-6 space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="font-semibold text-gray-700">New Config Snapshot</h2>
        <button @click="showEditor = !showEditor"
          class="text-sm text-blue-600 hover:text-blue-800 transition">
          {{ showEditor ? 'Cancel' : '+ New Snapshot' }}
        </button>
      </div>

      <div v-if="showEditor" class="space-y-4">

        <!-- Row list -->
        <div v-for="row in rows" :key="row.id" class="flex gap-2 items-start flex-wrap">

          <!-- Alias + search -->
          <div class="relative flex-1 min-w-48">
            <input v-model="row.alias" @input="onAliasInput(row)" type="text"
              placeholder="Alias (e.g. phone)"
              class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <!-- Dropdown -->
            <ul v-if="row.showDropdown"
              class="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
              <li v-for="r in row.searchResults" :key="r.truth"
                @mousedown.prevent="pickSearchResult(row, r)"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex justify-between gap-2">
                <span class="font-medium">{{ r.name }}</span>
                <span class="text-gray-400 text-xs truncate">{{ r.projectID }} · {{ r.latestValue }}</span>
              </li>
            </ul>
          </div>

          <!-- Value -->
          <input v-model="row.value" type="text" placeholder="Value"
            class="flex-1 min-w-32 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <!-- New node toggle -->
          <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap pt-2.5 cursor-pointer">
            <input type="checkbox" :checked="row.isNew" @change="toggleNew(row)" class="accent-blue-600" />
            New node
          </label>

          <!-- Remove -->
          <button @click="removeRow(row.id)"
            class="text-gray-400 hover:text-red-500 transition pt-2 text-lg leading-none">×</button>
        </div>

        <!-- Add row -->
        <button @click="addRow"
          class="text-sm text-blue-600 hover:text-blue-800 transition">+ Add row</button>

        <!-- Error / success -->
        <div v-if="submitError"
          class="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <span class="mt-0.5">⚠</span><span>{{ submitError }}</span>
        </div>
        <div v-if="submitSuccess"
          class="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Config snapshot saved successfully.
        </div>

        <!-- Submit -->
        <button @click="submitConfig" :disabled="submitting || rows.length === 0"
          class="bg-blue-600 text-white rounded px-5 py-2 text-sm hover:bg-blue-700 transition disabled:opacity-50">
          {{ submitting ? 'Saving…' : 'Save Snapshot' }}
        </button>
      </div>
    </div>

    <!-- Node resolve modal -->
    <Teleport to="body">
      <div v-if="modal" class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30" @click="closeModal" />
        <!-- Panel -->
        <div class="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-3">
          <div class="flex justify-between items-start">
            <h3 class="font-semibold text-gray-800">Node Info</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          <p class="font-mono text-xs text-gray-400 break-all">{{ modal.uuid }}</p>

          <div v-if="modal.loading" class="text-sm text-gray-400">Resolving…</div>
          <div v-else-if="modal.error" class="text-sm text-red-600">{{ modal.error }}</div>
          <div v-else-if="modal.data" class="space-y-2 text-sm">
            <div class="flex gap-2">
              <span class="text-gray-500 w-16 shrink-0">Type</span>
              <span class="font-medium capitalize">{{ modal.data.type }}</span>
            </div>
            <div v-if="modal.data.type === 'name'" class="flex gap-2">
              <span class="text-gray-500 w-16 shrink-0">Name</span>
              <span class="font-medium">{{ modal.data.name_val }}</span>
            </div>
            <div v-if="modal.data.type === 'value'" class="flex gap-2">
              <span class="text-gray-500 w-16 shrink-0">Value</span>
              <span class="font-medium">{{ modal.data.val }}</span>
            </div>
            <div v-if="modal.data.type === 'group'" class="space-y-1">
              <div class="flex gap-2">
                <span class="text-gray-500 w-16 shrink-0">Kind</span>
                <span>{{ modal.data.isArray ? 'Array' : 'Object' }}</span>
              </div>
              <div v-if="modal.data.entries && modal.data.entries.length > 0" class="mt-2 space-y-1">
                <p class="text-xs text-gray-400 uppercase tracking-wide">Entries</p>
                <div v-for="entry in modal.data.entries" :key="entry.key"
                  class="flex gap-2 font-mono text-xs bg-gray-50 rounded px-2 py-1">
                  <button @click="openModal(entry.key)"
                    class="text-blue-600 hover:underline truncate">{{ entry.key }}</button>
                  <span class="text-gray-400">→</span>
                  <button @click="openModal(entry.val)"
                    class="text-gray-600 hover:underline truncate">{{ entry.val }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
