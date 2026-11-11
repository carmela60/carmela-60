import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { buildIcs } from './src/lib/calendar.js'
import { EVENT } from './src/config/event.js'

const TURNSTILE = 'https://challenges.cloudflare.com'

// Il file .ics è generato dalla stessa configurazione dell'evento e servito come file statico:
// iOS Safari lo apre direttamente nella schermata "Aggiungi al calendario".
const icsFile = {
  name: 'ics-file',
  configureServer(server) {
    server.middlewares.use(`/${EVENT.icsFileName}`, (_req, res) => {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.end(buildIcs())
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: EVENT.icsFileName, source: buildIcs() })
  },
}

// Content Security Policy solo nella build (il server di sviluppo usa script inline).
// GitHub Pages non permette header personalizzati: la policy viaggia in un meta tag.
function securityPolicy(env) {
  let api = "'none'"
  try { api = new URL(env.VITE_RSVP_API_URL).origin } catch { /* URL mancante: nessuna connessione consentita */ }
  const policy = [
    "default-src 'none'",
    `script-src 'self' ${TURNSTILE}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${api}`,
    `frame-src ${TURNSTILE}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
  return {
    name: 'security-policy',
    apply: 'build',
    transformIndexHtml: html => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// In CI (GitHub Actions) la build fallisce se la configurazione pubblica è incompleta o insicura.
function guardConfig(env) {
  if (!process.env.CI) return
  const problems = []
  for (const key of ['VITE_SITE_URL', 'VITE_RSVP_API_URL']) {
    const v = env[key] || ''
    if (!v.startsWith('https://') || /TUO-/i.test(v)) problems.push(`${key} deve essere un indirizzo https reale`)
  }
  if (!env.VITE_TURNSTILE_SITE_KEY || /^[123]x0{20}/.test(env.VITE_TURNSTILE_SITE_KEY)) problems.push('VITE_TURNSTILE_SITE_KEY deve essere la chiave reale, non quella di prova')
  if (problems.length) throw new Error(`Configurazione non valida:\n- ${problems.join('\n- ')}`)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'production') guardConfig(env)
  return {
    // Percorso relativo: funziona su https://utente.github.io/nome-repo/ e su dominio personalizzato.
    base: './',
    plugins: [react(), icsFile, securityPolicy(env)],
    build: { sourcemap: false },
    test: {
      environment: 'jsdom',
      globals: true, // abilita la pulizia automatica di Testing Library tra un test e l'altro
      setupFiles: ['./src/test-setup.js'],
      restoreMocks: true,
    },
  }
})
