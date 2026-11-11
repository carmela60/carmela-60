// Cloudflare Turnstile: verifica che l'invio arrivi da una persona, di solito senza alcuna interazione.
// Lo script viene caricato solo al momento dell'invio, non all'apertura del sito.
import { TURNSTILE_SITE_KEY } from '../config/event.js'

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading = null

function load() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => { loading = null; s.remove(); reject(new Error('turnstile')) }
    document.head.appendChild(s)
  })
  return loading
}

// Restituisce un token monouso. Se serve un'interazione, il riquadro compare dentro `container`.
export async function getHumanToken(container, siteKey = TURNSTILE_SITE_KEY, timeoutMs = 120000) {
  if (!siteKey || !container) throw new Error('turnstile')
  const ts = await load()
  return new Promise((resolve, reject) => {
    let id
    const done = (fn, v) => {
      clearTimeout(timer)
      try { ts.remove(id) } catch { /* già rimosso */ }
      fn(v)
    }
    const timer = setTimeout(() => done(reject, new Error('turnstile')), timeoutMs)
    id = ts.render(container, {
      sitekey: siteKey,
      action: 'rsvp',
      language: 'it',
      appearance: 'interaction-only',
      execution: 'execute',
      callback: token => done(resolve, token),
      'error-callback': () => done(reject, new Error('turnstile')),
      'expired-callback': () => done(reject, new Error('turnstile')),
      'timeout-callback': () => done(reject, new Error('turnstile')),
    })
    ts.execute(container)
  })
}
