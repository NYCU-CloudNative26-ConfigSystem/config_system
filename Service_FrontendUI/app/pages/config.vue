<script setup lang="ts">
import type {
  CompanyResponse,
  ConfigHistoryItem,
  ConfigWriteEntry,
  ProjectResponse,
  ProjectTemplateKey,
  ProjectTemplateVersion,
  SearchResult,
  SsotConfigEntry,
} from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// ── User info + company list ──────────────────────────────────────────────────

const userName = ref('')
const allCompanies = ref<CompanyResponse[]>([])

function resolveCompanyName(id: string): string {
  return allCompanies.value.find(c => c.cmp_id === id)?.display_name ?? id
}

// ── Navigation state ──────────────────────────────────────────────────────────

const projId = ref('')
const cmpId = ref('')
const envId = ref('')

const ENVIRONMENTS = [
  { id: 'development', label: 'Development' },
  { id: 'testing', label: 'Testing' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
] as const

const projectInfo = ref<ProjectResponse | null>(null)
const companiesWithConfig = ref<string[]>([])
const level1Loading = ref(false)
const newConfigCmpId = ref('')

const DISPLAY_MODES = ['truncated', 'collapsible', 'badge'] as const
type DisplayMode = typeof DISPLAY_MODES[number]
const companyDisplayMode = ref<DisplayMode>('truncated')
const expandedCompanyList = ref(false)
const COMPANY_CHIPS_VISIBLE = 3

function modeLabel(m: DisplayMode) {
  return m === 'truncated' ? 'Truncated' : m === 'collapsible' ? 'Collapsible' : 'Badge'
}

// ── Template tab ──────────────────────────────────────────────────────────────

const activeTab = ref<'template' | 'companies'>('template')
const projectTemplate = ref<ProjectTemplateKey[]>([])
const templateSearch = ref('')
const templateAddError = ref('')
const templateAdding = ref(false)
const isProjectCreator = ref(false)

const templateVersions = ref<ProjectTemplateVersion[]>([])
const publishedTemplateKeys = ref<string[]>([])
const publishedTemplateVersionUuid = ref<string | null>(null)
const publishing = ref(false)
const publishError = ref('')

async function publishTemplate() {
  publishError.value = ''
  publishing.value = true
  try {
    const v = await api.projects.publishTemplate(projId.value, auth.token)
    templateVersions.value.unshift(v)
    templateVersions.value.forEach((tv, i) => { tv.latest = i === 0 })
    publishedTemplateKeys.value = v.keys
    publishedTemplateVersionUuid.value = v.uuid
  } catch (e: unknown) {
    publishError.value = e instanceof Error ? e.message : 'Failed to publish'
  } finally {
    publishing.value = false
  }
}

async function addTemplateKeyByName() {
  const alias = templateSearch.value.trim()
  if (!alias) return
  templateAddError.value = ''
  templateAdding.value = true
  try {
    const key = await api.projects.addTemplateKey(projId.value, { alias }, auth.token)
    projectTemplate.value.push(key)
    templateSearch.value = ''
  } catch (e: unknown) {
    templateAddError.value = e instanceof Error ? e.message : 'Failed to add key'
  } finally {
    templateAdding.value = false
  }
}

async function removeTemplateKey(key: ProjectTemplateKey) {
  if (!confirm(`Remove "${key.alias}" from the required template?`)) return
  try {
    await api.projects.removeTemplateKey(projId.value, key.uuid, auth.token)
    projectTemplate.value = projectTemplate.value.filter(k => k.uuid !== key.uuid)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to remove key')
  }
}

onMounted(async () => {
  try {
    const [me, cmps] = await Promise.all([
      api.auth.me(auth.token),
      api.companies.list(auth.token),
    ])
    userName.value = me.username
    allCompanies.value = cmps
  } catch { /* stay blank */ }

  if (route.query.proj) {
    projId.value = route.query.proj as string
    await loadLevel1()
  }
  if (route.query.cmp) {
    cmpId.value = route.query.cmp as string
  }
  if (route.query.env) {
    envId.value = route.query.env as string
    await loadHistory()
  }
})

async function loadLevel1() {
  if (!projId.value) return
  level1Loading.value = true
  try {
    const [project, cmps, tmpl, versions, pubKeys] = await Promise.all([
      api.projects.get(projId.value, auth.token).catch(() => null),
      api.configTable.companiesWithConfig(projId.value, auth.token).catch(() => [] as string[]),
      api.projects.getTemplateKeys(projId.value, auth.token).catch(() => [] as ProjectTemplateKey[]),
      api.projects.getTemplateVersions(projId.value, auth.token).catch(() => [] as ProjectTemplateVersion[]),
      api.projects.getPublishedTemplateKeys(projId.value, auth.token).catch(() => ({ version_uuid: null, keys: [] as string[] })),
    ])
    projectInfo.value = project
    companiesWithConfig.value = cmps
    projectTemplate.value = tmpl
    templateVersions.value = versions
    publishedTemplateKeys.value = pubKeys.keys
    publishedTemplateVersionUuid.value = pubKeys.version_uuid
    isProjectCreator.value = !!project && project.created_by === userName.value
  } finally {
    level1Loading.value = false
  }
}

async function selectCompany(id: string) {
  if (!id) return
  cmpId.value = id
  newConfigCmpId.value = ''
  envId.value = ''
  router.replace({ query: { proj: projId.value, cmp: id } })
}

async function selectEnvironment(env: string) {
  envId.value = env
  router.replace({ query: { proj: projId.value, cmp: cmpId.value, env } })
  await loadHistory()
}

function backToEnvList() {
  envId.value = ''
  snapshotHistory.value = []
  showEditor.value = false
  submitSuccess.value = false
  router.replace({ query: { proj: projId.value, cmp: cmpId.value } })
}

function backToCompanyList() {
  cmpId.value = ''
  envId.value = ''
  snapshotHistory.value = []
  showEditor.value = false
  submitSuccess.value = false
  router.replace({ query: { proj: projId.value } })
}

// ── Level 2: snapshot history ─────────────────────────────────────────────────

const snapshotHistory = ref<ConfigHistoryItem[]>([])
const historyLoading = ref(false)
const historyError = ref('')

async function loadHistory() {
  if (!projId.value || !cmpId.value || !envId.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    snapshotHistory.value = await api.configTable.history(projId.value, cmpId.value, envId.value, auth.token)
  } catch (e: unknown) {
    historyError.value = e instanceof Error ? e.message : 'Failed to load history'
  } finally {
    historyLoading.value = false
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// ── Editor ────────────────────────────────────────────────────────────────────

interface ChildRow { id: number; alias: string; value: string }

interface EditorRow {
  id: number
  alias: string
  valueType: 'primitive' | 'object' | 'array'
  value: string
  children: ChildRow[]
  isNew: boolean
  truthId: string
  searchResults: SearchResult[]
  showDropdown: boolean
  searchTimer: ReturnType<typeof setTimeout> | null
  isTemplate: boolean  // locked row from project template — alias/key not editable
  sensitive: boolean   // mark value as sensitive — masked in snapshot view
}

const showEditor = ref(false)
const rows = ref<EditorRow[]>([])
const changeDescription = ref('')
const submitError = ref('')
const submitSuccess = ref(false)
const submitting = ref(false)
let rowIdCounter = 0

function makeRow(): EditorRow {
  return {
    id: rowIdCounter++, alias: '', valueType: 'primitive', value: '', children: [],
    isNew: true, truthId: '', searchResults: [], showDropdown: false, searchTimer: null,
    isTemplate: false, sensitive: false,
  }
}

function makeTemplateRow(key: ProjectTemplateKey): EditorRow {
  return {
    id: rowIdCounter++, alias: key.alias, valueType: 'primitive', value: '', children: [],
    isNew: true, truthId: '', searchResults: [], showDropdown: false, searchTimer: null,
    isTemplate: true, sensitive: false,
  }
}

function addRow() { rows.value.push(makeRow()) }
function removeRow(id: number) { rows.value = rows.value.filter(r => r.id !== id) }

function setValueType(row: EditorRow, type: 'primitive' | 'object' | 'array') {
  row.valueType = type
  if (type !== 'primitive' && row.children.length === 0) addChild(row)
}
function addChild(row: EditorRow) {
  row.children.push({ id: rowIdCounter++, alias: '', value: '' })
}
function removeChild(row: EditorRow, childId: number) {
  row.children = row.children.filter(c => c.id !== childId)
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
  row.sensitive = result.is_sensitive ?? false
}

function toggleNew(row: EditorRow) {
  row.isNew = !row.isNew
  if (row.isNew) { row.truthId = ''; row.value = '' }
  row.showDropdown = false
}

function parsePrimitive(s: string): string | number {
  const trimmed = s.trim()
  if (trimmed === '') return trimmed
  // Preserve leading zeros (phone numbers, zip codes, etc.)
  if (/^-?0\d/.test(trimmed)) return trimmed
  const n = Number(trimmed)
  return !isNaN(n) ? n : trimmed
}

function buildValue(row: EditorRow | ChildRow): string | number | Record<string, unknown> | unknown[] {
  if ('valueType' in row) {
    if (row.valueType === 'object') {
      const obj: Record<string, unknown> = {}
      for (const c of row.children) obj[c.alias] = parsePrimitive(c.value)
      return obj
    }
    if (row.valueType === 'array') return row.children.map(c => parsePrimitive(c.value))
  }
  return parsePrimitive((row as EditorRow).value)
}

function openEditor() {
  submitSuccess.value = false
  submitError.value = ''
  if (showEditor.value) {
    showEditor.value = false
    return
  }
  rows.value = publishedTemplateKeys.value.map(alias => makeTemplateRow({ alias } as ProjectTemplateKey))
  changeDescription.value = ''
  showEditor.value = true
}

async function submitConfig() {
  submitError.value = ''
  submitSuccess.value = false
  const unfilled = rows.value.filter(r => r.isTemplate && r.valueType === 'primitive' && r.value.trim() === '')
  if (unfilled.length > 0) {
    submitError.value = `Please fill in all required template keys: ${unfilled.map(r => r.alias).join(', ')}`
    return
  }
  if (rows.value.length === 0) { submitError.value = 'Add at least one row.'; return }
  if (!projId.value || !cmpId.value || !envId.value) { submitError.value = 'Project, Company, and Environment are required.'; return }
  submitting.value = true
  try {
    const ssotRes = await api.ssot.postConfig({
      CMPID: cmpId.value,
      projectID: projId.value,
      config: rows.value.map<SsotConfigEntry>(r => ({
        truth: r.isNew ? null : r.truthId,
        alias: r.alias,
        value: buildValue(r),
        sensitive: r.sensitive,
      })),
    }, auth.token)

    await api.configTable.writeConfig({
      proj_id: projId.value,
      cmp_id: cmpId.value,
      environment: envId.value,
      user_id: userName.value || 'unknown',
      entries: ssotRes.entries.map<ConfigWriteEntry>(e => ({
        key: e.nameId, val: e.valRef, group_entries: e.groupEntries,
      })),
      template_version_uuid: publishedTemplateVersionUuid.value ?? undefined,
      change_description: changeDescription.value.trim() || undefined,
    }, auth.token)

    submitSuccess.value = true
    rows.value = []
    showEditor.value = false

    // Ensure the company is linked to the project (idempotent — ignore if already linked)
    api.projects.addCompany(projId.value, cmpId.value, auth.token).catch(() => {})

    await Promise.all([
      loadHistory(),
      api.configTable.companiesWithConfig(projId.value, auth.token)
        .then(c => { companiesWithConfig.value = c }).catch(() => {}),
    ])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    submitError.value = msg.includes('409') || msg.toLowerCase().includes('conflict')
      ? `Conflict: ${msg}` : msg
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">

    <!-- Sticky nav with breadcrumb -->
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 text-sm">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 shrink-0 select-none">|</span>
          <template v-if="!projId">
            <span class="font-semibold text-slate-900">Config Manager</span>
          </template>
          <template v-else-if="!cmpId">
            <NuxtLink to="/projects" class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline">Projects</NuxtLink>
            <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
            <span class="font-semibold text-slate-900 truncate">{{ projectInfo?.display_name ?? projId }}</span>
          </template>
          <template v-else>
            <button @click="backToCompanyList" class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline">{{ projectInfo?.display_name ?? projId }}</button>
            <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
            <template v-if="!envId">
              <span class="font-semibold text-slate-900 truncate">{{ resolveCompanyName(cmpId) }}</span>
            </template>
            <template v-else>
              <button @click="backToEnvList" class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline">{{ resolveCompanyName(cmpId) }}</button>
              <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
              <span class="font-semibold text-slate-900 truncate capitalize">{{ envId }}</span>
            </template>
          </template>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition shrink-0">Logout</button>
      </div>
    </nav>

    <div class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-4">

      <!-- No project selected -->
      <div v-if="!projId" class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center space-y-2">
        <p class="text-slate-500 text-sm">No project selected.</p>
        <NuxtLink to="/projects" class="text-sm text-blue-600 hover:text-blue-700 font-semibold">
          Go to Projects and click "Manage Config"
        </NuxtLink>
      </div>

      <!-- ── Level 1: Company list ── -->
      <template v-else-if="!cmpId">
        <div v-if="level1Loading" class="text-center py-12 text-sm text-slate-400">Loading…</div>
        <template v-else>

          <!-- Tab switcher -->
          <div class="flex items-center gap-0.5 bg-white rounded-xl ring-1 ring-slate-900/5 p-1 self-start w-fit">
            <button
              @click="activeTab = 'template'"
              :class="activeTab === 'template' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
              class="px-4 py-1.5 rounded-lg text-xs font-semibold transition">
              Template
            </button>
            <button
              @click="activeTab = 'companies'"
              :class="activeTab === 'companies' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
              class="px-4 py-1.5 rounded-lg text-xs font-semibold transition">
              Companies
            </button>
          </div>

          <!-- ── Template tab ── -->
          <template v-if="activeTab === 'template'">
            <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
              <div class="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold text-slate-900 text-sm">Required Config Keys</h2>
                  <p class="text-xs text-slate-400 mt-0.5">Every company in this project must fill these keys when creating a config snapshot.</p>
                </div>
              </div>

              <!-- Template key list -->
              <div v-if="projectTemplate.length > 0" class="divide-y divide-slate-50">
                <div v-for="key in projectTemplate" :key="key.uuid"
                  class="flex items-center gap-3 px-5 py-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800">{{ key.alias }}</p>
                    <p class="font-mono text-xs text-slate-400 mt-0.5">{{ key.name_node_uuid }}</p>
                  </div>
                  <button v-if="isProjectCreator"
                    @click="removeTemplateKey(key)"
                    class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">×</button>
                </div>
              </div>
              <div v-else class="px-5 py-8 text-center text-sm text-slate-400">
                No required keys yet.
              </div>

              <!-- Add key (creator only) -->
              <div v-if="isProjectCreator" class="border-t border-slate-50 px-5 py-4 space-y-2">
                <p class="text-xs font-semibold text-slate-500">Add required key</p>
                <div class="flex gap-2">
                  <input
                    v-model="templateSearch"
                    @keydown.enter.prevent="addTemplateKeyByName"
                    type="text"
                    placeholder="e.g. phone, address, contact_email"
                    class="flex-1 ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  <button
                    @click="addTemplateKeyByName"
                    :disabled="!templateSearch.trim() || templateAdding"
                    class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
                    {{ templateAdding ? '…' : 'Add' }}
                  </button>
                </div>
                <div v-if="templateAddError" class="text-sm text-red-600">{{ templateAddError }}</div>
              </div>

              <!-- Publish button (creator only) -->
              <div v-if="isProjectCreator" class="border-t border-slate-100 px-5 py-4 flex items-center gap-3">
                <button
                  @click="publishTemplate"
                  :disabled="publishing || projectTemplate.length === 0"
                  class="bg-emerald-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-40">
                  {{ publishing ? 'Publishing…' : '↑ Publish new version' }}
                </button>
                <span class="text-xs text-slate-400">Companies use the latest published version</span>
                <div v-if="publishError" class="text-sm text-red-600">{{ publishError }}</div>
              </div>
            </div>

            <!-- Published version history -->
            <div v-if="templateVersions.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
              <div class="px-5 py-3 border-b border-slate-50">
                <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Published Versions</h3>
              </div>
              <div class="divide-y divide-slate-50">
                <div v-for="v in templateVersions" :key="v.uuid"
                  class="px-5 py-3 flex items-center gap-3">
                  <span class="text-sm font-bold text-slate-700 shrink-0 w-8">v{{ v.version_number }}</span>
                  <span v-if="v.latest"
                    class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0">Latest</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-500">{{ formatDate(v.date_created) }} · {{ v.created_by }}</p>
                    <p class="text-xs text-slate-400 truncate mt-0.5">{{ v.keys.join(', ') || '(empty)' }}</p>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ── Companies tab ── -->
          <template v-else>

          <!-- Mode switcher -->
          <div v-if="companiesWithConfig.length > 0" class="flex items-center gap-2">
            <span class="text-xs text-slate-400 font-medium shrink-0">Company display:</span>
            <div class="flex items-center gap-0.5 bg-white rounded-xl ring-1 ring-slate-900/5 p-1">
              <button
                v-for="m in DISPLAY_MODES" :key="m"
                @click="companyDisplayMode = m; expandedCompanyList = false"
                :class="companyDisplayMode === m
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                {{ modeLabel(m) }}
              </button>
            </div>
          </div>

          <!-- ── Mode A: Truncated rows ── -->
          <template v-if="companyDisplayMode === 'truncated'">
            <div class="space-y-2">
              <button
                v-for="id in (expandedCompanyList
                  ? companiesWithConfig
                  : companiesWithConfig.slice(0, COMPANY_CHIPS_VISIBLE))"
                :key="id"
                @click="selectCompany(id)"
                class="w-full bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 flex items-center justify-between hover:ring-blue-500/40 hover:shadow-sm transition-all text-left group">
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900 group-hover:text-blue-700 transition text-sm">{{ resolveCompanyName(id) }}</p>
                  <p class="font-mono text-xs text-slate-400 mt-0.5">{{ id }}</p>
                </div>
                <span class="text-slate-300 group-hover:text-blue-500 transition shrink-0 ml-3 text-lg">›</span>
              </button>
              <div v-if="companiesWithConfig.length === 0"
                class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-10 text-center text-sm text-slate-400">
                No configs yet for this project.
              </div>
              <button
                v-if="!expandedCompanyList && companiesWithConfig.length > COMPANY_CHIPS_VISIBLE"
                @click="expandedCompanyList = true"
                class="w-full bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-3 text-center text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition">
                + {{ companiesWithConfig.length - COMPANY_CHIPS_VISIBLE }} more
              </button>
              <button
                v-if="expandedCompanyList && companiesWithConfig.length > COMPANY_CHIPS_VISIBLE"
                @click="expandedCompanyList = false"
                class="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition py-1">
                show less
              </button>
            </div>
          </template>

          <!-- ── Mode B: Collapsible ── -->
          <template v-else-if="companyDisplayMode === 'collapsible'">
            <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
              <button
                @click="expandedCompanyList = !expandedCompanyList"
                class="w-full px-5 py-4 flex items-center gap-2 text-left hover:bg-slate-50/50 transition">
                <span
                  class="inline-block transition-transform duration-150 text-slate-300 text-[10px] shrink-0"
                  :class="expandedCompanyList ? 'rotate-90' : ''">▶</span>
                <span class="text-sm font-semibold text-slate-700">
                  {{ companiesWithConfig.length }} {{ companiesWithConfig.length === 1 ? 'company' : 'companies' }} with configs
                </span>
              </button>
              <div v-if="expandedCompanyList" class="border-t border-slate-50 divide-y divide-slate-50">
                <button
                  v-for="id in companiesWithConfig" :key="id"
                  @click="selectCompany(id)"
                  class="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition group">
                  <div class="min-w-0">
                    <p class="font-semibold text-slate-800 group-hover:text-blue-700 transition text-sm">{{ resolveCompanyName(id) }}</p>
                    <p class="font-mono text-xs text-slate-400">{{ id }}</p>
                  </div>
                  <span class="text-slate-300 group-hover:text-blue-500 transition shrink-0 ml-3">›</span>
                </button>
              </div>
            </div>
            <div v-if="companiesWithConfig.length === 0"
              class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-10 text-center text-sm text-slate-400">
              No configs yet for this project.
            </div>
          </template>

          <!-- ── Mode C: Badge pills ── -->
          <template v-else>
            <div v-if="companiesWithConfig.length === 0"
              class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-10 text-center text-sm text-slate-400">
              No configs yet for this project.
            </div>
            <div v-else class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                {{ companiesWithConfig.length }} {{ companiesWithConfig.length === 1 ? 'company' : 'companies' }}
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="id in companiesWithConfig" :key="id"
                  @click="selectCompany(id)"
                  class="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 ring-1 ring-slate-200 hover:ring-blue-300 rounded-full px-3 py-1.5 text-xs font-semibold transition">
                  {{ resolveCompanyName(id) }}
                  <span class="font-mono text-slate-400 font-normal">›</span>
                </button>
              </div>
            </div>
          </template>

          <!-- Open / create -->
          <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-5">
            <p class="text-sm font-medium text-slate-600 mb-3">Open or create config for a company</p>
            <div class="flex gap-2">
              <CompanySearch
                v-model="newConfigCmpId"
                :companies="allCompanies"
                placeholder="Search company…"
                input-class="flex-1 ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button @click="selectCompany(newConfigCmpId)" :disabled="!newConfigCmpId"
                class="bg-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 whitespace-nowrap">
                Open
              </button>
            </div>
          </div>

          </template><!-- end companies tab -->
        </template><!-- end loading check -->
      </template><!-- end Level 1 -->

      <!-- ── Level 1.5: Environment selector ── -->
      <template v-else-if="!envId">
        <div class="flex items-center justify-between">
          <button @click="backToCompanyList" class="text-sm text-slate-400 hover:text-slate-700 transition">
            ← Companies
          </button>
        </div>
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h2 class="font-semibold text-slate-900 text-sm">Select Environment</h2>
            <p class="text-xs text-slate-400 mt-0.5">{{ resolveCompanyName(cmpId) }} · Each environment has its own independent config history.</p>
          </div>
          <div class="grid grid-cols-2 gap-3 p-5">
            <button
              v-for="env in ENVIRONMENTS" :key="env.id"
              @click="selectEnvironment(env.id)"
              class="rounded-2xl ring-1 ring-slate-200 p-5 text-left transition-all hover:shadow-md group"
              :class="{
                'hover:ring-green-400 hover:bg-green-50/30': env.id === 'development',
                'hover:ring-yellow-400 hover:bg-yellow-50/30': env.id === 'testing',
                'hover:ring-orange-400 hover:bg-orange-50/30': env.id === 'staging',
                'hover:ring-blue-400 hover:bg-blue-50/30': env.id === 'production',
              }">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  :class="{
                    'bg-green-100 text-green-600': env.id === 'development',
                    'bg-yellow-100 text-yellow-600': env.id === 'testing',
                    'bg-orange-100 text-orange-600': env.id === 'staging',
                    'bg-blue-100 text-blue-600': env.id === 'production',
                  }">{{ env.label[0] }}</span>
                <span class="font-semibold text-slate-800 text-sm">{{ env.label }}</span>
              </div>
              <span class="text-xs font-medium opacity-0 group-hover:opacity-100 transition"
                :class="{
                  'text-green-500': env.id === 'development',
                  'text-yellow-500': env.id === 'testing',
                  'text-orange-500': env.id === 'staging',
                  'text-blue-500': env.id === 'production',
                }">Open →</span>
            </button>
          </div>
        </div>
      </template><!-- end Level 1.5 -->

      <!-- ── Level 2: Snapshot history ── -->
      <template v-else>

        <!-- Toolbar -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <button @click="backToEnvList"
            class="text-sm text-slate-400 hover:text-slate-700 transition shrink-0">
            ← Environments
          </button>
          <div class="flex items-center gap-2">
            <button
              @click="router.push({ path: '/config-diff', query: { proj: projId, cmp: cmpId, env1: envId } })"
              class="rounded-xl px-4 py-2 text-sm font-semibold transition shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-200">
              ↔ Compare
            </button>
            <button
              @click="openEditor()"
              :class="showEditor
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'"
              class="rounded-xl px-4 py-2 text-sm font-semibold transition shrink-0">
              {{ showEditor ? 'Cancel' : '+ New Snapshot' }}
            </button>
          </div>
        </div>

        <!-- Editor panel -->
        <div v-if="showEditor" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h2 class="font-semibold text-slate-900 text-sm">
              New Snapshot · <span class="text-blue-600">{{ resolveCompanyName(cmpId) }}</span>
              <span class="text-slate-400 font-normal ml-1 capitalize">· {{ envId }}</span>
            </h2>
          </div>
          <div class="px-5 py-4 space-y-3">
            <div v-for="row in rows" :key="row.id"
              :class="row.isTemplate ? 'ring-1 ring-blue-200 bg-blue-50/30' : 'ring-1 ring-slate-200 bg-slate-50/50'"
              class="rounded-xl p-3 space-y-2">
              <!-- Template badge -->
              <div v-if="row.isTemplate" class="flex items-center gap-1.5 mb-1">
                <span class="text-[10px] font-semibold text-blue-600 bg-blue-100 rounded-full px-2 py-0.5 uppercase tracking-wide">Required</span>
              </div>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div class="relative flex-1 min-w-0">
                  <!-- Locked alias for template rows -->
                  <div v-if="row.isTemplate"
                    class="w-full ring-1 ring-blue-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 font-semibold">
                    {{ row.alias }}
                  </div>
                  <template v-else>
                    <input v-model="row.alias" @input="onAliasInput(row)" type="text"
                      placeholder="Key (e.g. phone)"
                      class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    <ul v-if="row.showDropdown"
                      class="absolute z-10 left-0 right-0 mt-1 bg-white ring-1 ring-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      <li v-for="r in row.searchResults" :key="r.truth"
                        @mousedown.prevent="pickSearchResult(row, r)"
                        class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex justify-between gap-2">
                        <span class="font-semibold text-slate-800">{{ r.name }}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <span v-if="r.is_sensitive"
                            class="text-[10px] font-bold text-amber-600 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded-full uppercase">Sensitive</span>
                          <span class="text-slate-400 text-xs truncate max-w-[120px]">
                            {{ r.projectID }} · {{ r.is_sensitive ? '[sensitive]' : r.latestValue }}
                          </span>
                        </div>
                      </li>
                    </ul>
                  </template>
                </div>
                <input v-if="row.valueType === 'primitive'" v-model="row.value"
                  :type="row.sensitive ? 'password' : 'text'"
                  :placeholder="row.isTemplate ? `Enter value for ${row.alias}` : 'Value'"
                  :class="[
                    row.isTemplate ? 'ring-blue-300 focus:ring-blue-500' : 'ring-slate-200 focus:ring-blue-500',
                    row.sensitive ? 'bg-amber-50/40' : 'bg-white',
                  ]"
                  class="flex-1 min-w-0 ring-1 rounded-xl px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition" />
                <span v-else
                  class="flex items-center px-3 py-2 text-sm text-slate-400 ring-1 ring-slate-200 rounded-xl bg-white shrink-0 font-mono">
                  {{ row.valueType === 'object' ? '{ }' : '[ ]' }}
                </span>
                <div class="flex items-center gap-1.5 sm:shrink-0">
                  <div class="flex ring-1 ring-slate-200 rounded-lg overflow-hidden text-xs bg-white">
                    <button @click="setValueType(row, 'primitive')"
                      :class="row.valueType === 'primitive' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'"
                      class="px-2 py-1.5 transition" title="Plain value">abc</button>
                    <button @click="setValueType(row, 'object')"
                      :class="row.valueType === 'object' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'"
                      class="px-2 py-1.5 border-x border-slate-200 transition" title="Object">{ }</button>
                    <button @click="setValueType(row, 'array')"
                      :class="row.valueType === 'array' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'"
                      class="px-2 py-1.5 transition" title="Array">[ ]</button>
                  </div>
                  <label v-if="row.valueType === 'primitive' && !row.isTemplate"
                    class="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
                    <input type="checkbox" :checked="row.isNew" @change="toggleNew(row)" class="accent-blue-600" />
                    New
                  </label>
                  <label class="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer"
                    :class="row.sensitive ? 'text-amber-600 font-semibold' : 'text-slate-400'">
                    <input type="checkbox" v-model="row.sensitive" class="accent-amber-500" />
                    Sensitive
                  </label>
                  <button v-if="!row.isTemplate" @click="removeRow(row.id)"
                    class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">×</button>
                  <div v-else class="w-7 h-7 shrink-0" />
                </div>
              </div>
              <div v-if="row.valueType !== 'primitive'" class="pl-3 border-l-2 border-blue-100 space-y-2 ml-1">
                <div v-for="child in row.children" :key="child.id" class="flex gap-2 items-center">
                  <input v-if="row.valueType === 'object'" v-model="child.alias" type="text" placeholder="Key"
                    class="flex-1 ring-1 ring-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition" />
                  <span v-else class="text-xs text-slate-400 w-5 text-right shrink-0">{{ row.children.indexOf(child) }}</span>
                  <input v-model="child.value" type="text" placeholder="Value"
                    class="flex-1 ring-1 ring-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition" />
                  <button @click="removeChild(row, child.id)"
                    class="text-slate-300 hover:text-red-500 transition text-base leading-none">×</button>
                </div>
                <button @click="addChild(row)"
                  class="text-xs text-blue-600 hover:text-blue-700 font-semibold transition">
                  + {{ row.valueType === 'object' ? 'Add entry' : 'Add item' }}
                </button>
              </div>
            </div>

            <button @click="addRow"
              class="text-sm text-blue-600 hover:text-blue-700 font-semibold transition">+ Add row</button>

            <!-- Change description -->
            <div class="space-y-1.5 pt-1">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason for change</label>
              <textarea
                v-model="changeDescription"
                placeholder="Describe what changed and why (optional but recommended)"
                rows="2"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
            </div>

            <div v-if="submitError"
              class="flex items-start gap-2 rounded-xl bg-red-50 ring-1 ring-red-200 px-3 py-2.5 text-sm text-red-700">
              <span class="mt-0.5 shrink-0">⚠</span><span>{{ submitError }}</span>
            </div>
            <div v-if="submitSuccess"
              class="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2.5 text-sm text-emerald-700">
              Snapshot saved — awaiting approval from a reviewer before it becomes active.
            </div>

            <button @click="submitConfig" :disabled="submitting || rows.length === 0"
              class="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 mx-3">
              {{ submitting ? 'Saving…' : 'Save Snapshot' }}
            </button>
          </div>
        </div>

        <!-- Snapshot history list -->
        <div v-if="historyLoading" class="text-center py-12 text-sm text-slate-400">Loading history…</div>
        <div v-else-if="historyError"
          class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">{{ historyError }}</div>
        <div v-else-if="snapshotHistory.length === 0 && !showEditor"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-10 text-center text-sm text-slate-400">
          No snapshots yet. Create one above.
        </div>

        <div class="space-y-2">
          <button
            v-for="snap in snapshotHistory" :key="snap.config_relation_uuid"
            @click="router.push({ path: `/config-snapshot/${snap.config_relation_uuid}`, query: { proj: projId, cmp: cmpId, env: envId, created_by: snap.created_by ?? '', tmpl_v: snap.template_version_number != null ? String(snap.template_version_number) : '', is_latest: snap.is_latest ? '1' : '0', status: snap.approval_status, rejection_reason: snap.rejection_reason ?? '', change_description: snap.change_description ?? '' } })"
            class="w-full bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 flex items-center justify-between text-left hover:ring-blue-400/40 hover:shadow-sm transition-all group">
            <div class="flex flex-col min-w-0 gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <!-- Approval status badge -->
                <span v-if="snap.is_latest && snap.approval_status === 'approved'"
                  class="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Latest</span>
                <span v-else-if="snap.approval_status === 'pending'"
                  class="bg-yellow-50 text-yellow-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Pending review</span>
                <span v-else-if="snap.approval_status === 'rejected'"
                  class="bg-red-50 text-red-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Rejected</span>
                <span v-else-if="snap.approval_status === 'approved'"
                  class="bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Approved</span>
                <span class="text-sm font-medium text-slate-700">{{ formatDate(snap.date_created) }}</span>
                <span class="text-xs text-slate-400">· {{ snap.created_by ?? 'unknown' }}</span>
                <span class="text-xs text-slate-400">· {{ snap.entry_count }} {{ snap.entry_count === 1 ? 'entry' : 'entries' }}</span>
                <span v-if="snap.template_version_number != null"
                  class="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full shrink-0">
                  Template v{{ snap.template_version_number }}
                </span>
              </div>
              <p v-if="snap.change_description"
                class="text-xs text-slate-500 truncate max-w-xs">
                {{ snap.change_description }}
              </p>
            </div>
            <span class="text-slate-300 group-hover:text-blue-500 shrink-0 ml-2 transition">›</span>
          </button>
        </div>

      </template>
    </div>

  </div>
</template>
