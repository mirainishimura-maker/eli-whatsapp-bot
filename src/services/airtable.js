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
 * dniNuevo = true cuando el DNI se capturó por primera vez en esta llamada.
 * Eso dispara la notificación "LISTO PARA COORDINAR" a Yazmin.
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
    ultima_actividad:   new Date().toISOString(),
  };

  const formula = encodeURIComponent(`{telefono}="${telefono}"`);
  const response = await airtableClient.get(`/LEADS?filterByFormula=${formula}`);
  const records = response.data.records;

  if (records.length > 0) {
    const record = records[0];
    const recordId = record.id;
    const oldDni = record.fields.dni_contacto || "";
    const dniNuevo = !oldDni && !!lead.dni_contacto;
    await airtableClient.patch(`/LEADS/${recordId}`, { fields });
    return { isNew: false, dniNuevo, recordId };
  }

  fields.fecha = new Date().toISOString();
  const newRecord = await airtableClient.post("/LEADS", { fields });
  return { isNew: true, dniNuevo: !!lead.dni_contacto, recordId: newRecord.data.id };
}

/**
 * Actualiza solo ultima_actividad de un lead (para el sistema de recontacto).
 * Se llama después de enviar el seguimiento automático para no re-dispararlo.
 */
async function actualizarUltimaActividad(recordId) {
  await airtableClient.patch(`/LEADS/${recordId}`, {
    fields: { ultima_actividad: new Date().toISOString() },
  });
}

/**
 * Retorna leads "fríos": sin respuesta entre 60 y 90 minutos,
 * con calificación activa y nombre conocido.
 * La ventana de 30 min garantiza que el cron (cada 15 min) solo dispare una vez por lead.
 */
async function obtenerLeadsFrios() {
  const formula = encodeURIComponent(
    `AND(` +
    `IS_BEFORE({ultima_actividad}, DATEADD(NOW(), -60, 'minutes')),` +
    `IS_AFTER({ultima_actividad}, DATEADD(NOW(), -90, 'minutes')),` +
    `{calificacion} != 'BAJO',` +
    `{nombre_contacto} != ''` +
    `)`
  );
  const response = await airtableClient.get(`/LEADS?filterByFormula=${formula}`);
  return response.data.records;
}

module.exports = {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
  actualizarUltimaActividad,
  obtenerLeadsFrios,
};
