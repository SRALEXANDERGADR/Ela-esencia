import { useEffect, useState } from 'react'
import { COOKIE_PLAN, NOMBRE_PLAN, PLANES, esPlan, type Plan } from '@/lib/plan'

/** Barrita pequeña de la DEMO (nunca sale en la web de un cliente):
 *  «Demo · Plan Básico · Cambiar plan · Ver precios».
 *  Al escoger otro plan se vuelve a cargar la página con ?plan=… y el
 *  plan queda guardado 30 días en la cookie «gadr_plan». */
export function PlanBar({ plan, demo }: { plan: Plan; demo: boolean }) {
  const [open, setOpen] = useState(false)

  // Guarda en la cookie el plan de la dirección (?plan=…), para que siga en
  // ese plan al navegar. El servidor ya leyó la dirección, así que la página
  // sale bien desde el principio, sin parpadeo.
  useEffect(() => {
    if (!demo) return
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('plan')?.toLowerCase()
      const chosen = esPlan(fromUrl) ? fromUrl : plan
      document.cookie = `${COOKIE_PLAN}=${chosen}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax${window.location.protocol === 'https:' ? '; secure' : ''}`
    } catch { /* sin cookies: el plan se sigue leyendo de la dirección */ }
  }, [demo, plan])

  if (!demo) return null

  const choose = (next: Plan) => {
    const url = new URL(window.location.href)
    url.searchParams.set('plan', next)
    window.location.href = url.toString()
  }

  return <div className="plan-bar" role="region" aria-label="Plan de la demo">
    {open && <div className="plan-bar-options">
      {PLANES.map((item) => <button key={item} type="button" className={item === plan ? 'active' : ''} onClick={() => choose(item)}>{NOMBRE_PLAN[item]}</button>)}
    </div>}
    <div className="plan-bar-row">
      <span>Demo · Plan {NOMBRE_PLAN[plan]}</span>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>Cambiar plan</button>
      <a href="https://gadrnet.com" target="_blank" rel="noopener noreferrer">Ver precios</a>
    </div>
  </div>
}
