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
    await postConRedirect(url, payload);
    console.log(`[SHEETS] Lead registrado — ${telefono} (${lead.ciudad || "?"})`);
  } catch (err) {
    console.error(`[SHEETS] Error al registrar lead:`, err.message);
  }
}

// Google Apps Script hace un redirect 302 en el primer POST.
// Axios convierte el POST a GET en el redirect — esto lo evitamos siguiendo manualmente.
async function postConRedirect(url, data) {
  try {
    return await axios.post(url, data, {
      headers: { "Content-Type": "application/json" },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
      timeout: 10000,
    });
  } catch (err) {
    if (err.response?.status === 302 || err.response?.status === 301) {
      const redirectUrl = err.response.headers.location;
      return await axios.post(redirectUrl, data, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
    }
    throw err;
  }
}

module.exports = { registrarLeadEnSheets };
