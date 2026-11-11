import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Check, LoaderCircle, Minus, Plus } from 'lucide-react'
import { EVENT } from '../config/event.js'
import { dietaryError, nameError, newId, submitRsvp } from '../lib/rsvp.js'
import { getHumanToken } from '../lib/turnstile.js'
import { Sheet } from './ui.jsx'

const emptyGuest = () => ({ name: '', dietary: '' })
export const newDraft = () => ({ id: newId(), attending: null, count: 1, guests: [emptyGuest()], website: '' })

const ERRORS = {
  network: 'Non riusciamo a raggiungere il server. Controlla la connessione e tocca di nuovo «Invia conferma»: i dati inseriti sono ancora qui.',
  server: 'Si è verificato un problema temporaneo. Tocca di nuovo «Invia conferma» tra qualche istante: i dati inseriti sono ancora qui.',
  rate: 'Troppi tentativi ravvicinati. Attendi un minuto e tocca di nuovo «Invia conferma».',
  invalid: 'Alcuni dati non risultano validi. Controlla il riepilogo e riprova.',
  config: 'Le conferme online non sono ancora attive. Contatta direttamente chi ti ha invitato.',
  verify: 'Non siamo riusciti a completare il controllo di sicurezza. Tocca di nuovo «Invia conferma»; se non funziona, prova con un altro browser.',
  full: 'Le conferme online sono chiuse. Contatta direttamente chi ti ha invitato.',
}

const STEP_NUMBERS = {
  yes: { attend: 1, count: 2, names: 3, summary: 4, total: 4 },
  no: { attend: 1, decline: 2, summary: 3, total: 3 },
}

function Field({ id, label, optional, error, showError, ...input }) {
  const errId = `${id}-err`
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional && <span className="optional">(facoltativo)</span>}
      </label>
      <input
        id={id}
        type="text"
        aria-invalid={showError && error ? true : undefined}
        aria-describedby={showError && error ? errId : undefined}
        {...input}
      />
      {showError && error && <p className="field-error" id={errId}>{error}</p>}
    </div>
  )
}

function Nav({ onBack, submit = true }) {
  return (
    <div className="wizard-nav">
      {onBack && (
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.6} /> Indietro
        </button>
      )}
      {submit && <button type="submit" className="btn btn-primary">Continua</button>}
    </div>
  )
}

export default function RsvpWizard({ draft, setDraft, onClose, submit = submitRsvp, humanCheck = getHumanToken }) {
  const uid = useId()
  const [step, setStep] = useState('attend')
  const [showErrors, setShowErrors] = useState(false)
  const [status, setStatus] = useState('idle') // idle | sending | error
  const [error, setError] = useState('')
  const [doneAttending, setDoneAttending] = useState(null)
  const focusOnMount = useCallback(el => el?.focus({ preventScroll: true }), [])
  const humanRef = useRef(null)
  const busy = useRef(false) // blocca doppi tocchi prima del nuovo render

  // Ogni modifica genera un nuovo ID: un nuovo tentativo senza modifiche riusa lo stesso ID (idempotenza).
  const update = patch => setDraft(d => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch), id: newId() }))
  const go = next => { setShowErrors(false); setStatus('idle'); setError(''); setStep(next) }

  const max = EVENT.maxGuests
  const guests = draft.attending ? draft.guests.slice(0, draft.count) : draft.guests.slice(0, 1)

  const setCount = n => update(d => {
    const count = Math.min(max, Math.max(1, n))
    const list = [...d.guests]
    while (list.length < count) list.push(emptyGuest())
    return { count, guests: list }
  })
  const setGuest = (i, field, value) => update(d => ({ guests: d.guests.map((g, j) => (j === i ? { ...g, [field]: value } : g)) }))

  // Porta il focus al primo campo non valido, altrimenti prosegue.
  const check = (checks, next) => e => {
    e.preventDefault()
    const bad = checks.find(c => c.error)
    if (bad) {
      setShowErrors(true)
      document.getElementById(bad.id)?.focus()
      return
    }
    go(next)
  }

  async function send() {
    if (busy.current) return
    busy.current = true
    setStatus('sending')
    setError('')
    const payload = {
      id: draft.id,
      attending: draft.attending,
      guests: draft.attending
        ? guests.map(g => ({ name: g.name, dietary: g.dietary }))
        : [{ name: draft.guests[0].name, dietary: '' }],
      website: draft.website,
    }
    try {
      try {
        payload.token = await humanCheck(humanRef.current)
      } catch {
        throw Object.assign(new Error('verify'), { code: 'verify' })
      }
      await submit(payload)
      setDoneAttending(draft.attending)
      setDraft(newDraft()) // i dati personali non restano in memoria dopo l'invio
      setStatus('idle')
      setStep('done')
    } catch (err) {
      setStatus('error')
      setError(ERRORS[err?.code] || ERRORS.server)
    } finally {
      busy.current = false
    }
  }

  const flow = draft.attending === false ? STEP_NUMBERS.no : STEP_NUMBERS.yes
  const heading = text => (
    <h2 className="sheet-title" tabIndex={-1} ref={focusOnMount} data-autofocus>{text}</h2>
  )

  let body
  if (step === 'attend') {
    body = (
      <>
        {heading('Ci sarai?')}
        <div className="choices">
          <button
            type="button"
            className={`choice${draft.attending === true ? ' is-selected' : ''}`}
            aria-pressed={draft.attending === true}
            onClick={() => { update({ attending: true }); go('count') }}
          >
            Sì, ci sarò!
          </button>
          <button
            type="button"
            className={`choice${draft.attending === false ? ' is-selected' : ''}`}
            aria-pressed={draft.attending === false}
            onClick={() => { update({ attending: false }); go('decline') }}
          >
            Mi dispiace, non potrò esserci
          </button>
        </div>
      </>
    )
  } else if (step === 'count') {
    const atMax = draft.count >= max
    const atMin = draft.count <= 1
    body = (
      <form onSubmit={e => { e.preventDefault(); go('names') }} noValidate>
        {heading('In quanti sarete?')}
        <p className="hint">Includi anche te.</p>
        <div className="stepper">
          <button
            type="button"
            className="stepper-btn"
            aria-label="Una persona in meno"
            aria-disabled={atMin}
            onClick={() => !atMin && setCount(draft.count - 1)}
          >
            <Minus aria-hidden="true" size={28} strokeWidth={1.5} />
          </button>
          <output className="stepper-value" aria-live="polite">
            <span className="stepper-num">{draft.count}</span>
            <span className="stepper-unit">{draft.count === 1 ? 'persona' : 'persone'}</span>
          </output>
          <button
            type="button"
            className="stepper-btn"
            aria-label="Una persona in più"
            aria-disabled={atMax}
            onClick={() => !atMax && setCount(draft.count + 1)}
          >
            <Plus aria-hidden="true" size={28} strokeWidth={1.5} />
          </button>
        </div>
        {atMax && (
          <p className="hint" role="status">
            Si possono indicare al massimo {max} persone per conferma. Se siete di più, invia una seconda conferma per gli altri.
          </p>
        )}
        <Nav onBack={() => go('attend')} />
      </form>
    )
  } else if (step === 'names') {
    const checks = guests.flatMap((g, i) => [
      { id: `${uid}-name-${i}`, error: nameError(g.name) },
      { id: `${uid}-diet-${i}`, error: dietaryError(g.dietary) },
    ])
    body = (
      <form onSubmit={check(checks, 'summary')} noValidate>
        {heading(`Chi festeggerà con ${EVENT.honoree}?`)}
        <p className="hint">
          {draft.count > 1 ? 'Inizia da te. ' : ''}Le esigenze alimentari sono facoltative e servono solo per il menù: le cancelleremo dopo la festa.
        </p>
        {guests.map((g, i) => (
          <fieldset className="person" key={i}>
            <legend>{draft.count > 1 ? `Persona ${i + 1}${i === 0 ? ' (tu)' : ''}` : 'I tuoi dati'}</legend>
            <Field
              id={`${uid}-name-${i}`}
              label="Nome e cognome"
              value={g.name}
              onChange={e => setGuest(i, 'name', e.target.value)}
              autoComplete={i === 0 ? 'name' : 'off'}
              autoCapitalize="words"
              maxLength={80}
              required
              error={nameError(g.name)}
              showError={showErrors}
            />
            <Field
              id={`${uid}-diet-${i}`}
              label="Allergie, intolleranze o esigenze alimentari"
              optional
              placeholder="Es. senza glutine, vegetariano"
              value={g.dietary}
              onChange={e => setGuest(i, 'dietary', e.target.value)}
              autoComplete="off"
              maxLength={200}
              error={dietaryError(g.dietary)}
              showError={showErrors}
            />
          </fieldset>
        ))}
        <Nav onBack={() => go('count')} />
      </form>
    )
  } else if (step === 'decline') {
    const id = `${uid}-name-0`
    body = (
      <form onSubmit={check([{ id, error: nameError(draft.guests[0].name) }], 'summary')} noValidate>
        {heading('Ci dispiace che tu non possa esserci')}
        <p className="hint">Lascia il tuo nome, così {EVENT.honoree} saprà della tua risposta.</p>
        <Field
          id={id}
          label="Nome e cognome"
          value={draft.guests[0].name}
          onChange={e => setGuest(0, 'name', e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={80}
          required
          error={nameError(draft.guests[0].name)}
          showError={showErrors}
        />
        <Nav onBack={() => go('attend')} />
      </form>
    )
  } else if (step === 'summary') {
    const sending = status === 'sending'
    body = (
      <>
        {heading('Riepilogo')}
        <dl className="summary">
          <div className="summary-row">
            <dt>Partecipazione</dt>
            <dd>{draft.attending ? 'Sì, ci sarò' : 'Non potrò esserci'}</dd>
            <button type="button" className="link" onClick={() => go('attend')} disabled={sending}>Modifica</button>
          </div>
          {draft.attending && (
            <div className="summary-row">
              <dt>Numero di persone</dt>
              <dd>{draft.count}</dd>
              <button type="button" className="link" onClick={() => go('count')} disabled={sending}>Modifica</button>
            </div>
          )}
          <div className="summary-row">
            <dt>{draft.attending ? 'Partecipanti' : 'Nome'}</dt>
            <dd>
              <ul className="summary-people">
                {guests.map((g, i) => (
                  <li key={i}>
                    <span className="summary-name">{g.name.trim()}</span>
                    {draft.attending && g.dietary.trim() && (
                      <span className="summary-diet">Esigenze alimentari: {g.dietary.trim()}</span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
            <button type="button" className="link" onClick={() => go(draft.attending ? 'names' : 'decline')} disabled={sending}>Modifica</button>
          </div>
        </dl>

        {/* Campo esca per i bot: invisibile e ignorato da tastiera e lettori di schermo. */}
        <div className="hp" aria-hidden="true">
          <label>
            Sito web
            <input tabIndex={-1} autoComplete="off" value={draft.website} onChange={e => setDraft(d => ({ ...d, website: e.target.value }))} />
          </label>
        </div>

        {/* Controllo anti-bot: di norma invisibile, compare solo se serve un tocco. */}
        <div className="human-check" ref={humanRef} />

        <AnimatePresence>
          {status === 'error' && (
            <motion.p className="alert" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="wizard-nav">
          <button type="button" className="btn btn-ghost" onClick={() => go(draft.attending ? 'names' : 'decline')} disabled={sending}>
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.6} /> Indietro
          </button>
          <motion.button
            type="button"
            className="btn btn-primary"
            onClick={send}
            aria-disabled={sending}
            whileTap={{ scale: 0.97 }}
          >
            {sending
              ? <><LoaderCircle className="spin" aria-hidden="true" size={22} /> Invio in corso</>
              : 'Invia conferma'}
          </motion.button>
        </div>
        <p className="sr-only" aria-live="polite">{sending ? 'Invio in corso' : ''}</p>
      </>
    )
  } else {
    body = (
      <div className="done">
        <motion.div
          className="done-mark"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}
        >
          <Check aria-hidden="true" size={34} strokeWidth={1.5} />
        </motion.div>
        {heading('Grazie! La tua conferma è stata ricevuta.')}
        <p className="done-text">
          {doneAttending
            ? `${EVENT.honoree} sarà felice di festeggiare insieme a te!`
            : `Grazie per avercelo fatto sapere. ${EVENT.honoree} ti ringrazia con affetto.`}
        </p>
        <button type="button" className="btn btn-primary" onClick={onClose}>Torna all'invito</button>
      </div>
    )
  }

  const n = flow[step]
  return (
    <Sheet labelledBy={`${uid}-title`} onClose={onClose} locked={status === 'sending'}>
      <p className="eyebrow" id={`${uid}-title`}>
        Conferma la tua presenza
        {n && <span className="eyebrow-step"> · Passo {n} di {flow.total}</span>}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="wizard-step"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  )
}
