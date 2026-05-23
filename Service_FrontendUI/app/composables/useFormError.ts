export function useFormError() {
  const error = ref('')

  function setError(e: unknown, fallback = 'Something went wrong. Please try again.') {
    const raw = (e instanceof Error ? e.message : String(e)).toLowerCase()

    if (raw.includes('invalid credentials') || raw.includes('incorrect') || raw.includes('unauthorized'))
      error.value = 'Incorrect email or password.'
    else if (raw.includes('user not found') || raw.includes('no user'))
      error.value = 'No account found with that email address.'
    else if (raw.includes('already registered') || raw.includes('already exists') || raw.includes('duplicate'))
      error.value = 'An account with this email already exists.'
    else if (raw.includes('account locked') || raw.includes('too many'))
      error.value = 'Account temporarily locked due to too many failed attempts. Try again later.'
    else if (raw.includes('password') && raw.includes('short'))
      error.value = 'Password must be at least 8 characters.'
    else if (raw.includes('422') || raw.includes('validation'))
      error.value = 'Please check your details and try again.'
    else if (raw.includes('network') || raw.includes('failed to fetch'))
      error.value = 'Cannot reach the server. Check your connection.'
    else
      error.value = fallback

    return error.value
  }

  function clear() {
    error.value = ''
  }

  return { error, setError, clear }
}
