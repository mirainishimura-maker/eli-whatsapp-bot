const axios = require("axios");

const BASE_URL = "https://api.airtable.com/v0";
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const PAT = process.env.AIRTABLE_PAT;

const airtableClient = axios.create({
  baseURL: `${BASE_URL}/${BASE_ID}`,
  headers: {
    Authorization: `Bearer ${PAT}`,
    "Content-Type": "application/json",
  },
});

/**
 * Busca un registro en Eli_Memoria por número de teléfono.
 * Retorna { recordId, history } si existe, o null si no existe.
 */
async function buscarMemoria(telefono) {
  const formula = `filterByFormula={telefono}="${telefono}"`;
  const response = await airtableClient.get(`/Eli_Memoria?${formula}`);
  const records = response.data.records;

  if (records.length === 0) return null;

  const record = records[0];
  let history = [];

  try {
    history = JSON.parse(record.fields.history || "[]");
  } catch {
    history = [];
  }

  return { recordId: record.id, history };
}

/**
 * Crea un nuevo registro de memoria para un número nuevo.
 */
async function crearMemoria(telefono, history) {
  const response = await airtableClient.post("/Eli_Memoria", {
    fields: {
      telefono,
      history: JSON.stringify(history),
    },
  });
  return response.data.id;
}

/**
 * Actualiza el historial de un registro existente.
 */
async function actualizarMemoria(recordId, history) {
  await airtableClient.patch(`/Eli_Memoria/${recordId}`, {
    fields: { history: JSON.stringify(history) },
  });
}

/**
 * Crea o actualiza un lead en la tabla LEADS de Airtable.
 * Retorna { isNew, dniNuevo, recordId }
 *
 * dniNuevo = true cuando el DNI se capturó por primera vez.
 * Eso dispara la notificación "LISTO PARA COORDINAR" a Yazmin.
 */
async function registrarOActualizarLead(telefono, lead) {
  const ahora = new Date().toISOString();

  const fields = {
    "CELULAR":             telefono,
    "NOMBRES":             lead.nombre_contacto   || "",
    "PACIENTE":            lead.nombre_paciente    || "",
    "EDAD":                lead.edad_paciente      ? String(lead.edad_paciente) : "",
    "LEAD DE":             lead.para_quien         || "",
    "DISTRITO":            lead.ciudad             || "",
    "MOTIVO":              lead.motivo             || "",
    "PSICOLOGO ASIGNADO":  lead.psicologo_sugerido || "",
    "ESTADO":              lead.calificacion       || "",
    "ultima_actividad":    ahora,
    "PASO_FOLLOWUP":       0, // resetear al recibir mensaje real del usuario
  };

  // DNI va en notas adicionales (no hay campo específico en la tabla)
  const dniInfo = [];
  if (lead.dni_contacto) dniInfo.push(`DNI contacto: ${lead.dni_contacto}`);
  if (lead.dni_paciente) dniInfo.push(`DNI paciente: ${lead.dni_paciente}`);
  if (dniInfo.length > 0) {
    fields["INFORMACION ADICIONAL DE SEGUIMIENTO"] = dniInfo.join(" | ");
  }

  const formula = encodeURIComponent(`{CELULAR}="${telefono}"`);
  const response = await airtableClient.get(`/LEADS?filterByFormula=${formula}`);
  const records = response.data.records;

  if (records.length > 0) {
    const record = records[0];
    const recordId = record.id;
    // dniNuevo = había registro sin DNI y ahora llega con DNI
    const teniaDni = !!(record.fields["INFORMACION ADICIONAL DE SEGUIMIENTO"] || "").includes("DNI");
    const dniNuevo = !teniaDni && dniInfo.length > 0;
    await airtableClient.patch(`/LEADS/${recordId}`, { fields });
    return { isNew: false, dniNuevo, recordId };
  }

  fields["FECHA"] = ahora;
  const newRecord = await airtableClient.post("/LEADS", { fields });
  return { isNew: true, dniNuevo: dniInfo.length > 0, recordId: newRecord.data.id };
}

/**
 * Retorna todos los leads activos que aún no completaron la secuencia de followup.
 * El filtrado por tiempo y paso lo hace followup.js.
 */
async function obtenerLeadsEnFollowup() {
  const formula = encodeURIComponent(
    `AND({ESTADO} != 'BAJO', {ESTADO} != '')`
  );
  const response = await airtableClient.get(`/LEADS?filterByFormula=${formula}`);
  return response.data.records.filter(
    (r) => (r.fields["PASO_FOLLOWUP"] ?? 0) < 8
  );
}

/**
 * Avanza el paso de followup e inicializa ultima_actividad para calcular
 * el delay del siguiente paso a partir de este momento.
 */
async function actualizarPasoFollowup(recordId, nuevoPaso) {
  await airtableClient.patch(`/LEADS/${recordId}`, {
    fields: {
      "PASO_FOLLOWUP":    nuevoPaso,
      "ultima_actividad": new Date().toISOString(),
    },
  });
}

module.exports = {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
  obtenerLeadsEnFollowup,
  actualizarPasoFollowup,
};
