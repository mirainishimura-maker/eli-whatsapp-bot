const express = require("express");
const router = express.Router();

const { extraerTexto, extraerTelefono, enviarMensaje } = require("../services/evolution");
const { procesarConIA } = require("../services/openai");
const {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarLead,
} = require("../services/airtable");

/**
 * POST /webhook
 * Endpoint principal que recibe eventos de Evolution API.
 */
router.post("/", async (req, res, next) => {
  try {
    const body = req.body;

    // --- 1. VALIDAR ESTRUCTURA DEL PAYLOAD ---
    const data = body?.data;
    if (!data) {
      return res.status(200).json({ status: "ignored", reason: "no data" });
    }

    // Ignorar mensajes enviados por nosotros mismos
    if (data.key?.fromMe === true) {
      return res.status(200).json({ status: "ignored", reason: "fromMe" });
    }

    // Ignorar mensajes de grupos (remoteJid termina en @g.us)
    const remoteJid = data.key?.remoteJid || "";
    if (remoteJid.endsWith("@g.us")) {
      return res.status(200).json({ status: "ignored", reason: "group message" });
    }

    // --- 2. EXTRAER DATOS DEL MENSAJE ---
    const telefono = extraerTelefono(remoteJid);
    const textoUsuario = extraerTexto(data.message);

    if (!telefono || !textoUsuario) {
      return res.status(200).json({ status: "ignored", reason: "no text or phone" });
    }

    console.log(`[WEBHOOK] Mensaje de ${telefono}: "${textoUsuario}"`);

    // --- 3. RECUPERAR MEMORIA DE AIRTABLE ---
    const memoriaExistente = await buscarMemoria(telefono);
    const historyPrevio = memoriaExistente ? memoriaExistente.history : [];

    // --- 4. PROCESAR CON IA ---
    const { respuesta, lead, historialActualizado } = await procesarConIA(
      historyPrevio,
      textoUsuario
    );

    console.log(`[IA] Respuesta para ${telefono}: "${respuesta}" | Lead: ${JSON.stringify(lead)}`);

    // --- 5. ACTUALIZAR MEMORIA EN AIRTABLE ---
    if (memoriaExistente) {
      await actualizarMemoria(memoriaExistente.recordId, historialActualizado);
    } else {
      await crearMemoria(telefono, historialActualizado);
    }

    // --- 6. ENVIAR RESPUESTA POR WHATSAPP ---
    await enviarMensaje(telefono, respuesta);

    // --- 7. REGISTRAR LEAD CALIFICADO EN CRM ---
    if (lead?.calificado === true) {
      console.log(`[CRM] Lead calificado detectado: ${JSON.stringify(lead)}`);
      await registrarLead(telefono, lead);
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
