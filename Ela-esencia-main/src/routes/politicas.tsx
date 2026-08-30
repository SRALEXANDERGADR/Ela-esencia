import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/politicas')({ component: Policies })

function Policies() {
  return (
    <main className="policies-page">
      <Link to="/" className="back-link"><ArrowLeft /> Volver a la tienda</Link>
      <div className="policies-title">
        <span>ELA · INFORMACIÓN LEGAL</span>
        <h1>Políticas claras,<br />relaciones tranquilas.</h1>
        <p>Última actualización: 28 de agosto de 2026</p>
      </div>
      <div className="policy-grid">
        <article>
          <span>01</span>
          <h2>Privacidad</h2>
          <p>Usamos tus datos únicamente para gestionar tus pedidos, citas y comunicaciones relacionadas con tu compra o servicio. No vendemos ni compartimos tu información con terceros ajenos a la operación.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Citas y servicios</h2>
          <p>Al agendar una cita recibes un número de confirmación. Te contactaremos por WhatsApp para confirmar horario y disponibilidad. Si necesitas reprogramar, avísanos con al menos 24 horas de anticipación.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Pedidos y pagos</h2>
          <p>Al enviar el checkout recibes un número de pedido. Nuestro equipo confirma disponibilidad, método de pago y entrega por WhatsApp antes de procesar la compra. Aceptamos abonos parciales cuando aplique.</p>
        </article>
        <article>
          <span>04</span>
          <h2>Cambios y devoluciones</h2>
          <p>Aceptamos solicitudes dentro de los 7 días posteriores a la entrega para productos sin abrir y en su empaque original. Si recibes un producto dañado, contáctanos con fotografías.</p>
        </article>
        <article>
          <span>05</span>
          <h2>Contacto</h2>
          <p>Para consultas sobre privacidad, pedidos, citas o devoluciones, utiliza el botón de WhatsApp de la tienda. Respondemos de lunes a sábado, previa cita.</p>
        </article>
      </div>
    </main>
  )
}
