import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { EVENT } from '../config/event.js'

const EASE = [0.22, 1, 0.36, 1]
// Ritmo dell'entrata: tempi base moltiplicati per S. Con 1.7 la sequenza dura circa 3,5 secondi.
const S = 1.7
const src = name => `./fiori/${name}.webp`

// Livello anteriore: ritaglio dell'originale posato esattamente sopra il livello di fondo.
// Le coordinate (px dell'invito originale) restano in percentuale, quindi scalano con il gruppo.
function FrontLayer({ name, box, base, style }) {
  const [x, y, w, h] = box
  return (
    <motion.img
      className="layer"
      src={src(name)}
      width={w}
      height={h}
      alt=""
      decoding="async"
      style={{ left: `${(x / base[0]) * 100}%`, top: `${(y / base[1]) * 100}%`, width: `${(w / base[0]) * 100}%`, ...style }}
    />
  )
}

export default function Hero() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const range = [0, 900]
  // Profondità: la ghirlanda scorre più lenta del testo, il bordo inferiore poco meno; le rose
  // Wollerton si staccano di pochi pixel e crescono appena, avanzando sul proprio gruppo.
  const t = {
    garland: useTransform(scrollY, range, [0, 210]),
    roseTopY: useTransform(scrollY, range, [0, -14]),
    roseTopS: useTransform(scrollY, range, [1, 1.06]),
    bed: useTransform(scrollY, range, [0, 60]),
    roseBedY: useTransform(scrollY, range, [0, -12]),
    roseBedS: useTransform(scrollY, range, [1, 1.05]),
    budX: useTransform(scrollY, range, [0, 6]),
    sprig: useTransform(scrollY, range, [0, -24]),
  }
  const p = v => (reduce ? undefined : v)

  return (
    <header className="hero">
      <motion.div className="garland" style={{ y: p(t.garland) }} aria-hidden="true">
        <motion.div
          className="group"
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 * S, ease: EASE }}
        >
          <img className="layer-base" src={src('top-garland')} width="1333" height="430" alt="" fetchPriority="high" />
          <FrontLayer name="rose-top" box={[370, 0, 450, 330]} base={[1333, 430]} style={{ y: p(t.roseTopY), scale: p(t.roseTopS) }} />
        </motion.div>
      </motion.div>

      <div className="hero-text">
        <h1 className="hero-title">
          <motion.span
            className="hero-60"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 * S, ease: EASE, delay: 0.35 * S }}
          >
            60
          </motion.span>
          <motion.span
            className="hero-name"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 * S, ease: EASE, delay: 0.6 * S }}
          >
            <span className="hero-di">di</span>
            <span className="hero-carmela">{EVENT.honoree}</span>
          </motion.span>
        </h1>

        <motion.div style={{ y: p(t.sprig) }}>
          <motion.img
            className="sprig"
            src={src('sprig')}
            width="370"
            height="80"
            alt=""
            initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 0.9 * S, ease: EASE, delay: 0.85 * S }}
          />
        </motion.div>

        <p className="hero-message">
          {EVENT.messageLines.map((line, i) => (
            <motion.span
              key={line}
              className="line"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 * S, ease: EASE, delay: (1.05 + i * 0.15) * S }}
            >
              {line}
            </motion.span>
          ))}
        </p>
      </div>

      <motion.div className="bed" style={{ y: p(t.bed) }} aria-hidden="true">
        <motion.div
          className="group"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.3 * S, ease: EASE, delay: 0.15 * S }}
        >
          <img className="layer-base" src={src('bottom-bed')} width="1333" height="990" alt="" />
          <FrontLayer name="rose-bud" box={[540, 680, 200, 160]} base={[1333, 990]} style={{ x: p(t.budX) }} />
          <FrontLayer name="rose-bottom-center" box={[430, 810, 510, 180]} base={[1333, 990]} style={{ y: p(t.roseBedY), scale: p(t.roseBedS) }} />
          <FrontLayer name="rose-bottom-right" box={[700, 550, 570, 440]} base={[1333, 990]} style={{ y: p(t.roseBedY), scale: p(t.roseBedS) }} />
        </motion.div>
      </motion.div>
    </header>
  )
}
