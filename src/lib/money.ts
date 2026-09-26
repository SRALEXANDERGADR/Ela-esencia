// Formato de dinero igual en todos lados: "RD$1,250.00". (Intl con
// 'es-DO' sale como "DOP 250.00" en muchos Android, y distinto en el
// servidor que en el teléfono.) Recibe centavos.
export function formatMoney(cents: number) {
  const value = (Number(cents) || 0) / 100
  const [whole, decimals] = Math.abs(value).toFixed(2).split('.')
  return `${value < 0 ? '-' : ''}RD$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`
}
