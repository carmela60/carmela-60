import { useId } from 'react'
import { BellRing, Download, ExternalLink } from 'lucide-react'
import { EVENT } from '../config/event.js'
import { googleCalendarUrl } from '../lib/calendar.js'
import { REMINDER, formatTime } from '../lib/time.js'
import { Sheet } from './ui.jsx'

export function detectPlatform(nav = globalThis.navigator) {
  const ua = nav?.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

const reminderDate = new Intl.DateTimeFormat('it-IT', { timeZone: EVENT.timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(REMINDER)

const STEPS = {
  ios: [
    'Tocca «Scarica l\'evento».',
    'Nella schermata che si apre, controlla che tra gli avvisi compaia il promemoria di 15 giorni prima.',
    'Tocca «Aggiungi» per salvarlo nel Calendario.',
  ],
  android: [
    'Tocca «Scarica l\'evento» e apri il file scaricato con l\'app Calendario.',
    'Prima di salvare, controlla che sia presente la notifica di 15 giorni prima.',
    'Se il telefono non apre il file, usa «Google Calendar» qui sotto e aggiungi tu la notifica.',
  ],
  desktop: [
    'Scarica l\'evento e aprilo: verrà proposto al tuo calendario (Apple Calendar, Outlook e altri).',
    'Prima di salvare, controlla che sia presente il promemoria di 15 giorni prima.',
  ],
}

export default function CalendarSheet({ onClose }) {
  const titleId = useId()
  const platform = detectPlatform()

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="sheet-title" tabIndex={-1} data-autofocus>Aggiungi al calendario</h2>
      <p className="note">
        <BellRing aria-hidden="true" size={22} strokeWidth={1.5} />
        <span>
          L'evento contiene un promemoria 15 giorni prima della festa, il {reminderDate} alle {formatTime(REMINDER)}.
        </span>
      </p>
      <ol className="steps">
        {STEPS[platform].map(s => <li key={s}>{s}</li>)}
      </ol>
      <div className="actions-list">
        {/* Nessun attributo download: iOS apre il file direttamente nel Calendario. */}
        <a className="btn btn-primary" href={`./${EVENT.icsFileName}`}>
          <Download aria-hidden="true" size={22} strokeWidth={1.6} /> Scarica l'evento
        </a>
        <a className="btn" href={googleCalendarUrl()} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden="true" size={20} strokeWidth={1.6} /> Google Calendar
        </a>
      </div>
      <p className="hint">
        Con Google Calendar il promemoria non si imposta da solo: dopo aver salvato, aggiungi una notifica 15 giorni prima.
      </p>
    </Sheet>
  )
}
