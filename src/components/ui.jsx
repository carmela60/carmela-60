import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

const EASE = [0.22, 1, 0.36, 1]

// Comparsa morbida quando l'elemento entra nello schermo (una sola volta).
export function Reveal({ as = 'div', delay = 0, children, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export const Sprig = props => (
  <img className="sprig" src="./fiori/sprig.webp" width="370" height="80" alt="" decoding="async" {...props} />
)

// Finestra modale nativa (<dialog>): focus confinato, Esc e ripristino del focus gestiti dal browser.
export function Sheet({ labelledBy, onClose, locked = false, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal?.()
    dialog.querySelector('[data-autofocus]')?.focus({ preventScroll: true })
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev
      if (dialog.open) dialog.close()
    }
  }, [])
  const close = () => { if (!locked) onClose() }

  return (
    <dialog ref={ref} className="sheet-dialog" aria-labelledby={labelledBy} onCancel={e => { e.preventDefault(); close() }}>
      <motion.div className="sheet-backdrop" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
      <motion.div
        className="sheet"
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 48 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <button type="button" className="sheet-close" onClick={close} disabled={locked} aria-label="Chiudi">
          <X aria-hidden="true" size={26} strokeWidth={1.5} />
        </button>
        {children}
      </motion.div>
    </dialog>
  )
}
