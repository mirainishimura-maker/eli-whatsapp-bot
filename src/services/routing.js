const { enviarMensaje } = require("./evolution");

// Números de las asistentes por sede
const ASISTENTES = {
  piura: process.env.ASISTENTE_PIURA,   // 947709108
  lima: process.env.ASISTENTE_LIMA,     // 980453832
  virtual: process.env.ASISTENTE_LIMA,  // Virtual también va a Lima por defecto
};

/**
 * Deriva un lead calificado a la asistente correspondiente por WhatsApp.
 * Envía un mensaje con el resumen completo del lead.
 *
 * @param {string} telefonoCliente - Número del usuario que habló con Eli
 * @param {object} lead - Objeto con todos los datos del lead
 */
async function derivarLeadAAsistente(telefonoCliente, lead) {
  const sede = (lead.ciudad || "").toLowerCase();
  const numeroAsistente = ASISTENTES[sede] || ASISTENTES.lima;

  if (!numeroAsistente) {
    console.warn(`[ROUTING] No hay asistente configurada para sede: ${sede}`);
    return;
  }

  const resumen = construirResumenLead(telefonoCliente, lead);

  await enviarMensaje(numeroAsistente, resumen);
  console.log(`[ROUTING] Lead derivado a asistente de ${sede}: ${numeroAsistente}`);
}

/**
 * Construye el mensaje de resumen del lead para enviar a la asistente.
 */
function construirResumenLead(telefonoCliente, lead) {
  const lineas = [
    "🔔 *NUEVO LEAD CALIFICADO — ÍTACA CONVERSEMOS*",
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  // Si la terapia es para otra persona
  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";
  if (esTercero) {
    lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
  }

  lineas.push(`🎂 Edad del paciente: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`📍 Sede: ${lead.ciudad || "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);

  if (lead.dni_contacto) {
    lineas.push(`🪪 DNI contacto: ${lead.dni_contacto}`);
  }
  if (esTercero && lead.dni_paciente) {
    lineas.push(`🪪 DNI paciente: ${lead.dni_paciente}`);
  }
  if (lead.psicologo_sugerido) {
    lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);
  }

  lineas.push("", "⏳ Pendiente: confirmar horario y pago de primera consulta (S/50).");

  return lineas.join("\n");
}

module.exports = { derivarLeadAAsistente };
