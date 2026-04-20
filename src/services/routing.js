const { enviarMensaje } = require("./evolution");

/**
 * Deriva notificaciones a Yazmin (asistente de Piura) según el tipo de evento.
 *
 * Tipos:
 *   'NUEVO_LEAD'          — lead calificado por primera vez
 *   'LISTO_PARA_COORDINAR' — Eli ya recopiló DNI, listo para asignar horario y cobrar
 *   'RECONTACTO'          — lead frío, Eli envió seguimiento automático sin respuesta
 */
async function derivarLeadAAsistente(telefonoCliente, lead, tipo = "NUEVO_LEAD") {
  const numeroYazmin = process.env.ASISTENTE_PIURA;

  if (!numeroYazmin) {
    console.warn(`[ROUTING] No está configurado ASISTENTE_PIURA en el .env`);
    return;
  }

  const mensajes = {
    NUEVO_LEAD:           construirNuevoLead,
    LISTO_PARA_COORDINAR: construirListoParaCoordinar,
    RECONTACTO:           construirRecontacto,
  };

  const construir = mensajes[tipo] || construirNuevoLead;
  const resumen = construir(telefonoCliente, lead);

  await enviarMensaje(numeroYazmin, resumen);
  console.log(`[ROUTING] Notificación ${tipo} enviada a Yazmin: ${numeroYazmin}`);
}

// ─────────────────────────────────────────────
// PLANTILLAS DE MENSAJES PARA YAZMIN
// ─────────────────────────────────────────────

function construirNuevoLead(telefonoCliente, lead) {
  const icono = {
    ALTO:  "🔴 ALTO  — cierre rápido probable",
    MEDIO: "🟡 MEDIO — requiere seguimiento",
    BAJO:  "🟢 BAJO  — baja probabilidad",
  }[lead.calificacion] || "⚪ Sin calificar";

  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";

  const lineas = [
    "🔔 *NUEVO LEAD — ÍTACA PIURA*",
    "",
    `📊 ${icono}`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  if (esTercero) lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
  lineas.push(`🎂 Edad: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);

  lineas.push("", "⏳ Eli está recopilando datos. Te avisaré cuando esté listo para coordinar.");

  return lineas.join("\n");
}

function construirListoParaCoordinar(telefonoCliente, lead) {
  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";
  const nombre = lead.nombre_contacto || "el lead";

  const lineas = [
    "✅ *LISTO PARA COORDINAR — ÍTACA PIURA*",
    "",
    `${nombre} confirmó que quiere agendar y Eli ya recopiló sus datos.`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  if (lead.dni_contacto) lineas.push(`🪪 DNI contacto: ${lead.dni_contacto}`);
  if (esTercero) {
    lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
    if (lead.dni_paciente) lineas.push(`🪪 DNI paciente: ${lead.dni_paciente}`);
  }
  lineas.push(`🎂 Edad: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);

  lineas.push("", "👉 *Siguiente paso:* envíale horarios disponibles y coordina el pago de S/50.");

  return lineas.join("\n");
}

function construirRecontacto(telefonoCliente, lead) {
  // Soporta tanto campos del objeto lead (snake_case) como campos reales de Airtable (MAYÚSCULAS)
  const nombre     = lead.nombre_contacto || lead["NOMBRES"]            || "este lead";
  const motivo     = lead.motivo          || lead["MOTIVO"]             || "—";
  const estado     = lead.calificacion    || lead["ESTADO"]             || "";

  const icono = { ALTO: "🔴 ALTO", MEDIO: "🟡 MEDIO", BAJO: "🟢 BAJO" }[estado] || "⚪";

  const lineas = [
    "⚠️ *RECONTACTO PENDIENTE — ÍTACA PIURA*",
    "",
    `Eli envió seguimiento automático a *${nombre}* pero no respondió.`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${nombre}`,
    `💬 Motivo: ${motivo}`,
    `📊 Estado: ${icono}`,
    "",
    "👉 *Escríbele o llámala directamente para no perder el lead.*",
  ];

  return lineas.join("\n");
}

module.exports = { derivarLeadAAsistente };
