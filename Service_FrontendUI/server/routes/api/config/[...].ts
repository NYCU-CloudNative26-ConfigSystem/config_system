import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.CONFIG_URL ?? 'http://localhost:18001'
  const path = event.path.replace('/api/config', '')
  return proxyRequest(event, `${base}${path}`)
})
