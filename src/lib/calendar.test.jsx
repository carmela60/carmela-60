import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { buildIcs, directionsUrl, foldLine, googleCalendarUrl, icsEscape } from './calendar.js'
import { EVENT } from '../config/event.js'
import { detectPlatform } from '../components/CalendarSheet.jsx'
import CalendarSheet from '../components/CalendarSheet.jsx'

const NOW = new Date('2026-11-08T10:00:00Z')
const unfold = ics => ics.replace(/\r\n /g, '')
const props = ics => unfold(ics).split('\r\n').filter(Boolean)

describe('file ICS', () => {
  const ics = buildIcs(NOW)

  it('usa CRLF e termina con CRLF', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('contiene tutti i componenti e le proprietà richieste', () => {
    const lines = props(ics)
    for (const required of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'END:VEVENT', 'BEGIN:VALARM', 'END:VALARM', 'END:VCALENDAR', 'BEGIN:VTIMEZONE']) {
      expect(lines).toContain(required)
    }
    expect(lines).toContain(`UID:${EVENT.uid}`)
    expect(lines).toContain('DTSTAMP:20261108T100000Z')
    expect(lines).toContain('DTSTART;TZID=Europe/Rome:20270103T130000')
    expect(lines).toContain('SUMMARY:60° compleanno di Carmela')
    expect(lines).toContain('DESCRIPTION:Un giorno importante\\, una gioia ancora più grande se condivisa con te.')
    expect(lines).toContain("LOCATION:Villa Sirena\\, Viale Sant'Alfonso 30\\, 82015 Durazzano (BN)")
  })

  it('include il promemoria a 15 giorni come VALARM DISPLAY', () => {
    const lines = props(ics)
    const alarm = lines.slice(lines.indexOf('BEGIN:VALARM'), lines.indexOf('END:VALARM') + 1)
    expect(alarm).toEqual([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P15D',
      'DESCRIPTION:Tra 15 giorni festeggiamo i 60 anni di Carmela!',
      'END:VALARM',
    ])
    // il VALARM sta dentro il VEVENT
    expect(lines.indexOf('BEGIN:VALARM')).toBeGreaterThan(lines.indexOf('BEGIN:VEVENT'))
    expect(lines.indexOf('END:VALARM')).toBeLessThan(lines.indexOf('END:VEVENT'))
  })

  it('l\'UID è stabile tra generazioni diverse', () => {
    const uid = s => props(s).find(l => l.startsWith('UID:'))
    expect(uid(buildIcs(new Date()))).toBe(uid(ics))
  })

  it('nessuna riga supera 75 ottetti UTF-8', () => {
    const enc = new TextEncoder()
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75)
  })

  it('senza durata definita non inventa una fine; con durata usa DURATION', () => {
    expect(ics).not.toMatch(/DTEND|DURATION/)
    expect(props(buildIcs(NOW, { ...EVENT, durationMinutes: 300 }))).toContain('DURATION:PT300M')
  })
})

describe('escaping e folding', () => {
  it('protegge i caratteri speciali', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('non spezza i caratteri multibyte e si ricompone identico', () => {
    const line = 'DESCRIPTION:' + 'più è ° '.repeat(30)
    const folded = foldLine(line)
    expect(folded).toContain('\r\n ')
    expect(unfold(folded)).toBe(line)
    expect(folded).not.toMatch(/�/)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
  })
})

describe('link esterni', () => {
  it('Google Maps apre le indicazioni verso l\'indirizzo verificato, non una ricerca generica', () => {
    const url = new URL(directionsUrl())
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('destination')).toBe("Villa Sirena, Viale Sant'Alfonso 30, 82015 Durazzano BN, Italia")
    expect(url.searchParams.has('query')).toBe(false)
    expect(url.searchParams.has('destination_place_id')).toBe(false)
    expect(new URL(directionsUrl({ ...EVENT, mapsPlaceId: 'ChIJtest' })).searchParams.get('destination_place_id')).toBe('ChIJtest')
  })

  it('Google Calendar riceve data, ora e fuso corretti', () => {
    const url = new URL(googleCalendarUrl())
    expect(url.searchParams.get('dates')).toBe('20270103T130000/20270103T130000')
    expect(url.searchParams.get('ctz')).toBe('Europe/Rome')
    expect(url.searchParams.get('text')).toBe('60° compleanno di Carmela')
  })
})

describe('calendario sui dispositivi', () => {
  const ua = s => ({ userAgent: s, maxTouchPoints: 0 })
  it('riconosce iPhone, iPad, Android e computer', () => {
    expect(detectPlatform(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari'))).toBe('ios')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 5 })).toBe('ios')
    expect(detectPlatform(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile'))).toBe('android')
    expect(detectPlatform(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'))).toBe('desktop')
  })

  it('il pulsante apre il file .ics senza forzare il download e non promette promemoria su Google', () => {
    render(<CalendarSheet onClose={() => {}} />)
    const ics = screen.getByRole('link', { name: /scarica l'evento/i })
    expect(ics.getAttribute('href')).toBe('./60-di-carmela.ics')
    expect(ics.hasAttribute('download')).toBe(false)
    expect(screen.getByText(/19 dicembre 2026 alle 13:00/)).toBeTruthy()
    expect(screen.getByText(/il promemoria non si imposta da solo/i)).toBeTruthy()
  })
})
