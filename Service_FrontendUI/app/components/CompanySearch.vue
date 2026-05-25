<script setup lang="ts">
import type { CompanyResponse } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  companies: CompanyResponse[]
  modelValue?: string
  placeholder?: string
  inputClass?: string
}>(), {
  placeholder: 'Search company…',
  inputClass: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const query = ref('')
const showDropdown = ref(false)

// Sync display text when external value or company list changes
watch([() => props.modelValue, () => props.companies], () => {
  const match = props.companies.find(c => c.cmp_id === props.modelValue)
  query.value = match ? match.display_name : ''
}, { immediate: true })

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return props.companies
  return props.companies.filter(c =>
    c.display_name.toLowerCase().includes(q) || c.cmp_id.toLowerCase().includes(q)
  )
})

function onInput() {
  showDropdown.value = true
  // If query no longer matches the current selection, clear the value
  const current = props.companies.find(c => c.cmp_id === props.modelValue)
  if (current && query.value !== current.display_name) {
    emit('update:modelValue', '')
  }
}

function pick(company: CompanyResponse) {
  query.value = company.display_name
  emit('update:modelValue', company.cmp_id)
  showDropdown.value = false
}

function onBlur() {
  setTimeout(() => {
    showDropdown.value = false
    // Restore display name of selected company if query was modified but no new pick was made
    const match = props.companies.find(c => c.cmp_id === props.modelValue)
    query.value = match ? match.display_name : ''
  }, 150)
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      :class="inputClass"
      @input="onInput"
      @focus="showDropdown = true"
      @blur="onBlur"
      autocomplete="off"
    />
    <ul
      v-if="showDropdown && filtered.length > 0"
      class="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto"
    >
      <li
        v-for="c in filtered"
        :key="c.cmp_id"
        @mousedown.prevent="pick(c)"
        class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex justify-between gap-2"
      >
        <span class="font-medium">{{ c.display_name }}</span>
        <span class="text-gray-400 text-xs font-mono truncate">{{ c.cmp_id }}</span>
      </li>
    </ul>
    <p
      v-if="showDropdown && query.trim() && filtered.length === 0"
      class="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow px-3 py-2 text-xs text-gray-400"
    >
      No companies match "{{ query }}"
    </p>
  </div>
</template>
