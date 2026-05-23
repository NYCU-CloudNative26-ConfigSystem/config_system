import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.VERSION_URL ?? 'http://localhost:18004'
  const path = event.path.replace('/api/version', '')
  return proxyRequest(event, `${base}${path}`)
})
