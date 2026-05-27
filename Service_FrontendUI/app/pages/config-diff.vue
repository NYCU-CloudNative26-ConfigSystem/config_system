<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const projId = computed(() => route.query.proj as string || '')
const cmpId  = computed(() => route.query.cmp as string || '')

const ENVIRONMENTS = ['development', 'testing', 'staging', 'production'] as const

const env1 = ref<string>(route.query.env1 as string || 'development')
const env2 = ref<string>(route.query.env2 as string || 'production')

interface DiffRow {
  nameUuid: string
  displayName: string
  category: 'changed' | 'removed' | 'added' | 'same'
  val1: string
  val2: string
  sensitive1: boolean
  sensitive2: boolean
}

const diffRows = ref<DiffRow[]>([])
const loading  = ref(false)
const error    = ref('')
const env1Missing = ref(false)
const env2Missing = ref(false)
const hideUnchanged = ref(false)

const visibleRows = computed(() =>
  hideUnchanged.value ? diffRows.value.filter(r => r.category !== 'same') : diffRows.value
)

const counts = computed(() => ({
  changed: diffRows.value.filter(r => r.category === 'changed').length,
  removed: diffRows.value.filter(r => r.category === 'removed').length,
  added:   diffRows.value.filter(r => r.category === 'added').length,
  same:    diffRows.value.filter(r => r.category === 'same').length,
}))

function stripRef(r: string): string {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

async function resolveNodeToDisplay(nodeUuid: string, depth = 0): Promise<string> {
  if (depth > 3) return '…'
  const node = await api.ssot.resolveNode(nodeUuid, auth.token).catch(() => null)
  if (!node) return nodeUuid
  if (node.type === 'value') return String(node.val ?? '')
  if (node.type === 'name') return node.name_val ?? nodeUuid
  if (node.type === 'group') {
    if (!node.entries?.length) return node.isArray ? '[]' : '{}'
    const parts = await Promise.all(node.entries.map(async e => {
      const keyNode = await api.ssot.resolveNode(e.key, auth.token).catch(() => null)
      const keyName = keyNode?.type === 'name' ? (keyNode.name_val ?? e.key) : e.key
      const valDisplay = await resolveNodeToDisplay(stripRef(e.val), depth + 1)
      return node.isArray ? valDisplay : `${keyName}: ${valDisplay}`
    }))
    return node.isArray ? `[ ${parts.join(', ')} ]` : `{ ${parts.join(', ')} }`
  }
  return nodeUuid
}

async function runDiff() {
  if (!projId.value || !cmpId.value) { error.value = 'Project and company are required'; return }
  if (env1.value === env2.value) { error.value = 'Select two different environments'; return }

  loading.value = true
  error.value = ''
  env1Missing.value = false
  env2Missing.value = false
  diffRows.value = []

  try {
    const [snap1, snap2] = await Promise.all([
      api.configTable.getConfig(projId.value, cmpId.value, env1.value, auth.token).catch(() => null),
      api.configTable.getConfig(projId.value, cmpId.value, env2.value, auth.token).catch(() => null),
    ])

    env1Missing.value = !snap1
    env2Missing.value = !snap2

    if (!snap1 && !snap2) {
      error.value = 'No approved config found in either environment'
      return
    }

    const map1 = new Map<string, string>((snap1?.rows ?? []).map(r => [r.key, r.val]))
    const map2 = new Map<string, string>((snap2?.rows ?? []).map(r => [r.key, r.val]))

    const allNameUuids = new Set([...map1.keys(), ...map2.keys()])
    const allValRefs   = new Set([...map1.values(), ...map2.values()])

    // Resolve all names in parallel
    const nameEntries = await Promise.all([...allNameUuids].map(async uuid => {
      const node = await api.ssot.resolveNode(uuid, auth.token).catch(() => null)
      const displayName = node?.type === 'name' ? (node.name_val ?? uuid) : uuid
      return [uuid, displayName] as [string, string]
    }))
    const nameMap = new Map(nameEntries)

    // Resolve all values in parallel
    const valEntries = await Promise.all([...allValRefs].map(async valRef => {
      const stripped = stripRef(valRef)
      const node = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
      let displayStr = ''
      let isSensitive = false
      if (node?.type === 'value') {
        displayStr = String(node.val ?? '')
        isSensitive = node.is_sensitive ?? false
      } else if (node?.type === 'group') {
        displayStr = await resolveNodeToDisplay(stripped, 0)
      }
      return [valRef, { displayStr, isSensitive }] as [string, { displayStr: string; isSensitive: boolean }]
    }))
    const valMap = new Map(valEntries)

    const rows: DiffRow[] = []
    for (const nameUuid of allNameUuids) {
      const valRef1 = map1.get(nameUuid)
      const valRef2 = map2.get(nameUuid)
      const resolved1 = valRef1 ? valMap.get(valRef1) : undefined
      const resolved2 = valRef2 ? valMap.get(valRef2) : undefined

      let category: DiffRow['category']
      if (!valRef1) category = 'added'
      else if (!valRef2) category = 'removed'
      else if (resolved1?.displayStr === resolved2?.displayStr) category = 'same'
      else category = 'changed'

      rows.push({
        nameUuid,
        displayName: nameMap.get(nameUuid) ?? nameUuid,
        category,
        val1: resolved1?.displayStr ?? '',
        val2: resolved2?.displayStr ?? '',
        sensitive1: resolved1?.isSensitive ?? false,
        sensitive2: resolved2?.isSensitive ?? false,
      })
    }

    const ORDER = { changed: 0, removed: 1, added: 2, same: 3 }
    rows.sort((a, b) => ORDER[a.category] - ORDER[b.category] || a.displayName.localeCompare(b.displayName))
    diffRows.value = rows
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Diff failed'
  } finally {
    loading.value = false
  }
}

watch([env1, env2], () => { if (env1.value !== env2.value) runDiff() })

onMounted(() => {
  if (env1.value && env2.value && env1.value !== env2.value) runDiff()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">

    <!-- Nav -->
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 text-sm">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 shrink-0 select-none">|</span>
          <button @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId } })"
            class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline">Config</button>
          <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
          <span class="font-semibold text-slate-900">Environment Diff</span>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition shrink-0">Logout</button>
      </div>
    </nav>

    <div class="max-w-4xl mx-auto px-4 py-6 pb-16 space-y-4">

      <button @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId } })"
        class="text-sm text-slate-400 hover:text-slate-700 transition">← Back to config</button>

      <!-- Environment selector -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4">
        <h2 class="text-sm font-semibold text-slate-900 mb-3">Compare environments</h2>
        <div class="flex flex-wrap items-center gap-3">
          <select v-model="env1"
            class="ring-1 ring-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition capitalize">
            <option v-for="e in ENVIRONMENTS" :key="e" :value="e" class="capitalize">{{ e }}</option>
          </select>
          <span class="text-slate-400 font-bold select-none">↔</span>
          <select v-model="env2"
            class="ring-1 ring-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition capitalize">
            <option v-for="e in ENVIRONMENTS" :key="e" :value="e" class="capitalize">{{ e }}</option>
          </select>
          <button @click="runDiff" :disabled="loading || env1 === env2"
            class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
            {{ loading ? 'Comparing…' : 'Compare' }}
          </button>
        </div>
        <p v-if="env1 === env2" class="text-xs text-amber-600 mt-2">Select two different environments to compare.</p>
      </div>

      <!-- Error -->
      <div v-if="error"
        class="bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ error }}</div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Comparing environments…</div>

      <!-- Results -->
      <template v-else-if="diffRows.length > 0">

        <!-- Summary + filter -->
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="counts.changed > 0"
            class="bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 text-xs font-semibold px-3 py-1.5 rounded-full">
            {{ counts.changed }} changed
          </span>
          <span v-if="counts.removed > 0"
            class="bg-red-50 text-red-700 ring-1 ring-red-200 text-xs font-semibold px-3 py-1.5 rounded-full">
            {{ counts.removed }} removed
          </span>
          <span v-if="counts.added > 0"
            class="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-full">
            {{ counts.added }} added
          </span>
          <span v-if="counts.same > 0"
            class="bg-slate-100 text-slate-500 text-xs font-semibold px-3 py-1.5 rounded-full">
            {{ counts.same }} unchanged
          </span>
          <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer ml-1">
            <input type="checkbox" v-model="hideUnchanged" class="accent-blue-600" />
            Hide unchanged
          </label>
        </div>

        <!-- Missing env warnings -->
        <div v-if="env1Missing"
          class="bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          No approved config in <strong class="capitalize">{{ env1 }}</strong> — showing keys from {{ env2 }} only.
        </div>
        <div v-if="env2Missing"
          class="bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          No approved config in <strong class="capitalize">{{ env2 }}</strong> — showing keys from {{ env1 }} only.
        </div>

        <!-- Diff table -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[580px]">
              <thead>
                <tr class="border-b border-slate-100 bg-slate-50/60">
                  <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[26%]">Key</th>
                  <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[30%] capitalize">{{ env1 }}</th>
                  <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[30%] capitalize">{{ env2 }}</th>
                  <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[14%]">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="row in visibleRows" :key="row.nameUuid"
                  :class="{
                    'border-l-4 border-yellow-400 bg-yellow-50/20': row.category === 'changed',
                    'border-l-4 border-red-400 bg-red-50/20':       row.category === 'removed',
                    'border-l-4 border-emerald-400 bg-emerald-50/20': row.category === 'added',
                  }"
                  class="transition">

                  <td class="px-5 py-3 font-semibold text-slate-800">{{ row.displayName }}</td>

                  <!-- Env1 value -->
                  <td class="px-5 py-3 font-mono text-xs">
                    <template v-if="row.category === 'added'">
                      <span class="text-slate-300">—</span>
                    </template>
                    <template v-else-if="row.sensitive1">
                      <span class="text-slate-300 tracking-widest">••••••••</span>
                      <span class="ml-1.5 bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Sensitive</span>
                    </template>
                    <template v-else>
                      <span :class="row.category === 'changed' ? 'text-red-700' : 'text-slate-600'" class="break-all">
                        {{ row.val1 || '—' }}
                      </span>
                    </template>
                  </td>

                  <!-- Env2 value -->
                  <td class="px-5 py-3 font-mono text-xs">
                    <template v-if="row.category === 'removed'">
                      <span class="text-slate-300">—</span>
                    </template>
                    <template v-else-if="row.sensitive2">
                      <span class="text-slate-300 tracking-widest">••••••••</span>
                      <span class="ml-1.5 bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Sensitive</span>
                    </template>
                    <template v-else>
                      <span :class="row.category === 'changed' ? 'text-emerald-700' : 'text-slate-600'" class="break-all">
                        {{ row.val2 || '—' }}
                      </span>
                    </template>
                  </td>

                  <!-- Status -->
                  <td class="px-5 py-3 whitespace-nowrap">
                    <span v-if="row.category === 'changed'"
                      class="bg-yellow-50 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">⚠ changed</span>
                    <span v-else-if="row.category === 'removed'"
                      class="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">✕ removed</span>
                    <span v-else-if="row.category === 'added'"
                      class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">+ added</span>
                    <span v-else
                      class="text-slate-300 text-[10px] font-semibold uppercase tracking-wide">✓ same</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </template>

      <!-- Empty state -->
      <div v-else-if="!loading && !error && env1 !== env2"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center text-sm text-slate-400">
        Click <strong>Compare</strong> to see the diff between these two environments.
      </div>

    </div>
  </div>
</template>
