import { EVENT, LOCATION } from '../config/event.js'
import { START, wallParts } from './time.js'

// Testo ICS (RFC 5545 §3.3.11): \ ; , e a capo vanno protetti.
export const icsEscape = s => String(s)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Righe di massimo 75 ottetti UTF-8, continuazioni con CRLF + spazio (RFC 5545 §3.1).
export function foldLine(line) {
  const enc = new TextEncoder()
  let out = ''
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (bytes + b > limit) {
      out += cur + '\r\n '
      cur = ''
      bytes = 0
      limit = 74 // lo spazio iniziale conta come ottetto
    }
    cur += ch
    bytes += b
  }
  return out + cur
}

const local = d => { const p = wallParts(d); return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}` }
const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// ponytail: regole fisse per Europe/Rome (CET/CEST, valide dal 1996); va cambiato solo se cambia fuso.
const VTIMEZONE_ROME = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
]

export function buildIcs(now = new Date(), event = EVENT) {
  const tz = event.timeZone
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//60 di Carmela//Invito digitale//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE_ROME,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART;TZID=${tz}:${local(START)}`,
    // Senza durata nota non inventiamo una fine: per RFC 5545 l'evento termina all'orario di inizio.
    ...(event.durationMinutes ? [`DURATION:PT${event.durationMinutes}M`] : []),
    `SUMMARY:${icsEscape(event.calendarTitle)}`,
    `DESCRIPTION:${icsEscape(event.message)}`,
    `LOCATION:${icsEscape(LOCATION)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-P${event.reminderDaysBefore}D`,
    `DESCRIPTION:${icsEscape(event.reminderText)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// Google Calendar: il link precompila l'evento ma NON può impostare promemoria personalizzati.
export function googleCalendarUrl(event = EVENT) {
  const startLocal = local(START)
  const end = new Date(START.getTime() + (event.durationMinutes || 0) * 60000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.calendarTitle,
    dates: `${startLocal}/${local(end)}`,
    ctz: event.timeZone,
    details: event.message,
    location: LOCATION,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

// Google Maps URLs (nessuna API key): apre l'app se installata, altrimenti il browser.
export function directionsUrl(event = EVENT) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${event.venue}, ${event.street}, ${event.postalCode} ${event.city} ${event.province}, ${event.country}`,
    travelmode: 'driving',
  })
  if (event.mapsPlaceId) params.set('destination_place_id', event.mapsPlaceId)
  return `https://www.google.com/maps/dir/?${params}`
}
