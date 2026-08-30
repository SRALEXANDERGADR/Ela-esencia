/**
 * Ilustraciones decorativas originales de ramitas/ramos con hojas, en
 * el estilo dorado/beige de ELA. Son arte propio (curvas dibujadas a
 * mano), no una copia de ninguna imagen de referencia — solo se
 * inspiran en la idea general de "matas" doradas minimalistas que
 * decoran los costados de la página. Este archivo exporta dos
 * especies distintas para usarlas en pareja a cada lado de la página
 * (ver Storefront.tsx y bg-leaf* en styles.css):
 * - LeafBranch: la ramita esbelta original, solo hojas.
 * - LeafBloom: un ramo más lleno con flores y detalle "mosaico"
 *   (puntitos en un dorado más vivo, --gold-vivid) para dar variedad.
 */

const LEAVES = [
  { y: 760, x: 58, rotate: -35, scale: 1.15 },
  { y: 690, x: 55, rotate: 40, scale: 1.05 },
  { y: 610, x: 60, rotate: -42, scale: 1.0 },
  { y: 530, x: 53, rotate: 38, scale: 0.95 },
  { y: 450, x: 52, rotate: -36, scale: 0.9 },
  { y: 370, x: 50, rotate: 42, scale: 0.85 },
  { y: 290, x: 46, rotate: -34, scale: 0.78 },
  { y: 210, x: 50, rotate: 40, scale: 0.7 },
  { y: 130, x: 55, rotate: -30, scale: 0.6 },
  { y: 60, x: 47, rotate: 36, scale: 0.5 },
]

const LEAF_PATH = 'M0 0C11 -5 19 -19 9 -36C0 -44 -8 -30 -6 -14C-5 -6 -3 -1 0 0Z'

export function LeafBranch() {
  return (
    <svg viewBox="0 0 120 820" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M60 800C54 650 66 520 52 380C40 260 58 140 46 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity=".85"
      />
      {LEAVES.map((leaf, index) => (
        <path
          key={index}
          d={LEAF_PATH}
          fill="currentColor"
          opacity={0.5 + (index % 3) * 0.08}
          transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotate}) scale(${leaf.scale})`}
        />
      ))}
    </svg>
  )
}

/**
 * Segunda especie decorativa: un ramo más lleno, con flores (no solo
 * hojas) y pequeños detalles "mosaico" (puntitos), en un dorado más
 * vivo (--gold-vivid) que contrasta con la ramita esbelta de
 * LeafBranch — igual que en la referencia de Instagram, donde cada
 * costado de la página tiene un tipo de planta distinto pero de la
 * misma familia de color.
 */

const BLOOM_PETAL = 'M0 0C6 -6 6 -16 0 -20C-6 -16 -6 -6 0 0Z'

function Flower({ x, y, scale = 1, rotate = 0 }: { x: number; y: number; scale?: number; rotate?: number }) {
  const petals = [0, 72, 144, 216, 288]
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={0.85}>
      {petals.map((angle) => (
        <path key={angle} d={BLOOM_PETAL} fill="currentColor" opacity={0.75} transform={`rotate(${angle})`} />
      ))}
      <circle r="4.5" fill="var(--gold-vivid)" />
    </g>
  )
}

const BLOOM_LEAVES = [
  { y: 780, x: 56, rotate: -32, scale: 1.1 },
  { y: 700, x: 60, rotate: 44, scale: 1 },
  { y: 560, x: 50, rotate: -40, scale: 0.9 },
  { y: 420, x: 62, rotate: 36, scale: 0.82 },
  { y: 280, x: 48, rotate: -30, scale: 0.7 },
  { y: 150, x: 58, rotate: 38, scale: 0.58 },
]

const FLOWERS = [
  { x: 58, y: 640, scale: 1.1, rotate: 8 },
  { x: 46, y: 350, scale: 0.85, rotate: -14 },
  { x: 60, y: 90, scale: 0.65, rotate: 20 },
]

// Puntitos tipo mosaico intercalados entre las hojas, alternando el
// dorado base y el dorado más vivo, para el detalle "mosaico" pedido.
const MOSAIC_DOTS = [
  { x: 40, y: 730, r: 3.2, vivid: true },
  { x: 70, y: 665, r: 2.4, vivid: false },
  { x: 34, y: 480, r: 2.8, vivid: true },
  { x: 68, y: 500, r: 2, vivid: false },
  { x: 42, y: 240, r: 2.6, vivid: true },
  { x: 66, y: 200, r: 2, vivid: false },
  { x: 50, y: 45, r: 2.4, vivid: true },
]

export function LeafBloom() {
  return (
    <svg viewBox="0 0 120 820" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M58 800C64 660 44 540 60 400C74 270 50 150 62 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity=".85"
      />
      {BLOOM_LEAVES.map((leaf, index) => (
        <path
          key={index}
          d={LEAF_PATH}
          fill="currentColor"
          opacity={0.45 + (index % 3) * 0.08}
          transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotate}) scale(${leaf.scale})`}
        />
      ))}
      {FLOWERS.map((flower, index) => (
        <Flower key={index} {...flower} />
      ))}
      {MOSAIC_DOTS.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.vivid ? 'var(--gold-vivid)' : 'currentColor'} opacity={dot.vivid ? 0.9 : 0.55} />
      ))}
    </svg>
  )
}

/**
 * Tercera especie decorativa: una "ramita" mucho más liviana, casi
 * sin hojas, que en cambio va cargada de florecitas sueltas de
 * distintos tamaños — para que no todos los bloques de la página
 * repitan la misma silueta de LeafBranch/LeafBloom y haya variedad
 * real ("flores... en el fondo") al recorrer la tienda de arriba a
 * abajo.
 */

const SPRAY_LEAVES = [
  { y: 620, x: 62, rotate: -30, scale: 0.75 },
  { y: 430, x: 46, rotate: 34, scale: 0.65 },
  { y: 230, x: 60, rotate: -28, scale: 0.55 },
]

const SPRAY_FLOWERS = [
  { x: 56, y: 90, scale: 1.05, rotate: -10 },
  { x: 38, y: 260, scale: 0.7, rotate: 18 },
  { x: 66, y: 380, scale: 0.9, rotate: -16 },
  { x: 42, y: 540, scale: 0.6, rotate: 12 },
  { x: 60, y: 700, scale: 0.8, rotate: -6 },
]

const SPRAY_DOTS = [
  { x: 46, y: 150, r: 2.6, vivid: true },
  { x: 66, y: 320, r: 2.2, vivid: false },
  { x: 40, y: 460, r: 2.4, vivid: true },
  { x: 60, y: 630, r: 2, vivid: false },
]

export function LeafSpray() {
  return (
    <svg viewBox="0 0 120 780" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M56 20C46 140 68 230 48 350C30 470 62 560 44 680C34 730 50 750 46 770"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity=".7"
      />
      {SPRAY_LEAVES.map((leaf, index) => (
        <path
          key={index}
          d={LEAF_PATH}
          fill="currentColor"
          opacity={0.4 + (index % 3) * 0.08}
          transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotate}) scale(${leaf.scale})`}
        />
      ))}
      {SPRAY_FLOWERS.map((flower, index) => (
        <Flower key={index} {...flower} />
      ))}
      {SPRAY_DOTS.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.vivid ? 'var(--gold-vivid)' : 'currentColor'} opacity={dot.vivid ? 0.85 : 0.5} />
      ))}
    </svg>
  )
}
