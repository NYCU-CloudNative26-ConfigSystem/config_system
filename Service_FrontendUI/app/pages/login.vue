<script setup lang="ts">
const route = useRoute()
const api = useApi()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const { error, setError, clear } = useFormError()
const registerSuccess = route.query.registered === '1'

async function login() {
  clear()
  try {
    const res = await api.auth.login(email.value, password.value)
    auth.setToken(res.access_token)
    navigateTo('/home')
  } catch (e: unknown) {
    setError(e, 'Login failed. Please try again.')
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-full max-w-sm space-y-6">
      <h1 class="text-2xl font-bold text-center">Login</h1>
      <div v-if="registerSuccess" class="text-sm text-green-600 text-center">
        Account created! You can now log in.
      </div>
      <form @submit.prevent="login" class="space-y-4">
        <input v-model="email" type="email" placeholder="Email" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="password" type="password" placeholder="Password" required
          class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div v-if="error" class="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <span class="mt-0.5">⚠</span>
          <span>{{ error }}</span>
        </div>
        <button type="submit"
          class="w-full bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700 transition">
          Login
        </button>
      </form>
      <p class="text-sm text-center text-gray-500">
        Don't have an account?
        <NuxtLink to="/register" class="text-blue-600 hover:underline">Register</NuxtLink>
      </p>
    </div>
  </div>
</template>
