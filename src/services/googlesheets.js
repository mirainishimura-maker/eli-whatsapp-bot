const axios = require("axios");

/**
 * Registra o actualiza un lead en el Google Sheet correcto (Piura o Lima).
 * Usa la URL del Apps Script según lead.ciudad.
 */
async function registrarLeadEnSheets(telefono, lead, notas = "") {
  const ciudad = (lead.ciudad || "").toLowerCase();
  const url = ciudad === "lima"
    ? process.env.SHEETS_LIMA_URL
    : process.env.SHEETS_PIURA_URL;

  if (!url) {
    console.warn(`[SHEETS] URL no configurada para ciudad: ${lead.ciudad || "sin ciudad"}`);
    return;
  }

  const dniParts = [lead.dni_contacto, lead.dni_paciente].filter(Boolean);

  const payload = {
    celular:   telefono,
    nombre:    lead.nombre_contacto    || "",
    paciente:  (lead.nombre_paciente && lead.nombre_paciente !== lead.nombre_contacto)
                 ? lead.nombre_paciente : "",
    edad:      lead.edad_paciente      ? String(lead.edad_paciente) : "",
    motivo:    lead.motivo             || "",
    distrito:  lead.ciudad             || "",
    dni:       dniParts.join(" | "),
    psicologo: lead.psicologo_sugerido || "",
    modalidad: lead.para_quien         || "",
    estado:    lead.calificacion       || "NUEVO",
    notas,
  };

  try {
    const encodedPayload = encodeURIComponent(JSON.stringify(payload));
    await axios.get(`${url}?payload=${encodedPayload}`, { timeout: 25000 });
    console.log(`[SHEETS] Lead registrado — ${telefono} (${lead.ciudad || "?"})`);
  } catch (err) {
    console.error(`[SHEETS] Error al registrar lead:`, err.message);
  }
}

module.exports = { registrarLeadEnSheets };
