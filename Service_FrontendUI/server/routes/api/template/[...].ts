import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.TEMPLATE_URL ?? 'http://localhost:18003'
  const path = event.path.replace('/api/template', '')
  return proxyRequest(event, `${base}${path}`)
})
