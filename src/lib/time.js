import { EVENT } from '../config/event.js'

export const START = new Date(EVENT.start)
export const REMINDER = new Date(START.getTime() - EVENT.reminderDaysBefore * 86400000)

// Parti di data/ora "da muro" nel fuso dell'evento, indipendenti dal fuso del dispositivo.
export function wallParts(date, timeZone = EVENT.timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// "Domenica 3 gennaio 2027"
export function formatLongDate(date = START) {
  return cap(new Intl.DateTimeFormat('it-IT', {
    timeZone: EVENT.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date))
}

// "13:00"
export function formatTime(date = START) {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: EVENT.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

// Stato del conto alla rovescia: mai valori negativi.
export function countdown(now, target = START) {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) {
    const sameDay = ['year', 'month', 'day'].every(k => wallParts(now)[k] === wallParts(target)[k])
    return { phase: sameDay ? 'today' : 'past', days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  const s = Math.floor(ms / 1000)
  return {
    phase: 'upcoming',
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}
