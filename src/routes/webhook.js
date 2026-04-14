const express = require("express");
const router = express.Router();

const { extraerTexto, extraerTelefono, simularEscribiendo, enviarMensaje } = require("../services/evolution");
const { procesarConIA } = require("../services/openai");
const { derivarLeadAAsistente } = require("../services/routing");
const {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarLead,
} = require("../services/airtable");
const { calcularDemora, esperar } = require("../utils/humanDelay");

/**
 * Procesa el mensaje en background: IA → typing → envío → CRM → routing.
 */
async function procesarMensaje(telefono, textoUsuario) {
  try {
    // --- 1. RECUPERAR MEMORIA ---
    const memoriaExistente = await buscarMemoria(telefono);
    const historyPrevio = memoriaExistente ? memoriaExistente.history : [];

    // --- 2. PROCESAR CON IA ---
    const { respuesta, lead, historialActualizado } = await procesarConIA(
      historyPrevio,
      textoUsuario
    );

    console.log(`[IA] ${telefono} → calificado:${lead?.calificado} ciudad:${lead?.ciudad}`);

    // --- 3. SIMULAR ESCRITURA HUMANA ---
    const demoraMs = calcularDemora(respuesta);
    console.log(`[DELAY] ${telefono} → ${(demoraMs / 1000).toFixed(1)}s`);

    try {
      await simularEscribiendo(telefono, demoraMs);
    } catch (presenceErr) {
      console.warn(`[TYPING] Presencia no disponible para ${telefono}:`, presenceErr.message);
    }

    await esperar(demoraMs);

    // --- 4. ENVIAR RESPUESTA ---
    await enviarMensaje(telefono, respuesta);

    // --- 5. PERSISTENCIA Y ACCIONES POST-CALIFICACIÓN (en paralelo) ---
    const promesas = [];

    // Actualizar o crear memoria
    if (memoriaExistente) {
      promesas.push(actualizarMemoria(memoriaExistente.recordId, historialActualizado));
    } else {
      promesas.push(crearMemoria(telefono, historialActualizado));
    }

    // Si el lead está calificado: registrar en CRM y derivar a asistente
    if (lead?.calificado === true) {
      console.log(`[CRM] Lead calificado: ${lead.nombre_contacto} — ${lead.ciudad}`);
      promesas.push(registrarLead(telefono, lead));
      promesas.push(derivarLeadAAsistente(telefono, lead));
    }

    await Promise.all(promesas);
  } catch (err) {
    console.error(`[ERROR] Fallo procesando mensaje de ${telefono}:`, err.message);
    if (err.response) {
      console.error(`[API ERROR] status=${err.response.status} url=${err.config?.url}`, err.response.data);
    }
  }
}

/**
 * POST /webhook
 * Recibe eventos de Evolution API. Responde 200 inmediatamente
 * y procesa en background.
 */
router.post("/", (req, res) => {
  const data = req.body?.data;

  if (!data) return res.status(200).json({ status: "ignored", reason: "no data" });
  if (data.key?.fromMe === true) return res.status(200).json({ status: "ignored", reason: "fromMe" });

  const remoteJid = data.key?.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return res.status(200).json({ status: "ignored", reason: "group" });

  const telefono = extraerTelefono(remoteJid);
  const textoUsuario = extraerTexto(data.message);

  if (!telefono || !textoUsuario) {
    return res.status(200).json({ status: "ignored", reason: "no text or phone" });
  }

  console.log(`[WEBHOOK] ${telefono}: "${textoUsuario}"`);

  res.status(200).json({ status: "processing" });
  procesarMensaje(telefono, textoUsuario);
});

module.exports = router;
