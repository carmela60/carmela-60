import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/cormorant-garamond/latin-400-italic.css'
import '@fontsource/cormorant-garamond/latin-500-italic.css'
import '@fontsource/pinyon-script/latin-400.css'
import './styles.css'
import App from './App.jsx'

// Protezione da clickjacking: GitHub Pages non consente l'header frame-ancestors,
// quindi dentro un iframe di un altro sito l'invito non viene mostrato.
const framed = (() => { try { return window.top !== window.self } catch { return true } })()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {framed ? (
      <p className="noscript">
        <a href={window.location.href} target="_top" rel="noopener noreferrer">Apri l'invito di Carmela</a>
      </p>
    ) : (
      /* Con "riduci movimento" attivo restano solo le dissolvenze. */
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    )}
  </StrictMode>,
)
