export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>('')

  if (import.meta.client) {
    token.value = localStorage.getItem('access_token') ?? ''
  }

  const isLoggedIn = computed(() => !!token.value)

  function setToken(t: string) {
    token.value = t
    localStorage.setItem('access_token', t)
  }

  function logout() {
    token.value = ''
    localStorage.removeItem('access_token')
    navigateTo('/login')
  }

  return { token, isLoggedIn, setToken, logout }
})
