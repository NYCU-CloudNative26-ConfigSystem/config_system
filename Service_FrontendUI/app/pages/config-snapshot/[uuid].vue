<script setup lang="ts">
import type { ConfigReadResponse, NodeResolveResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const uuid = computed(() => route.params.uuid as string)

// Context passed via query params from config.vue
const projId = computed(() => route.query.proj as string ?? '')
const cmpId = computed(() => route.query.cmp as string ?? '')
const envId = computed(() => route.query.env as string ?? '')
const createdBy = ref(route.query.created_by as string || '')
const tmplVersion = computed(() => route.query.tmpl_v ? Number(route.query.tmpl_v) : null)
const isLatest = ref(route.query.is_latest === '1')
// approvalStatus / changeDescription from query params are initial values; replaced with API on mount.
const approvalStatus = route.query.status as string || ''
const rejectionReason = route.query.rejection_reason as string || ''
const changeDescription = ref(route.query.change_description as string || '')

// Viewer's identity and role (fetched from /me)
const myUsername = ref('')
const myRole = ref('user')
const canReview = computed(() =>
  (myRole.value === 'reviewer' || myRole.value === 'admin') &&
  myUsername.value !== createdBy.value
)

// Approval state — seeded from query params, replaced with API values on mount
const localApprovalStatus = ref(approvalStatus)
const localApprovedBy = ref<string | null>(null)
const localRejectionReason = ref(rejectionReason || null)
const approving = ref(false)
const approveError = ref('')
const rejecting = ref(false)
const rejectError = ref('')
const showRejectInput = ref(false)
const rejectReason = ref('')

const ENV_PIPELINE = ['development', 'testing', 'staging', 'production'] as const

function nextEnv(current: string): string | null {
  const idx = ENV_PIPELINE.indexOf(current as typeof ENV_PIPELINE[number])
  return idx >= 0 && idx < ENV_PIPELINE.length - 1 ? ENV_PIPELINE[idx + 1] : null
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// ── Snapshot data ─────────────────────────────────────────────────────────────

const config = ref<ConfigReadResponse | null>(null)
const loading = ref(true)
const loadError = ref('')

const resolvedNames = ref<Record<string, string>>({})
const resolvedValues = ref<Record<string, string>>({})
const resolvedSensitive = ref<Record<string, boolean>>({})
const revealedValues = ref(new Set<string>())

function toggleReveal(valRef: string) {
  const s = new Set(revealedValues.value)
  if (s.has(valRef)) s.delete(valRef)
  else s.add(valRef)
  revealedValues.value = s
}

function stripRef(r: string): string {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

async function resolveNodeToDisplay(nodeUuid: string, depth = 0): Promise<string> {
  if (depth > 4) return '…'
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

async function resolveRows(cfg: ConfigReadResponse) {
  resolvedNames.value = {}
  resolvedValues.value = {}
  resolvedSensitive.value = {}
  await Promise.all(cfg.rows.flatMap(row => [
    api.ssot.resolveNode(row.key, auth.token)
      .then(n => { if (n?.type === 'name') resolvedNames.value[row.key] = n.name_val ?? row.key })
      .catch(() => {}),
    (async () => {
      const stripped = stripRef(row.val)
      const n = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
      if (n?.type === 'value') {
        resolvedValues.value[row.val] = String(n.val ?? '')
        resolvedSensitive.value[row.val] = n.is_sensitive ?? false
      }
      else if (n?.type === 'group') resolvedValues.value[row.val] = await resolveNodeToDisplay(stripped, 0)
    })(),
  ]))
}

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [cfg, me] = await Promise.all([
      api.configTable.getByUuid(uuid.value, auth.token),
      api.auth.me(auth.token).catch(() => ({ username: '', role: 'user', email: '', full_name: '', company: '' })),
    ])
    config.value = cfg
    myUsername.value = me.username
    myRole.value = me.role
    // Override query-param values with the authoritative API response
    if (cfg.approval_status != null) localApprovalStatus.value = cfg.approval_status
    if (cfg.approved_by != null) localApprovedBy.value = cfg.approved_by
    if (cfg.rejection_reason != null) localRejectionReason.value = cfg.rejection_reason
    if (cfg.created_by != null) createdBy.value = cfg.created_by
    if (cfg.is_latest != null) isLatest.value = cfg.is_latest
    if (cfg.change_description != null) changeDescription.value = cfg.change_description
    await resolveRows(config.value)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load snapshot'
  } finally {
    loading.value = false
  }
})

// ── Approve / Reject ──────────────────────────────────────────────────────────

async function approveConfig() {
  approveError.value = ''
  approving.value = true
  try {
    const res = await api.configTable.approve(uuid.value, auth.token)
    localApprovalStatus.value = res.approval_status
    localApprovedBy.value = res.approved_by
  } catch (e: unknown) {
    approveError.value = e instanceof Error ? e.message : 'Approve failed'
  } finally {
    approving.value = false
  }
}

async function rejectConfig() {
  rejectError.value = ''
  rejecting.value = true
  try {
    const res = await api.configTable.reject(uuid.value, rejectReason.value || null, auth.token)
    localApprovalStatus.value = res.approval_status
    localRejectionReason.value = res.rejection_reason
    showRejectInput.value = false
  } catch (e: unknown) {
    rejectError.value = e instanceof Error ? e.message : 'Reject failed'
  } finally {
    rejecting.value = false
  }
}

// ── Promote ───────────────────────────────────────────────────────────────────

const promoting = ref(false)
const promoteError = ref('')
const promoteSuccess = ref('')

const targetEnv = computed(() => nextEnv(envId.value))

async function promoteConfig() {
  if (!targetEnv.value) return
  if (!confirm(`Promote this snapshot from ${envId.value} → ${targetEnv.value}?\n\nThis will create a new latest config in ${targetEnv.value}.`)) return
  promoting.value = true
  promoteError.value = ''
  promoteSuccess.value = ''
  try {
    await api.configTable.promoteByUuid(uuid.value, targetEnv.value, auth.token)
    promoteSuccess.value = `Promoted to ${targetEnv.value}`
    // Navigate to the target environment's history
    setTimeout(() => {
      router.push({ path: '/config', query: { proj: projId.value, cmp: cmpId.value, env: targetEnv.value } })
    }, 800)
  } catch (e: unknown) {
    promoteError.value = e instanceof Error ? e.message : 'Promote failed'
  } finally {
    promoting.value = false
  }
}

// ── Node resolve modal ────────────────────────────────────────────────────────

interface ModalResolvedEntry { key: string; val: string; keyName: string; valDisplay: string }
const modal = ref<{
  uuid: string
  data: NodeResolveResponse | null
  loading: boolean
  error: string
  resolvedEntries: ModalResolvedEntry[]
} | null>(null)

async function openModal(rawUuid: string) {
  const nodeUuid = stripRef(rawUuid)
  modal.value = { uuid: nodeUuid, data: null, loading: true, error: '', resolvedEntries: [] }
  try {
    const result = await api.ssot.resolveNode(nodeUuid, auth.token)
    if (modal.value) modal.value.data = result
    if (result?.type === 'group' && result.entries?.length && modal.value) {
      modal.value.resolvedEntries = await Promise.all(result.entries.map(async e => {
        const keyNode = await api.ssot.resolveNode(e.key, auth.token).catch(() => null)
        const keyName = keyNode?.type === 'name' ? (keyNode.name_val ?? e.key) : e.key
        const valDisplay = await resolveNodeToDisplay(stripRef(e.val), 0)
        return { key: e.key, val: e.val, keyName, valDisplay }
      }))
    }
  } catch (e: unknown) {
    if (modal.value) modal.value.error = e instanceof Error ? e.message : 'Failed to resolve node'
  } finally {
    if (modal.value) modal.value.loading = false
  }
}

function closeModal() { modal.value = null }

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-screen bg-slate-50">

    <!-- Nav -->
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 text-sm">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 shrink-0 select-none">|</span>
          <button
            @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: envId } })"
            class="text-slate-400 hover:text-slate-700 transition shrink-0 capitalize hidden sm:inline">
            {{ envId || 'Config' }}
          </button>
          <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
          <span class="font-semibold text-slate-900 truncate font-mono text-xs">{{ uuid }}</span>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition shrink-0">Logout</button>
      </div>
    </nav>

    <div class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-4">

      <!-- Back button -->
      <div>
        <button
          @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: envId } })"
          class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to {{ envId || 'history' }}
        </button>
      </div>

      <!-- Loading / error -->
      <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Loading snapshot…</div>
      <div v-else-if="loadError"
        class="bg-red-50 ring-1 ring-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">{{ loadError }}</div>

      <template v-else-if="config">

        <!-- Metadata card -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span v-if="isLatest && localApprovalStatus === 'approved'"
                  class="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Latest</span>
                <span v-else-if="localApprovalStatus === 'pending'"
                  class="bg-yellow-50 text-yellow-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Pending review</span>
                <span v-else-if="localApprovalStatus === 'rejected'"
                  class="bg-red-50 text-red-700 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Rejected</span>
                <span v-else-if="localApprovalStatus === 'approved'"
                  class="bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">Approved</span>
                <span class="font-semibold text-slate-900 text-sm capitalize">{{ config.environment }}</span>
                <span v-if="tmplVersion != null"
                  class="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">
                  Template v{{ tmplVersion }}
                </span>
              </div>
              <p class="text-xs text-slate-400 font-mono break-all">{{ uuid }}</p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-50">
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Created</p>
              <p class="text-sm text-slate-700">{{ formatDate(config.date_created) }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Created by</p>
              <p class="text-sm text-slate-700">{{ createdBy ?? 'unknown' }}</p>
            </div>
          </div>
          <div class="border-t border-slate-50 px-5 py-4">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Entries</p>
            <p class="text-sm text-slate-700">{{ config.rows.length }} {{ config.rows.length === 1 ? 'entry' : 'entries' }}</p>
          </div>
          <div v-if="changeDescription" class="border-t border-slate-50 px-5 py-4">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reason for change</p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap">{{ changeDescription }}</p>
          </div>
        </div>

        <!-- Key/value table -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-3 border-b border-slate-50">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Config Entries</h3>
          </div>
          <div v-if="config.rows.length === 0" class="px-5 py-8 text-center text-sm text-slate-400">
            No entries in this snapshot.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left border-b border-slate-50">
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-1/2">Key</th>
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-1/2">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="row in config.rows" :key="row.uuid" class="hover:bg-slate-50/50 transition">
                  <td class="px-5 py-3">
                    <button @click="openModal(row.key)"
                      class="font-semibold text-slate-800 hover:text-blue-600 transition text-left">
                      {{ resolvedNames[row.key] ?? '…' }}
                    </button>
                  </td>
                  <td class="px-5 py-3">
                    <div v-if="resolvedSensitive[row.val]" class="flex items-center gap-2 flex-wrap">
                      <span v-if="!revealedValues.has(row.val)"
                        class="font-mono text-xs text-slate-300 tracking-widest select-none">••••••••</span>
                      <button v-else @click="openModal(row.val)"
                        class="text-slate-600 hover:text-blue-600 transition text-left font-mono text-xs break-all">
                        {{ resolvedValues[row.val] ?? '…' }}
                      </button>
                      <span class="bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">Sensitive</span>
                      <button v-if="canReview"
                        @click="toggleReveal(row.val)"
                        class="text-xs font-medium text-slate-400 hover:text-slate-700 transition underline shrink-0">
                        {{ revealedValues.has(row.val) ? 'Hide' : 'Reveal' }}
                      </button>
                    </div>
                    <button v-else @click="openModal(row.val)"
                      class="text-slate-600 hover:text-blue-600 transition text-left font-mono text-xs break-all">
                      {{ resolvedValues[row.val] ?? '…' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Approval card -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h3 class="font-semibold text-slate-900 text-sm">Review</h3>
          </div>

          <!-- Pending + can review -->
          <template v-if="localApprovalStatus === 'pending' && canReview">
            <div class="px-5 py-4 space-y-3">
              <p class="text-sm text-slate-600">This snapshot is awaiting approval. As a <span class="font-semibold capitalize">{{ myRole }}</span>, you can approve or reject it.</p>
              <div class="flex flex-wrap gap-2">
                <button
                  @click="approveConfig"
                  :disabled="approving"
                  class="rounded-xl px-5 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40">
                  {{ approving ? 'Approving…' : 'Approve' }}
                </button>
                <button
                  @click="showRejectInput = !showRejectInput"
                  :disabled="rejecting"
                  class="rounded-xl px-5 py-2 text-sm font-semibold ring-1 ring-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-40">
                  Reject
                </button>
              </div>
              <div v-if="showRejectInput" class="space-y-2">
                <textarea
                  v-model="rejectReason"
                  placeholder="Reason (optional)"
                  rows="2"
                  class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 transition resize-none" />
                <button
                  @click="rejectConfig"
                  :disabled="rejecting"
                  class="rounded-xl px-5 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40">
                  {{ rejecting ? 'Rejecting…' : 'Confirm Reject' }}
                </button>
              </div>
              <div v-if="approveError" class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ approveError }}</div>
              <div v-if="rejectError" class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ rejectError }}</div>
            </div>
          </template>

          <!-- Pending + cannot review -->
          <template v-else-if="localApprovalStatus === 'pending'">
            <div class="px-5 py-4">
              <p v-if="myRole === 'user'" class="text-sm text-slate-500">
                Awaiting approval from a reviewer or admin.
              </p>
              <p v-else class="text-sm text-slate-500">
                You submitted this snapshot and cannot approve your own work.
              </p>
            </div>
          </template>

          <!-- Approved -->
          <template v-else-if="localApprovalStatus === 'approved'">
            <div class="px-5 py-4 flex items-center gap-3">
              <span class="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold shrink-0">✓</span>
              <div>
                <p class="text-sm font-semibold text-emerald-700">Approved</p>
                <p v-if="localApprovedBy" class="text-xs text-slate-400 mt-0.5">by {{ localApprovedBy }}</p>
              </div>
            </div>
          </template>

          <!-- Rejected -->
          <template v-else-if="localApprovalStatus === 'rejected'">
            <div class="px-5 py-4 space-y-2">
              <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold shrink-0">✗</span>
                <p class="text-sm font-semibold text-red-700">Rejected</p>
              </div>
              <p v-if="localRejectionReason" class="text-sm text-slate-600 bg-red-50 ring-1 ring-red-100 rounded-xl px-3 py-2">
                {{ localRejectionReason }}
              </p>
            </div>
          </template>
        </div>

        <!-- Promote action -->
        <div v-if="targetEnv" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 class="font-semibold text-slate-900 text-sm">Promote snapshot</h3>
              <p class="text-xs text-slate-400 mt-0.5 capitalize">
                Copy this config to <span class="font-semibold text-slate-600">{{ targetEnv }}</span>
              </p>
            </div>
            <button
              @click="promoteConfig"
              :disabled="promoting || !!promoteSuccess"
              class="rounded-xl px-5 py-2.5 text-sm font-semibold transition shrink-0"
              :class="promoteSuccess
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'">
              {{ promoteSuccess ? promoteSuccess : promoting ? 'Promoting…' : `↑ Promote to ${targetEnv}` }}
            </button>
          </div>
          <div v-if="promoteError" class="mt-3 text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">
            {{ promoteError }}
          </div>
        </div>

        <div v-else class="text-xs text-slate-400 text-center py-2">
          Production environment — no further promotion available.
        </div>

      </template>
    </div>

    <!-- Node resolve modal -->
    <Teleport to="body">
      <div v-if="modal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModal" />
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 v-if="modal.data?.type === 'name'" class="font-semibold text-slate-900 text-lg">{{ modal.data.name_val }}</h3>
              <h3 v-else-if="modal.data?.type === 'value'" class="font-semibold text-slate-900 text-lg font-mono">{{ modal.data.val }}</h3>
              <h3 v-else-if="modal.data?.type === 'group'" class="font-semibold text-slate-900 text-lg font-mono">{{ modal.data.isArray ? '[ ]' : '{ }' }}</h3>
              <h3 v-else class="font-semibold text-slate-900">Node Detail</h3>
              <p class="font-mono text-xs text-slate-400 break-all mt-1">{{ modal.uuid }}</p>
            </div>
            <button @click="closeModal"
              class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0 text-lg leading-none">×</button>
          </div>
          <div v-if="modal.loading" class="text-sm text-slate-400">Resolving…</div>
          <div v-else-if="modal.error" class="text-sm text-red-600">{{ modal.error }}</div>
          <div v-else-if="modal.data" class="space-y-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-slate-400 text-xs font-semibold uppercase tracking-wide w-14 shrink-0">Type</span>
              <span class="font-semibold capitalize text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{{ modal.data.type }}</span>
            </div>
            <template v-if="modal.data.type === 'group'">
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-xs font-semibold uppercase tracking-wide w-14 shrink-0">Kind</span>
                <span class="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{{ modal.data.isArray ? 'Array' : 'Object' }}</span>
              </div>
              <div v-if="modal.resolvedEntries.length > 0" class="space-y-1.5">
                <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Entries</p>
                <div v-for="entry in modal.resolvedEntries" :key="entry.key"
                  class="flex items-center gap-2 bg-slate-50 ring-1 ring-slate-100 rounded-xl px-3 py-2">
                  <span class="font-semibold text-slate-700 shrink-0 text-sm">{{ entry.keyName }}</span>
                  <span class="text-slate-300">→</span>
                  <button @click="openModal(entry.val)"
                    class="text-slate-600 hover:text-blue-600 transition text-left break-all font-mono text-xs flex-1 min-w-0">
                    {{ entry.valDisplay }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
