import { useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useMotionValueEvent, useScroll } from 'motion/react'
import { CalendarPlus, Navigation } from 'lucide-react'
import { EVENT, FULL_ADDRESS } from './config/event.js'
import { directionsUrl } from './lib/calendar.js'
import { formatLongDate, formatTime } from './lib/time.js'
import Hero from './components/Hero.jsx'
import Countdown from './components/Countdown.jsx'
import CalendarSheet from './components/CalendarSheet.jsx'
import RsvpWizard, { newDraft } from './components/RsvpWizard.jsx'
import { Reveal, Sprig } from './components/ui.jsx'

export default function App() {
  const [rsvpOpen, setRsvpOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // La bozza vive qui: chiudere e riaprire il wizard non perde i dati (solo in memoria).
  const [draft, setDraft] = useState(newDraft)
  const ctaRef = useRef(null)
  const ctaVisible = useInView(ctaRef)
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', y => setScrolled(y > 160))

  return (
    <>
      <main>
        <Hero />

        <section className="section" aria-labelledby="quando">
          <Reveal as="p" className="lead" id="quando">
            {EVENT.invitationLines.map(l => <span className="line" key={l}>{l}</span>)}
          </Reveal>
          <Countdown />
        </section>

        <section className="section details" aria-label="Dettagli della festa">
          <Reveal className="details-when">
            <p className="caps">{formatLongDate()}</p>
            <p className="details-time">Ore {formatTime()}</p>
          </Reveal>
          <Reveal><Sprig /></Reveal>
          <Reveal className="details-where">
            <p className="caps caps-small">Presso</p>
            <p className="caps venue">{EVENT.venue}</p>
            <p className="italic">({EVENT.city}, {EVENT.province})</p>
            <p className="address">{FULL_ADDRESS}</p>
          </Reveal>
        </section>

        <section className="section actions" aria-label="Azioni">
          <Reveal className="actions-list">
            <motion.button
              ref={ctaRef}
              type="button"
              className="btn btn-primary"
              onClick={() => setRsvpOpen(true)}
              whileTap={{ scale: 0.97 }}
            >
              Conferma la tua presenza
            </motion.button>
            <motion.button type="button" className="btn" onClick={() => setCalendarOpen(true)} whileTap={{ scale: 0.97 }}>
              <CalendarPlus aria-hidden="true" size={22} strokeWidth={1.6} /> Aggiungi al calendario
            </motion.button>
            <motion.a className="btn" href={directionsUrl()} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.97 }}>
              <Navigation aria-hidden="true" size={21} strokeWidth={1.6} /> Ricevi indicazioni
            </motion.a>
          </Reveal>
        </section>
      </main>

      <footer className="footer">
        <Sprig />
        <p className="footer-sign">Con affetto, {EVENT.honoree}</p>
      </footer>

      <AnimatePresence>
        {scrolled && !ctaVisible && !rsvpOpen && !calendarOpen && (
          <motion.div
            className="sticky-cta"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <button type="button" className="btn btn-primary" onClick={() => setRsvpOpen(true)}>
              Conferma la tua presenza
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rsvpOpen && <RsvpWizard draft={draft} setDraft={setDraft} onClose={() => setRsvpOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {calendarOpen && <CalendarSheet onClose={() => setCalendarOpen(false)} />}
      </AnimatePresence>
    </>
  )
}
