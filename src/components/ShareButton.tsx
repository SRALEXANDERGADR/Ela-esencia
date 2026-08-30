import { useEffect, useRef, useState } from 'react'

/**
 * Botón de compartir para el navbar.
 * - Abre un popover tipo "speech bubble" (con caret apuntando al botón).
 * - Nace visualmente desde el botón (transform-origin) con fade-in + scale-up.
 * - Se cierra con fade-out + scale-down al hacer click afuera, presionar
 *   Escape, o elegir una opción — y recién después de la animación se
 *   desmonta del DOM (no hay "salto" abrupto).
 */

const CLOSE_ANIMATION_MS = 180

type PopoverState = 'closed' | 'open' | 'closing'
type Feedback = 'link' | 'instagram' | null

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.93L2 22l5.31-1.39a9.87 9.87 0 0 0 4.73 1.2h.01c5.46 0 9.9-4.45 9.9-9.9C21.95 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.5.05-1.02.24-3.4-.71-2.87-1.14-4.71-4.07-4.85-4.26-.14-.19-1.16-1.55-1.16-2.96 0-1.4.74-2.09 1-2.38.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.45.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.28.38-.24.63-.14.26.09 1.65.78 1.93.92.29.14.48.21.55.33.07.12.07.7-.16 1.38Z" />
  </svg>
)

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
    <path d="M13.5 21v-7.6h2.6l.4-3H13.5V8.3c0-.87.24-1.46 1.5-1.46h1.6V4.14C16.3 4.1 15.36 4 14.26 4c-2.3 0-3.87 1.4-3.87 3.98v2.42H7.8v3h2.59V21h3.1Z" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<PopoverState>('closed')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cierra en dos tiempos: primero dispara la animación (closing),
  // y solo cuando termina, se desmonta del DOM (closed).
  const requestClose = () => setState((current) => (current === 'open' ? 'closing' : current))

  const toggle = () => setState((current) => (current === 'closed' ? 'open' : current === 'open' ? 'closing' : current))

  useEffect(() => {
    if (state !== 'closing') return
    const timer = setTimeout(() => setState('closed'), CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'open') return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) requestClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const openWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=640')
    requestClose()
  }

  const shareWhatsApp = () => openWindow(`https://wa.me/?text=${encodeURIComponent(`${title} ${shareUrl}`)}`)
  const shareFacebook = () => openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)

  // Instagram no tiene un intent web para compartir un link con texto,
  // así que copiamos el enlace para que el usuario lo pegue en su historia/bio.
  const shareInstagram = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setFeedback('instagram')
      setTimeout(() => setFeedback(null), 1700)
    } catch {
      requestClose()
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setFeedback('link')
      setTimeout(() => {
        setFeedback(null)
        requestClose()
      }, 1000)
    } catch {
      requestClose()
    }
  }

  return (
    <div className="share-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-button share-trigger"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={state === 'open'}
        aria-label="Compartir"
      >
        <ShareIcon />
      </button>

      {state !== 'closed' && (
        <div className={`share-popover ${state}`} role="menu">
          <button type="button" className="share-item" role="menuitem" onClick={shareWhatsApp}>
            <span className="share-icon-badge whatsapp"><WhatsAppIcon /></span>
            WhatsApp
          </button>
          <button type="button" className="share-item" role="menuitem" onClick={shareInstagram}>
            <span className="share-icon-badge instagram"><InstagramIcon /></span>
            {feedback === 'instagram' ? 'Enlace copiado' : 'Instagram'}
          </button>
          <button type="button" className="share-item" role="menuitem" onClick={shareFacebook}>
            <span className="share-icon-badge facebook"><FacebookIcon /></span>
            Facebook
          </button>
          <button type="button" className={`share-item${feedback === 'link' ? ' copied' : ''}`} role="menuitem" onClick={copyLink}>
            <span className="share-icon-badge copy">{feedback === 'link' ? <CheckIcon /> : <LinkIcon />}</span>
            {feedback === 'link' ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      )}
    </div>
  )
}
