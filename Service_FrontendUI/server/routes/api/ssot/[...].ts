import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.SSOT_URL ?? 'http://localhost:18002'
  const path = event.path.replace('/api/ssot', '')
  return proxyRequest(event, `${base}${path}`)
})
