/**
 * Ilustración decorativa original de una ramita con hojas, en el
 * estilo dorado/beige de ELA. Es arte propio (curvas dibujadas a
 * mano), no una copia de ninguna imagen de referencia — solo se
 * inspira en la idea general de "matas" doradas minimalistas que
 * decoran los costados de la página.
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
