import { describe, expect, it, vi } from 'vitest'
import { nameError, newId, submitRsvp, validatePayload } from './rsvp.js'

const ID = '3f2b8c1e-9a4d-4c2e-8f1a-0b6d5e7c9a21'
const yes = (guests, extra = {}) => ({ id: ID, attending: true, guests, ...extra })

describe('validazione dei nomi', () => {
  it('richiede nome e cognome', () => {
    expect(nameError('')).toMatch(/nome e cognome/)
    expect(nameError('   ')).toMatch(/nome e cognome/)
    expect(nameError('Maria')).toMatch(/sia il nome sia il cognome/)
    expect(nameError('Maria Rossi')).toBe('')
    expect(nameError("Anna Maria D'Angelo")).toBe('')
    expect(nameError('Jean-Luc Picard')).toBe('')
    expect(nameError('=Maria Rossi')).toMatch(/solo lettere/)
    expect(nameError('Maria Rossi <b>')).toMatch(/solo lettere/)
    expect(nameError('Maria Rossi 😀')).toMatch(/solo lettere/)
    expect(nameError('Nicolò Esposito')).toBe('')
    expect(nameError('a'.repeat(50) + ' ' + 'b'.repeat(40))).toMatch(/massimo/)
  })
})

describe('validatePayload', () => {
  it('accetta un partecipante e normalizza gli spazi', () => {
    const v = validatePayload(yes([{ name: '  Maria   Rossi ', dietary: '' }]))
    expect(v.ok).toBe(true)
    expect(v.value.guests).toEqual([{ name: 'Maria Rossi', dietary: '' }])
  })

  it('accetta più partecipanti entro il massimo e rifiuta oltre', () => {
    const g = n => Array.from({ length: n }, (_, i) => ({ name: `Ospite ${'ABCDEFGHI'[i]}`, dietary: '' }))
    expect(validatePayload(yes(g(8))).ok).toBe(true)
    expect(validatePayload(yes(g(9))).ok).toBe(false)
    expect(validatePayload(yes([])).ok).toBe(false)
  })

  it('partecipazione negativa: un solo nome, nessun dato alimentare', () => {
    const v = validatePayload({ id: ID, attending: false, guests: [{ name: 'Luca Bianchi', dietary: 'senza glutine' }] })
    expect(v.ok).toBe(true)
    expect(v.value.guests[0].dietary).toBe('')
    expect(validatePayload({ id: ID, attending: false, guests: [{ name: 'Luca Bianchi' }, { name: 'Anna Bianchi' }] }).ok).toBe(false)
  })

  it('accetta esigenze alimentari senza ulteriori conferme', () => {
    const v = validatePayload(yes([{ name: 'Maria Rossi', dietary: ' Celiachia ' }]))
    expect(v.value.guests[0].dietary).toBe('Celiachia')
  })

  it('ripulisce caratteri invisibili e di controllo, rifiuta simboli nelle esigenze', () => {
    const v = validatePayload(yes([{ name: 'Maria\u202E Rossi\u200B', dietary: 'Noci\u200B, 50%\nlatte' }]))
    expect(v.value.guests[0]).toEqual({ name: 'Maria Rossi', dietary: 'Noci, 50% latte' })
    expect(validatePayload(yes([{ name: 'Maria Rossi', dietary: '<script>alert(1)</script>' }])).ok).toBe(false)
    expect(validatePayload(yes([{ name: 'Maria Rossi', dietary: '=IMPORTXML("x")' }])).ok).toBe(false)
  })

  it('rifiuta dati malformati', () => {
    expect(validatePayload(null).ok).toBe(false)
    expect(validatePayload([]).ok).toBe(false)
    expect(validatePayload({ ...yes([{ name: 'Maria Rossi' }]), id: 'non-un-uuid' }).ok).toBe(false)
    expect(validatePayload({ ...yes([{ name: 'Maria Rossi' }]), attending: 'sì' }).ok).toBe(false)
    expect(validatePayload(yes([{ name: 42 }])).ok).toBe(false)
    expect(validatePayload(yes([{ name: 'Maria Rossi', dietary: 'x'.repeat(201) }])).ok).toBe(false)
  })
})

describe('submitRsvp', () => {
  const payload = yes([{ name: 'Maria Rossi', dietary: '' }])
  const reply = (status, body) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

  it('ha successo solo con ok:true e lo stesso ID', async () => {
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(200, { ok: true, id: ID }) })).resolves.toMatchObject({ ok: true })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(200, { ok: true, id: 'altro' }) })).rejects.toMatchObject({ code: 'server' })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(200, { ok: false }) })).rejects.toMatchObject({ code: 'server' })
  })

  it('una risposta opaca o non JSON non è mai un successo', async () => {
    const opaque = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: opaque })).rejects.toMatchObject({ code: 'server' })
  })

  it('distingue errori di rete, rate limit e dati non validi', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: offline })).rejects.toMatchObject({ code: 'network' })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(429, { ok: false }) })).rejects.toMatchObject({ code: 'rate' })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(400, { ok: false }) })).rejects.toMatchObject({ code: 'invalid' })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(403, { ok: false, error: 'verify' }) })).rejects.toMatchObject({ code: 'verify' })
    await expect(submitRsvp(payload, { url: 'https://x.test', fetchImpl: reply(409, { ok: false, error: 'full' }) })).rejects.toMatchObject({ code: 'full' })
  })

  it('senza URL configurato non invia nulla', async () => {
    const f = vi.fn()
    await expect(submitRsvp(payload, { url: '', fetchImpl: f })).rejects.toMatchObject({ code: 'config' })
    expect(f).not.toHaveBeenCalled()
  })

  it('invia JSON in POST senza dati personali nell\'URL', async () => {
    const f = reply(200, { ok: true, id: ID })
    await submitRsvp(payload, { url: 'https://x.test/rsvp', fetchImpl: f })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://x.test/rsvp')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(payload)
  })
})

describe('newId', () => {
  it('genera UUID validi anche senza crypto.randomUUID (http in rete locale)', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const a = newId()
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(newId()).not.toBe(a)
      expect(validatePayload({ id: a, attending: false, guests: [{ name: 'Luca Bianchi' }] }).ok).toBe(true)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
