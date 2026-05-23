import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.LOGIN_URL ?? 'http://localhost:18000'
  const path = event.path.replace('/api/login', '')
  return proxyRequest(event, `${base}${path}`)
})
