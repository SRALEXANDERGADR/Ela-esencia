import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

// ───────────────────────────────────────────────────────────────────────
// BARRA DE LA DEMO (GADR Net) — el mismo archivo en todas las webs que se
// venden en gadrnet.com (con su `gadr-demo.css`). Si lo cambias aquí,
// cópialo igual a las demás.
//
// Solo sale con PLAN = "demo". Arriba queda una barra fija con los 3 planes
// y su precio: al tocar uno, la web se vuelve a abrir en ese plan (?plan=…).
// «Planes» abre los precios, lo que trae cada plan y una tabla para
// comparar. Los precios y las listas salen de /gadr-planes.json de esta
// misma web (el mismo archivo que lee gadrnet.com), así no hay dos copias.
// En la web de un cliente (PLAN fijo) no sale nada.
// ───────────────────────────────────────────────────────────────────────

const IDS = ['basico', 'profesional', 'completo'] as const
type PlanId = (typeof IDS)[number]
const NOMBRES: Record<PlanId, string> = { basico: 'Básico', profesional: 'Profesional', completo: 'Completo' }
const COOKIE = 'gadr_plan'
const GADR = 'https://gadrnet.com'

type PlanInfo = { id: PlanId; nombre: string; mensual: number; entrada: number; recomendado: boolean; lema: string; resumen: string; incluye: string[] }

const esId = (value: unknown): value is PlanId => typeof value === 'string' && (IDS as readonly string[]).includes(value)
const pesos = (value: number) => `RD$${Math.round(value).toLocaleString('en-US')}`

function leerPlanes(json: unknown): PlanInfo[] {
  const lista = Array.isArray((json as { planes?: unknown })?.planes) ? (json as { planes: unknown[] }).planes : []
  const planes: PlanInfo[] = []
  for (const raw of lista) {
    const item = (raw ?? {}) as Record<string, unknown>
    if (!esId(item.id) || planes.some((plan) => plan.id === item.id)) continue
    planes.push({
      id: item.id,
      nombre: typeof item.nombre === 'string' && item.nombre.trim() ? item.nombre.trim() : NOMBRES[item.id],
      mensual: Math.max(0, Number(item.mensual) || 0),
      entrada: Math.max(0, Number(item.entrada) || 0),
      recomendado: item.recomendado === true,
      lema: typeof item.lema === 'string' ? item.lema : '',
      resumen: typeof item.resumen === 'string' ? item.resumen : '',
      incluye: Array.isArray(item.incluye) ? item.incluye.filter((line): line is string => typeof line === 'string' && line.trim() !== '') : [],
    })
  }
  return planes.sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id))
}

/** La misma página, en otro plan (se conservan los demás datos de la dirección). */
function enlacePlan(id: PlanId) {
  if (typeof window === 'undefined') return `?plan=${id}`
  const url = new URL(window.location.href)
  url.searchParams.set('plan', id)
  url.hash = ''
  return url.toString()
}

function Check() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function Marca() {
  return <span className="gd-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
}

export function GadrDemo({ plan, demo, web }: { plan: string; demo: boolean; web: string }) {
  const actual: PlanId = esId(plan) ? plan : 'completo'
  const [planes, setPlanes] = useState<PlanInfo[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Guarda el plan en la cookie (para que siga igual al navegar) y trae los
  // precios. Este componente va antes que la página, así la cookie ya está
  // puesta cuando la página le pide datos al servidor.
  useEffect(() => {
    if (!demo) return
    try {
      const deLaDireccion = new URLSearchParams(window.location.search).get('plan')?.toLowerCase()
      const elegido = esId(deLaDireccion) ? deLaDireccion : actual
      document.cookie = `${COOKIE}=${elegido}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax${window.location.protocol === 'https:' ? '; secure' : ''}`
    } catch { /* sin cookies: el plan se sigue leyendo de la dirección */ }
    document.documentElement.classList.add('gd-on')
    let vivo = true
    fetch('/gadr-planes.json', { cache: 'no-cache' })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error(String(respuesta.status)))))
      .then((json) => { if (vivo) { const lista = leerPlanes(json); setPlanes(lista); setFallo(!lista.length) } })
      .catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false; document.documentElement.classList.remove('gd-on') }
  }, [demo, actual])

  // Con la ventana abierta: la página de atrás no se mueve y Escape la cierra.
  useEffect(() => {
    if (!abierto) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const alTeclear = (event: KeyboardEvent) => { if (event.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alTeclear)
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', alTeclear) }
  }, [abierto])

  if (!demo) return null

  const precio = (id: PlanId) => planes?.find((item) => item.id === id)?.mensual
  const irAPlan = (event: ReactMouseEvent<HTMLAnchorElement>, id: PlanId) => {
    event.preventDefault()
    if (id === actual) { setAbierto(false); return }
    window.location.href = enlacePlan(id)
  }
  const loQuiero = (id: PlanId) => `${GADR}/?solicitar=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.host)}&plan=${id}`

  // Lo que trae cada plan además del anterior (las listas del JSON son completas).
  const nuevos = (indice: number) => {
    const lista = planes ?? []
    const plan = lista[indice]
    const anterior = lista[indice - 1]
    if (!plan) return { base: '', items: [] as string[] }
    if (!anterior || !anterior.incluye.every((line) => plan.incluye.includes(line))) return { base: '', items: plan.incluye }
    return { base: anterior.nombre, items: plan.incluye.filter((line) => !anterior.incluye.includes(line)) }
  }
  const todas = (planes ?? []).reduce<string[]>((lista, item) => { for (const line of item.incluye) if (!lista.includes(line)) lista.push(line); return lista }, [])

  return <>
    <div className="gd-bar" role="region" aria-label={`Demo de ${web}`}>
      <div className="gd-bar-in">
        <a className="gd-brand" href={GADR} target="_blank" rel="noopener noreferrer" title="Demo hecha por GADR Net">
          <Marca />
          <span className="gd-brand-txt"><small>Demo en vivo</small><b>{web}</b></span>
        </a>
        <nav className="gd-seg" aria-label="Plan de la demo">
          {IDS.map((id) => {
            const valor = precio(id)
            return <a key={id} href={`?plan=${id}`} onClick={(event) => irAPlan(event, id)} aria-current={id === actual ? 'true' : undefined}>
              <b>{NOMBRES[id]}</b>
              <small>{valor !== undefined ? `${pesos(valor)}/mes` : ' '}</small>
            </a>
          })}
        </nav>
        <button type="button" className="gd-cta" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-expanded={abierto}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.8" /><rect x="13.5" y="4" width="7" height="7" rx="1.8" /><rect x="3.5" y="14" width="7" height="7" rx="1.8" /><rect x="13.5" y="14" width="7" height="7" rx="1.8" /></svg>
          <span>Planes</span>
        </button>
      </div>
    </div>
    <div className="gd-spacer" aria-hidden="true" />

    {abierto && <div className="gd-overlay" onClick={(event) => { if (event.target === event.currentTarget) setAbierto(false) }}>
      <section className="gd-sheet" role="dialog" aria-modal="true" aria-labelledby="gd-title">
        <span className="gd-grip" aria-hidden="true" />
        <header className="gd-head">
          <div>
            <small className="gd-kicker">Planes · {web}</small>
            <h2 id="gd-title">Elige cómo quieres tu web</h2>
            <p>Es la misma web en los tres planes. Toca «Probar» y mírala al momento con lo que trae cada uno.</p>
          </div>
          <button ref={cerrarRef} type="button" className="gd-close" onClick={() => setAbierto(false)} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </header>

        {!planes && !fallo && <p className="gd-note">Cargando los planes…</p>}
        {fallo && <p className="gd-note">No se pudieron cargar los precios. Míralos en <a href={GADR} target="_blank" rel="noopener noreferrer">gadrnet.com</a>.</p>}

        {planes && planes.length > 0 && <>
          <div className="gd-cards">
            {planes.map((item, indice) => {
              const { base, items } = nuevos(indice)
              const esActual = item.id === actual
              return <article key={item.id} className={`gd-card${item.recomendado ? ' is-reco' : ''}${esActual ? ' is-now' : ''}`}>
                {item.recomendado && <div className="gd-card-tags"><span className="gd-pill is-accent">Más elegido</span></div>}
                <h3>{item.nombre}</h3>
                {item.lema && <p className="gd-lema">{item.lema}</p>}
                <div className="gd-price"><strong>{pesos(item.mensual)}</strong><span>/mes</span></div>
                <p className="gd-entry">Entrada única: <b>{pesos(item.entrada)}</b></p>
                {item.resumen && <p className="gd-summary">{item.resumen}</p>}
                <div className="gd-list">
                  {base && <p className="gd-base">Todo lo del plan {base}, y además:</p>}
                  <ul>{items.map((line) => <li key={line}><Check />{line}</li>)}</ul>
                </div>
                <div className="gd-actions">
                  <a className={`gd-btn${esActual ? ' is-ghost' : ' is-light'}`} href={`?plan=${item.id}`} onClick={(event) => irAPlan(event, item.id)} aria-disabled={esActual || undefined}>{esActual ? 'Lo estás viendo' : `Probar ${item.nombre}`}</a>
                  <a className="gd-btn is-accent" href={loQuiero(item.id)} target="_blank" rel="noopener noreferrer">Lo quiero</a>
                </div>
              </article>
            })}
          </div>

          {todas.length > 0 && <section className="gd-compare" aria-labelledby="gd-compare-title">
            <h3 id="gd-compare-title">Compara los tres planes</h3>
            <div className="gd-table" role="table">
              <div className="gd-row is-head" role="row">
                <span role="columnheader">Lo que trae</span>
                {planes.map((item) => <span key={item.id} role="columnheader" className={item.id === actual ? 'is-now' : ''}><b>{item.nombre}</b><small>{pesos(item.mensual)}</small></span>)}
              </div>
              {todas.map((line) => <div key={line} className="gd-row" role="row">
                <span role="cell">{line}</span>
                {planes.map((item) => <span key={item.id} role="cell" className={item.id === actual ? 'is-now' : ''}>{item.incluye.includes(line) ? <i className="gd-yes" aria-label="Sí"><Check /></i> : <i className="gd-no" aria-label="No">—</i>}</span>)}
              </div>)}
            </div>
          </section>}
        </>}

        <footer className="gd-foot">
          <Marca /><span>Diseño y desarrollo: <a href={GADR} target="_blank" rel="noopener noreferrer">GADR Net · gadrnet.com</a></span>
        </footer>
      </section>
    </div>}
  </>
}
