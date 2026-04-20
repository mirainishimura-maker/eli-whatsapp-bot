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

  return {
    recordId: record.id,
    history,
  };
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
    fields: {
      history: JSON.stringify(history),
    },
  });
}

/**
 * Crea o actualiza un lead en la tabla LEADS de Airtable.
 * Si ya existe un registro con ese teléfono, lo actualiza.
 * Si no existe, lo crea.
 *
 * Retorna { isNew: boolean, recordId: string }
 *
 * Campos esperados en la tabla LEADS:
 *   telefono, nombre_contacto, nombre_paciente, edad_paciente,
 *   para_quien, ciudad, motivo, dni_contacto, dni_paciente,
 *   psicologo_sugerido, calificacion, fecha
 */
async function registrarOActualizarLead(telefono, lead) {
  const fields = {
    telefono,
    nombre_contacto:    lead.nombre_contacto    || "",
    nombre_paciente:    lead.nombre_paciente     || "",
    edad_paciente:      lead.edad_paciente       ? String(lead.edad_paciente) : "",
    para_quien:         lead.para_quien          || "",
    ciudad:             lead.ciudad              || "",
    motivo:             lead.motivo              || "",
    dni_contacto:       lead.dni_contacto        || "",
    dni_paciente:       lead.dni_paciente        || "",
    psicologo_sugerido: lead.psicologo_sugerido  || "",
    calificacion:       lead.calificacion        || "",
  };

  // Buscar si ya existe un lead con este teléfono
  const formula = encodeURIComponent(`{telefono}="${telefono}"`);
  const response = await airtableClient.get(`/LEADS?filterByFormula=${formula}`);
  const records = response.data.records;

  if (records.length > 0) {
    const recordId = records[0].id;
    await airtableClient.patch(`/LEADS/${recordId}`, { fields });
    return { isNew: false, recordId };
  }

  // Crear nuevo registro
  fields.fecha = new Date().toISOString();
  const newRecord = await airtableClient.post("/LEADS", { fields });
  return { isNew: true, recordId: newRecord.data.id };
}

module.exports = {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
};
