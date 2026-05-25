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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4 py-8">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/30">
          <span class="text-white text-sm font-bold tracking-tight">CS</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-900">Create an account</h1>
        <p class="text-sm text-slate-500 mt-1">Get started with Config System</p>
      </div>

      <div class="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-7">
        <form @submit.prevent="register" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Full name</label>
              <input v-model="fullName" type="text" placeholder="Jane Smith" required
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Username</label>
              <input v-model="username" type="text" placeholder="janedoe" minlength="3" required
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Company</label>
            <input v-model="company" type="text" placeholder="Your company or team" required
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
            <input v-model="email" type="email" placeholder="you@example.com" required
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Password</label>
            <input v-model="password" type="password" placeholder="Minimum 8 characters" minlength="8" required
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition" />
          </div>
          <div v-if="error"
            class="flex items-start gap-2 rounded-xl bg-red-50 ring-1 ring-red-200 px-3 py-2.5 text-sm text-red-700">
            <span class="mt-0.5 shrink-0">⚠</span><span>{{ error }}</span>
          </div>
          <button type="submit"
            class="w-full bg-blue-600 text-white rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-blue-700 active:scale-[0.99] transition mt-1">
            Create account
          </button>
        </form>
      </div>

      <p class="text-sm text-center text-slate-500 mt-5">
        Already have an account?
        <NuxtLink to="/login" class="text-blue-600 hover:text-blue-700 font-semibold">Sign in</NuxtLink>
      </p>
    </div>
  </div>
</template>
