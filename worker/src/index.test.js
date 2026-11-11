// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import worker, { hmac } from './index.js'

const ORIGIN = 'https://carmela.example'
const ID = '3f2b8c1e-9a4d-4c2e-8f1a-0b6d5e7c9a21'
const SCRIPT = 'https://script.google.com/macros/s/AKfycbx_test-deployment-id_1234567890/exec'
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=abc'
const SECRET = 'x'.repeat(40)
const limiter = (success = true) => ({ limit: vi.fn().mockResolvedValue({ success }) })
const makeEnv = (over = {}) => ({
  ALLOWED_ORIGINS: ORIGIN, APPS_SCRIPT_URL: SCRIPT, APPS_SCRIPT_SECRET: SECRET,
  TURNSTILE_SECRET: 'ts-secret', MAX_GUESTS: '8', RATE_LIMITER: limiter(), ...over,
})
const body = { id: ID, attending: true, guests: [{ name: 'Maria Rossi', dietary: 'Celiachia' }], website: '', token: 'tok' }
const req = (b = body, { origin = ORIGIN, method = 'POST', headers = {}, path = '/' } = {}) =>
  new Request(`https://rsvp.workers.test${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
    body: method === 'POST' ? (typeof b === 'string' ? b : JSON.stringify(b)) : undefined,
  })

// Finto internet: Turnstile, Apps Script (redirect 302) e pagina echo di Google.
function net({ human = { success: true, action: 'rsvp', hostname: 'carmela.example' }, reply = { ok: true, id: ID }, location = ECHO, echo } = {}) {
  const f = vi.fn(async (url, init = {}) => {
    // Come il runtime di Cloudflare: redirect ammessi solo 'follow' o 'manual'.
    if (init.redirect && !['follow', 'manual'].includes(init.redirect)) throw new TypeError('Invalid redirect value')
    const u = String(url)
    if (u.startsWith('https://challenges.cloudflare.com/')) return Response.json(human)
    if (u === SCRIPT) return new Response(null, { status: 302, headers: { Location: location } })
    if (u === ECHO) return echo ? echo() : Response.json(reply)
    throw new Error(`rete inattesa: ${u} ${init.method || 'GET'}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}

describe('Worker: percorso felice', () => {
  it('verifica Turnstile, firma il payload e conferma solo con lo stesso ID', async () => {
    const f = net()
    const res = await worker.fetch(req(), makeEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: ID, duplicate: false })

    const [, verifyInit] = f.mock.calls[0]
    expect(verifyInit.body.get('secret')).toBe('ts-secret')
    expect(verifyInit.body.get('response')).toBe('tok')
    expect(verifyInit.body.get('remoteip')).toBe('1.2.3.4')

    const [url, init] = f.mock.calls[1]
    expect(url).toBe(SCRIPT)
    expect(init.redirect).toBe('manual')
    const env = JSON.parse(init.body)
    expect(env.secret).toBeUndefined()
    expect(JSON.stringify(env)).not.toContain(SECRET)
    expect(env.sig).toBe(createHmac('sha256', SECRET).update(`${env.ts}.${env.payload}`).digest('hex'))
    expect(Math.abs(env.ts - Date.now() / 1000)).toBeLessThan(5)
    expect(JSON.parse(env.payload)).toEqual({ id: ID, attending: true, guests: [{ name: 'Maria Rossi', dietary: 'Celiachia' }] })
  })

  it('l\'HMAC del Worker coincide con quello standard (compatibile con Apps Script)', async () => {
    expect(await hmac('chiave', '123.{"a":"è"}')).toBe(createHmac('sha256', 'chiave').update('123.{"a":"è"}').digest('hex'))
  })

  it('segnala i duplicati e il foglio pieno', async () => {
    net({ reply: { ok: true, id: ID, duplicate: true } })
    expect(await (await worker.fetch(req(), makeEnv())).json()).toEqual({ ok: true, id: ID, duplicate: true })
    net({ reply: { ok: false, error: 'full' } })
    const full = await worker.fetch(req(), makeEnv())
    expect(full.status).toBe(409)
    expect(await full.json()).toEqual({ ok: false, error: 'full' })
  })

  it('risponde con header di sicurezza', async () => {
    net()
    const res = await worker.fetch(req(), makeEnv())
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
  })
})

describe('Worker: difese', () => {
  it('preflight CORS solo per gli origin consentiti', async () => {
    const ok = await worker.fetch(req(null, { method: 'OPTIONS' }), makeEnv())
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    const ko = await worker.fetch(req(null, { method: 'OPTIONS', origin: 'https://evil.test' }), makeEnv())
    expect(ko.status).toBe(403)
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('rifiuta senza contattare nessuno: percorso, metodo, origin, tipo, JSON, payload, esca', async () => {
    const f = net()
    const env = makeEnv()
    expect((await worker.fetch(req(body, { path: '/admin' }), env)).status).toBe(404)
    expect((await worker.fetch(req(null, { method: 'GET' }), env)).status).toBe(405)
    expect((await worker.fetch(req(body, { origin: 'https://evil.test' }), env)).status).toBe(403)
    expect((await worker.fetch(req(body, { origin: '' }), env)).status).toBe(403)
    expect((await worker.fetch(req(body, { headers: { 'Content-Type': 'text/plain' } }), env)).status).toBe(415)
    expect((await worker.fetch(req('{non json'), env)).status).toBe(400)
    expect((await worker.fetch(req('[1,2]'), env)).status).toBe(400)
    expect((await worker.fetch(req({ ...body, guests: [{ name: 'Maria' }] }), env)).status).toBe(400)
    expect((await worker.fetch(req({ ...body, guests: [{ name: 'Maria‮ Rossi', dietary: '<script>' }] }), env)).status).toBe(400)
    expect((await worker.fetch(req({ ...body, website: 'http://spam' }), env)).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('rifiuta richieste troppo grandi, anche senza Content-Length, e UTF-8 non valido', async () => {
    net()
    const env = makeEnv()
    expect((await worker.fetch(req({ ...body, padding: 'x'.repeat(9000) }), env)).status).toBe(413)
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(1024).fill(32)); c.close() } })
    const chunked = new Request('https://rsvp.workers.test/', { method: 'POST', body: stream, duplex: 'half', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } })
    expect((await worker.fetch(chunked, env)).status).toBe(413)
    const bad = new Request('https://rsvp.workers.test/', { method: 'POST', body: new Uint8Array([0x7b, 0xff, 0x7d]), headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } })
    expect((await worker.fetch(bad, env)).status).toBe(400)
  })

  it('applica il rate limit per IP', async () => {
    net()
    const rl = limiter(false)
    const res = await worker.fetch(req(), makeEnv({ RATE_LIMITER: rl }))
    expect(res.status).toBe(429)
    expect(rl.limit).toHaveBeenCalledWith({ key: '1.2.3.4' })
  })

  it('blocca i bot: token assente, non valido, di un\'altra azione o di un altro sito', async () => {
    const cases = [
      [{ ...body, token: undefined }, {}],
      [body, { human: { success: false } }],
      [body, { human: { success: true, action: 'login', hostname: 'carmela.example' } }],
      [body, { human: { success: true, action: 'rsvp', hostname: 'evil.test' } }],
    ]
    for (const [b, opts] of cases) {
      const f = net(opts)
      const res = await worker.fetch(req(b), makeEnv())
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ ok: false, error: 'verify' })
      expect(f.mock.calls.some(([u]) => String(u) === SCRIPT)).toBe(false)
    }
  })

  it('legge la risposta di Google con opzioni accettate dal runtime Cloudflare', async () => {
    const f = net()
    expect((await worker.fetch(req(), makeEnv())).status).toBe(200)
    const echoCall = f.mock.calls.find(([u]) => String(u) === ECHO)
    expect(echoCall[1].redirect).toBe('manual')
  })

  it('non segue un secondo redirect dalla pagina di Google', async () => {
    net({ echo: () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/' } }) })
    expect((await worker.fetch(req(), makeEnv())).status).toBe(502)
  })

  it('segue il redirect solo verso googleusercontent', async () => {
    const f = net({ location: 'https://evil.test/steal' })
    const res = await worker.fetch(req(), makeEnv())
    expect(res.status).toBe(502)
    expect(f.mock.calls.some(([u]) => String(u).includes('evil.test'))).toBe(false)
  })

  it('non inventa successi: risposta errata, con altro ID, non JSON o rete giù', async () => {
    net({ reply: { ok: false, error: 'busy' } })
    expect((await worker.fetch(req(), makeEnv())).status).toBe(502)
    net({ reply: { ok: true, id: 'altro-id' } })
    expect((await worker.fetch(req(), makeEnv())).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async u => (String(u).includes('challenges') ? Response.json({ success: true, action: 'rsvp', hostname: 'carmela.example' }) : new Response('<html>Accedi</html>'))))
    expect((await worker.fetch(req(), makeEnv())).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async u => { if (String(u).includes('challenges')) return Response.json({ success: true, action: 'rsvp', hostname: 'carmela.example' }); throw new Error('down') }))
    expect((await worker.fetch(req(), makeEnv())).status).toBe(502)
  })

  it('senza configurazione completa e sicura non contatta nessuno', async () => {
    const f = net()
    const bad = [
      { APPS_SCRIPT_URL: undefined },
      { APPS_SCRIPT_URL: 'https://evil.test/exec' },
      { APPS_SCRIPT_SECRET: 'corto' },
      { TURNSTILE_SECRET: '' },
      { RATE_LIMITER: undefined },
    ]
    for (const over of bad) expect((await worker.fetch(req(), makeEnv(over))).status).toBe(500)
    expect(f).not.toHaveBeenCalled()
  })

  it('non scrive nomi o allergie nei log', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map(m => vi.spyOn(console, m))
    net()
    await worker.fetch(req(), makeEnv())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await worker.fetch(req(), makeEnv())
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
