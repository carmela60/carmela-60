// Proxy RSVP: sito statico -> Cloudflare Worker -> Google Apps Script -> Google Sheet privato.
// Non registra mai nomi o esigenze alimentari: nessun console.log del contenuto.
import { validatePayload, LIMITS } from '../../src/lib/rsvp.js'

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/
const GOOGLE_ECHO_HOST = 'script.googleusercontent.com'
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'rsvp'
const MIN_SECRET = 32
const UPSTREAM_TIMEOUT = 20000

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } })

// Legge il corpo fermandosi appena supera il limite (anche senza Content-Length). UTF-8 non valido = errore.
async function readCapped(request, max) {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) { all.set(c, offset); offset += c.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(all)
}

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export async function hmac(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

// Verifica Cloudflare Turnstile: token valido, azione attesa e dominio del sito.
async function humanCheck(token, ip, env, hostnames) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  try {
    const res = await fetch(TURNSTILE_VERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const out = await res.json()
    return out?.success === true && out.action === TURNSTILE_ACTION && hostnames.includes(out.hostname)
  } catch {
    return false
  }
}

// Inoltro firmato: il segreto non viaggia mai, la firma copre orario e contenuto.
// Apps Script risponde con un redirect verso googleusercontent: lo seguiamo solo verso quell'host.
async function forward(env, payload) {
  const body = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000)
  const sig = await hmac(env.APPS_SCRIPT_SECRET, `${ts}.${body}`)
  let res = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: body, ts, sig }),
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
  })
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get('Location') || '', env.APPS_SCRIPT_URL)
    if (next.protocol !== 'https:' || next.hostname !== GOOGLE_ECHO_HOST) throw new Error('redirect')
    res = await fetch(next, { redirect: 'error', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) })
  }
  if (!res.ok) throw new Error('status')
  const text = await res.text()
  if (text.length > 1024) throw new Error('size')
  return JSON.parse(text)
}

function configOk(env) {
  return APPS_SCRIPT_URL.test(env.APPS_SCRIPT_URL || '') &&
    String(env.APPS_SCRIPT_SECRET || '').length >= MIN_SECRET &&
    Boolean(env.TURNSTILE_SECRET) &&
    typeof env.RATE_LIMITER?.limit === 'function'
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname !== '/') return json(404, { ok: false, error: 'not_found' })

    const origin = request.headers.get('Origin') || ''
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    // L'Origin limita i browser, non autentica: le difese reali sono Turnstile, rate limit, validazione e firma.
    const okOrigin = allowed.includes(origin)
    const cors = okOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: okOrigin ? 204 : 403,
        headers: okOrigin
          ? { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }
          : cors,
      })
    }
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method' }, { ...cors, Allow: 'POST, OPTIONS' })
    if (!okOrigin) return json(403, { ok: false, error: 'origin' }, cors)
    if (!configOk(env)) return json(500, { ok: false, error: 'config' }, cors)
    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return json(415, { ok: false, error: 'type' }, cors)
    }

    const ip = request.headers.get('CF-Connecting-IP') || ''
    const { success } = await env.RATE_LIMITER.limit({ key: ip || 'unknown' })
    if (!success) return json(429, { ok: false, error: 'rate' }, cors)

    if (Number(request.headers.get('Content-Length') || 0) > LIMITS.bodyBytes) return json(413, { ok: false, error: 'size' }, cors)
    let text
    try { text = await readCapped(request, LIMITS.bodyBytes) } catch { return json(400, { ok: false, error: 'invalid' }, cors) }
    if (text === null) return json(413, { ok: false, error: 'size' }, cors)

    let body
    try { body = JSON.parse(text) } catch { return json(400, { ok: false, error: 'invalid' }, cors) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { ok: false, error: 'invalid' }, cors)
    // Campo esca invisibile: un essere umano lo lascia vuoto.
    if (body.website) return json(400, { ok: false, error: 'invalid' }, cors)
    const v = validatePayload(body, Number(env.MAX_GUESTS) || undefined)
    if (!v.ok) return json(400, { ok: false, error: 'invalid' }, cors)

    const hostnames = allowed.map(o => { try { return new URL(o).hostname } catch { return '' } })
    if (!(await humanCheck(body.token, ip, env, hostnames))) return json(403, { ok: false, error: 'verify' }, cors)

    let data
    try { data = await forward(env, v.value) } catch { return json(502, { ok: false, error: 'upstream' }, cors) }

    if (data?.ok === true && data.id === v.value.id) {
      return json(200, { ok: true, id: v.value.id, duplicate: data.duplicate === true }, cors)
    }
    const known = ['busy', 'full'].includes(data?.error) ? data.error : 'upstream'
    return json(known === 'full' ? 409 : 502, { ok: false, error: known }, cors)
  },
}
