const { enviarMensaje } = require("./evolution");

/**
 * Deriva un lead calificado a Yazmin (asistente de Piura) por WhatsApp.
 * Este bot atiende únicamente la sede Piura.
 *
 * @param {string} telefonoCliente - Número del usuario que habló con Eli
 * @param {object} lead - Objeto con todos los datos del lead
 */
async function derivarLeadAAsistente(telefonoCliente, lead) {
  const numeroYazmin = process.env.ASISTENTE_PIURA;

  if (!numeroYazmin) {
    console.warn(`[ROUTING] No está configurado ASISTENTE_PIURA en el .env`);
    return;
  }

  const resumen = construirResumenLead(telefonoCliente, lead);
  await enviarMensaje(numeroYazmin, resumen);
  console.log(`[ROUTING] Lead derivado a Yazmin (Piura): ${numeroYazmin}`);
}

/**
 * Construye el mensaje de resumen del lead para enviar a Yazmin.
 */
function construirResumenLead(telefonoCliente, lead) {
  const iconoCalificacion = {
    ALTO:  "🔴 ALTO  — cierre rápido probable",
    MEDIO: "🟡 MEDIO — requiere seguimiento",
    BAJO:  "🟢 BAJO  — baja probabilidad de cierre",
  }[lead.calificacion] || "⚪ Sin calificar";

  const lineas = [
    "🔔 *NUEVO LEAD — ÍTACA CONVERSEMOS PIURA*",
    "",
    `📊 Calificación: ${iconoCalificacion}`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";
  if (esTercero) {
    lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
  }

  lineas.push(`🎂 Edad del paciente: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);

  if (lead.dni_contacto) lineas.push(`🪪 DNI contacto: ${lead.dni_contacto}`);
  if (esTercero && lead.dni_paciente) lineas.push(`🪪 DNI paciente: ${lead.dni_paciente}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);

  lineas.push("", "⏳ Pendiente: confirmar horario y cobrar primera consulta (S/50).");

  return lineas.join("\n");
}

module.exports = { derivarLeadAAsistente };
