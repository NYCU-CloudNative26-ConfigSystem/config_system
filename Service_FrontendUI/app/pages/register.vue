<script setup lang="ts">
const api = useApi()

const fullName = ref('')
const username = ref('')
const company = ref('')
const email = ref('')
const password = ref('')
const { error, setError, clear } = useFormError()

async function register() {
  clear()
  try {
    await api.auth.register(email.value, username.value, password.value, fullName.value, company.value)
    navigateTo('/login?registered=1')
  } catch (e: unknown) {
    setError(e, 'Registration failed. Please try again.')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-full max-w-sm space-y-6">
      <h1 class="text-2xl font-bold text-center">Register</h1>
      <form @submit.prevent="register" class="space-y-4">
        <input v-model="fullName" type="text" placeholder="Full name" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="username" type="text" placeholder="Username (min 3 chars)" minlength="3" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="company" type="text" placeholder="Company" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="email" type="email" placeholder="Email" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="password" type="password" placeholder="Password (min 8 chars)" minlength="8" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div v-if="error" class="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <span class="mt-0.5">⚠</span>
          <span>{{ error }}</span>
        </div>
        <button type="submit"
          class="w-full bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700 transition">
          Create account
        </button>
      </form>
      <p class="text-sm text-center text-gray-500">
        Already have an account?
        <NuxtLink to="/login" class="text-blue-600 hover:underline">Login</NuxtLink>
      </p>
    </div>
  </div>
</template>
