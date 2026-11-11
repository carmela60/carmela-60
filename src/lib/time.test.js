import { describe, expect, it } from 'vitest'
import { START, REMINDER, countdown, formatLongDate, formatTime, wallParts } from './time.js'

describe('data dell\'evento', () => {
  it('3 gennaio 2027 alle 13:00 a Roma corrisponde alle 12:00 UTC', () => {
    expect(START.toISOString()).toBe('2027-01-03T12:00:00.000Z')
    expect(wallParts(START)).toMatchObject({ year: '2027', month: '01', day: '03', hour: '13', minute: '00' })
  })

  it('è domenica e si legge in italiano', () => {
    expect(formatLongDate()).toBe('Domenica 3 gennaio 2027')
    expect(formatTime()).toBe('13:00')
  })

  it('il promemoria cade il 19 dicembre 2026 alle 13:00 ora di Roma', () => {
    expect(wallParts(REMINDER)).toMatchObject({ year: '2026', month: '12', day: '19', hour: '13', minute: '00' })
  })
})

describe('countdown', () => {
  it('calcola giorni, ore, minuti e secondi rispetto al fuso Europe/Rome', () => {
    // 1 gennaio 2027, 10:30:15 a Roma = 09:30:15 UTC
    const c = countdown(new Date('2027-01-01T09:30:15Z'))
    expect(c).toEqual({ phase: 'upcoming', days: 2, hours: 2, minutes: 29, seconds: 45 })
  })

  it('è indipendente dal fuso del dispositivo (stesso istante, stesso risultato)', () => {
    const a = countdown(new Date('2026-12-31T23:00:00-05:00'))
    const b = countdown(new Date('2027-01-01T04:00:00Z'))
    expect(a).toEqual(b)
  })

  it('a evento iniziato non mostra numeri negativi', () => {
    const today = countdown(new Date('2027-01-03T15:00:00Z'))
    expect(today.phase).toBe('today')
    const past = countdown(new Date('2027-01-05T10:00:00Z'))
    expect(past).toEqual({ phase: 'past', days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('un secondo prima dell\'inizio mostra 1 secondo', () => {
    expect(countdown(new Date('2027-01-03T11:59:59Z'))).toMatchObject({ phase: 'upcoming', days: 0, hours: 0, minutes: 0, seconds: 1 })
  })
})
