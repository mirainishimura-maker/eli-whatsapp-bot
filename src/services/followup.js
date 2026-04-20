const { obtenerLeadsFrios, actualizarUltimaActividad } = require("./airtable");
const { enviarMensaje } = require("./evolution");
const { derivarLeadAAsistente } = require("./routing");

// Corre cada 15 minutos. La ventana de leads fríos es 60–90 min,
// así que cada lead recibe exactamente un seguimiento automático.
const INTERVALO_MS = 15 * 60 * 1000;

/**
 * Construye el mensaje de seguimiento que Eli envía al lead.
 * Tono: vendedora que genuinamente le importa la salud mental del usuario.
 */
function construirMensajeSeguimiento(nombreCompleto) {
  const nombre = nombreCompleto ? nombreCompleto.split(" ")[0] : null;
  const saludo = nombre ? `Hola ${nombre}` : "Hola";

  return (
    `${saludo} 🩵 Soy Eli de Ítaca Conversemos.\n\n` +
    `Hace un rato estuvimos conversando y me quedé pensando en ti. ` +
    `Sé que a veces el día nos gana y las cosas se quedan pendientes, pero quería recordarte que ese primer paso hacia tu bienestar siempre vale la pena.\n\n` +
    `¿Te quedó alguna duda, o te puedo ayudar con algo para que podamos agendar tu consulta?`
  );
}

/**
 * Revisa Airtable en busca de leads fríos y les envía un mensaje de seguimiento.
 * Luego notifica a Yazmin para que esté al tanto.
 */
async function verificarYRecontactar() {
  try {
    const leadsFrios = await obtenerLeadsFrios();

    if (leadsFrios.length === 0) return;

    console.log(`[FOLLOWUP] ${leadsFrios.length} lead(s) frío(s) detectado(s)`);

    for (const record of leadsFrios) {
      const { telefono, nombre_contacto } = record.fields;
      if (!telefono) continue;

      // 1. Enviar mensaje de seguimiento al usuario
      const mensaje = construirMensajeSeguimiento(nombre_contacto);
      await enviarMensaje(telefono, mensaje);
      console.log(`[FOLLOWUP] Seguimiento enviado a ${telefono} (${nombre_contacto || "sin nombre"})`);

      // 2. Actualizar ultima_actividad para que el cron no lo vuelva a disparar
      await actualizarUltimaActividad(record.id);

      // 3. Notificar a Yazmin que este lead necesita atención manual si no responde
      await derivarLeadAAsistente(telefono, record.fields, "RECONTACTO");
    }
  } catch (err) {
    console.error("[FOLLOWUP] Error en verificación de leads fríos:", err.message);
  }
}

/**
 * Inicia el sistema de seguimiento automático.
 * Se llama una vez al arrancar el servidor.
 */
function iniciarFollowup() {
  console.log("[FOLLOWUP] Sistema de recontacto activo — verifica leads fríos cada 15 min");

  // Primera verificación 2 minutos después del arranque (no en el arranque mismo)
  setTimeout(verificarYRecontactar, 2 * 60 * 1000);

  // Luego cada 15 minutos
  setInterval(verificarYRecontactar, INTERVALO_MS);
}

module.exports = { iniciarFollowup };
