import { EVENT, RSVP_API_URL } from '../config/event.js'

export const LIMITS = { name: 80, dietary: 200, bodyBytes: 8 * 1024 }

// Rimuove caratteri di controllo e invisibili (es. inversione del testo, spazi a larghezza zero).
const clean = s => String(s ?? '').normalize('NFC').replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Solo lettere (anche accentate), spazi, apostrofi, punti e trattini; deve iniziare con una lettera.
const NAME_CHARS = /^\p{L}[\p{L}\p{M} '’.-]*$/u
// Lettere, numeri e punteggiatura semplice.
const DIETARY_CHARS = /^[\p{L}\p{M}\p{N} '’.,;:()/%+-]*$/u

// Nome e cognome: almeno due parole con lettere.
export function nameError(raw) {
  const v = clean(raw)
  if (!v) return 'Scrivi nome e cognome.'
  if (v.length > LIMITS.name) return `Usa al massimo ${LIMITS.name} caratteri.`
  if (!NAME_CHARS.test(v)) return 'Usa solo lettere, spazi, apostrofi e trattini.'
  if (!/\p{L}.*\s.*\p{L}/u.test(v)) return 'Scrivi sia il nome sia il cognome, ad esempio Maria Rossi.'
  return ''
}

export function dietaryError(raw) {
  const v = clean(raw)
  if (v.length > LIMITS.dietary) return `Usa al massimo ${LIMITS.dietary} caratteri.`
  if (!DIETARY_CHARS.test(v)) return 'Usa solo lettere, numeri e punteggiatura semplice.'
  return ''
}

// Validazione condivisa tra frontend e Worker. Restituisce il payload normalizzato.
export function validatePayload(p, maxGuests = EVENT.maxGuests) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false }
  if (typeof p.id !== 'string' || !UUID.test(p.id)) return { ok: false }
  if (typeof p.attending !== 'boolean') return { ok: false }
  if (!Array.isArray(p.guests)) return { ok: false }
  const max = p.attending ? maxGuests : 1
  if (p.guests.length < 1 || p.guests.length > max) return { ok: false }
  const guests = []
  for (const g of p.guests) {
    if (!g || typeof g !== 'object' || typeof g.name !== 'string') return { ok: false }
    if (g.dietary != null && typeof g.dietary !== 'string') return { ok: false }
    if (nameError(g.name) || dietaryError(g.dietary)) return { ok: false }
    guests.push({ name: clean(g.name), dietary: p.attending ? clean(g.dietary) : '' })
  }
  return { ok: true, value: { id: p.id.toLowerCase(), attending: p.attending, guests } }
}

// UUID v4. randomUUID esiste solo su HTTPS: in rete locale (http://192.168...) si usa getRandomValues.
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export class RsvpError extends Error {
  constructor(code) { super(code); this.code = code }
}

// Il successo vale solo se il backend risponde ok con lo stesso ID inviato.
export async function submitRsvp(payload, { url = RSVP_API_URL, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (!url) throw new RsvpError('config')
  let res
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new RsvpError('network')
  }
  let data = null
  try { data = await res.json() } catch { /* risposta non JSON */ }
  if (res.ok && data?.ok === true && data.id === payload.id) return data
  if (res.status === 429) throw new RsvpError('rate')
  if (['verify', 'full'].includes(data?.error)) throw new RsvpError(data.error)
  throw new RsvpError(res.status === 400 || res.status === 413 ? 'invalid' : 'server')
}
