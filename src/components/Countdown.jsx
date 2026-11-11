import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EVENT } from '../config/event.js'
import { countdown } from '../lib/time.js'
import { Reveal } from './ui.jsx'

const UNITS = [
  ['days', 'giorni', 'giorno'],
  ['hours', 'ore', 'ora'],
  ['minutes', 'minuti', 'minuto'],
  ['seconds', 'secondi', 'secondo'],
]

export default function Countdown() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const c = countdown(now)

  if (c.phase !== 'upcoming') {
    return (
      <Reveal as="p" className="countdown-done">
        {c.phase === 'today' ? 'È arrivato il giorno della festa!' : `Grazie per aver festeggiato con ${EVENT.honoree}.`}
      </Reveal>
    )
  }

  return (
    <Reveal className="countdown">
      <p className="countdown-label">Mancano</p>
      <div
        className="countdown-grid"
        role="timer"
        aria-label={`Mancano ${c.days} giorni, ${c.hours} ore e ${c.minutes} minuti`}
      >
        {UNITS.map(([key, plural, singular]) => {
          const value = key === 'days' ? String(c[key]) : String(c[key]).padStart(2, '0')
          return (
            <div className="countdown-unit" key={key} aria-hidden="true">
              <span className="countdown-num">
                {/* Le cifre uscente ed entrante si sovrappongono via CSS: nessuno stile inline, compatibile con la CSP. */}
                <AnimatePresence initial={false}>
                  <motion.span
                    key={value}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.35 }}
                  >
                    {value}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="countdown-unit-label">{c[key] === 1 ? singular : plural}</span>
            </div>
          )
        })}
      </div>
    </Reveal>
  )
}
