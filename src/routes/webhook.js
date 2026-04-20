const express = require("express");
const router = express.Router();

const {
  iniciarPresencia,
  presenciaInmediata,
  simularEscribiendo,
  enviarMensajeChunked,
  enviarImagenUrl,
  extraerTexto,
  extraerTelefono,
  extraerTipoMensaje,
  descargarMediaBase64,
} = require("../services/evolution");

// Imágenes predefinidas que Eli puede enviar al cliente
const IMAGENES = {
  yape_qr:    { url: process.env.IMG_YAPE_QR,    caption: "📲 QR de pago — Yape (Gabriela Rentería)" },
  bcp_cuenta: { url: process.env.IMG_BCP_CUENTA, caption: "🏦 Datos de cuenta BCP — ITACA CONVERSEMOS" },
  mapa_piura: { url: process.env.IMG_MAPA_PIURA, caption: "📍 Sede Piura — Av. Bolognesi 582, of. 201" },
};

const { procesarConIA, transcribirAudio } = require("../services/openai");
const { derivarLeadAAsistente } = require("../services/routing");
const {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
} = require("../services/airtable");
const { calcularDemora, esperar } = require("../utils/humanDelay");

const RESPUESTA_STICKER = "Qué lindo 😄 Cuéntame, ¿en qué te puedo ayudar?";

// ── DEBOUNCE ────────────────────────────────────────────────────────────────
// Espera 45 segundos desde el ÚLTIMO mensaje del usuario antes de procesar.
// Si llegan varios mensajes seguidos (burbujas), los acumula y los procesa juntos
// como si fueran uno solo. Así Eli siempre da UNA sola respuesta.
const DEBOUNCE_MS = 45_000;
const pendingMessages = new Map(); // telefono → { timer, mensajes[] }

/**
 * Procesa en background todos los mensajes acumulados de un usuario.
 * Combina textos, transcribe audios y responde con una sola llamada a la IA.
 */
async function procesarMensajesAcumulados(telefono, mensajes) {
  try {
    // Si todos son stickers, respuesta directa sin IA
    if (mensajes.every((m) => m.tipo === "sticker")) {
      await enviarMensajeChunked(telefono, RESPUESTA_STICKER);
      return;
    }

    const textosFinales = [];
    let imagenBase64 = null;
    let imagenMime = null;

    // Procesar cada mensaje acumulado en orden
    for (const msg of mensajes) {
      if (msg.tipo === "sticker") continue;

      if (msg.tipo === "audio") {
        try {
          const { base64, mimetype } = await descargarMediaBase64(msg.data);
          const transcripcion = await transcribirAudio(base64, mimetype);
          textosFinales.push(`[El usuario envió un mensaje de voz diciendo:] ${transcripcion}`);
          console.log(`[WHISPER] ${telefono} → "${transcripcion}"`);
        } catch (e) {
          console.warn(`[AUDIO] Error al transcribir:`, e.message);
          textosFinales.push("[El usuario envió un mensaje de voz que no se pudo transcribir.]");
        }
        continue;
      }

      if (msg.tipo === "imagen") {
        try {
          const { base64, mimetype } = await descargarMediaBase64(msg.data);
          imagenBase64 = base64;
          imagenMime = mimetype;
          textosFinales.push(msg.texto || "[El usuario compartió una imagen]");
          console.log(`[VISION] ${telefono} → imagen recibida (${mimetype})`);
        } catch (e) {
          console.warn(`[IMAGE] Error al descargar imagen:`, e.message);
          textosFinales.push(msg.texto || "[El usuario compartió una imagen que no se pudo procesar.]");
        }
        continue;
      }

      // Texto normal
      if (msg.texto) textosFinales.push(msg.texto);
    }

    const textoFinal = textosFinales.join("\n");
    if (!textoFinal) return;

    // ── 1. Recuperar memoria ───────────────────────────────────────────────
    const memoriaExistente = await buscarMemoria(telefono);
    const historyPrevio = memoriaExistente ? memoriaExistente.history : [];

    // ── 2. Arrancar "escribiendo..." antes de llamar a la IA ──────────────
    // El loop se renueva cada 5s automáticamente hasta que llamemos detener()
    const presencia = iniciarPresencia(telefono);

    // ── 3. Procesar con IA ─────────────────────────────────────────────────
    const { respuesta, lead, imagenes, historialActualizado } = await procesarConIA(
      historyPrevio,
      textoFinal,
      { imagenBase64, imagenMime }
    );

    console.log(`[IA] ${telefono} → calificacion:${lead?.calificacion} ciudad:${lead?.ciudad}`);

    // ── 4. Esperar demora humana (typing sigue visible durante este tiempo) ─
    const demoraMs = calcularDemora(respuesta);
    console.log(`[DELAY] ${telefono} → ${(demoraMs / 1000).toFixed(1)}s`);
    await esperar(demoraMs);

    // ── 5. Detener typing y enviar respuesta ───────────────────────────────
    presencia.detener();
    await enviarMensajeChunked(telefono, respuesta);

    // ── 5. Persistencia y routing (en paralelo) ────────────────────────────
    const promesas = [];

    if (memoriaExistente) {
      promesas.push(actualizarMemoria(memoriaExistente.recordId, historialActualizado));
    } else {
      promesas.push(crearMemoria(telefono, historialActualizado));
    }

    if (lead?.calificacion != null) {
      console.log(`[CRM] Lead ${lead.calificacion}: ${lead.nombre_contacto || telefono} — ${lead.ciudad || "?"}`);
      promesas.push(
        registrarOActualizarLead(telefono, lead).then(({ isNew, dniNuevo }) => {
          if (isNew) return derivarLeadAAsistente(telefono, lead, "NUEVO_LEAD");
          if (dniNuevo) return derivarLeadAAsistente(telefono, lead, "LISTO_PARA_COORDINAR");
        })
      );
    }

    const imagenesEnviar = Array.isArray(imagenes) ? imagenes : [];
    for (const imgId of imagenesEnviar) {
      const img = IMAGENES[imgId];
      if (img?.url) {
        console.log(`[IMG] Enviando imagen "${imgId}" a ${telefono}`);
        promesas.push(enviarImagenUrl(telefono, img.url, img.caption));
      } else {
        console.warn(`[IMG] URL no configurada para imagen: "${imgId}"`);
      }
    }

    await Promise.all(promesas);
  } catch (err) {
    console.error(`[ERROR] Fallo procesando mensajes de ${telefono}:`, err.message);
    if (err.response) {
      console.error(
        `[API ERROR] status=${err.response.status} url=${err.config?.url}`,
        err.response.data
      );
    }
  }
}

/**
 * POST /webhook
 * Recibe eventos de Evolution API.
 * Responde 200 de inmediato y acumula el mensaje en el buffer de debounce.
 * Después de 45s sin nuevos mensajes del mismo número, muestra "escribiendo..."
 * y procesa todos los mensajes acumulados como uno solo.
 */
router.post("/", (req, res) => {
  const data = req.body?.data;

  if (!data) return res.status(200).json({ status: "ignored", reason: "no data" });
  if (data.key?.fromMe === true) return res.status(200).json({ status: "ignored", reason: "fromMe" });

  const remoteJid = data.key?.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return res.status(200).json({ status: "ignored", reason: "group" });

  const telefono = extraerTelefono(remoteJid);
  const tipoMensaje = extraerTipoMensaje(data.message);
  const textoUsuario = extraerTexto(data.message);

  if (!telefono || !tipoMensaje) {
    return res.status(200).json({ status: "ignored", reason: "unsupported message type" });
  }

  console.log(`[WEBHOOK] ${telefono} (${tipoMensaje}): "${textoUsuario || "—"}"`);

  // Agregar al buffer del usuario
  if (!pendingMessages.has(telefono)) {
    pendingMessages.set(telefono, { timer: null, mensajes: [] });
  }

  const pending = pendingMessages.get(telefono);
  pending.mensajes.push({ tipo: tipoMensaje, texto: textoUsuario, data });

  // Reiniciar el timer cada vez que llega un mensaje nuevo
  if (pending.timer) clearTimeout(pending.timer);

  pending.timer = setTimeout(() => {
    const mensajesAcumulados = pending.mensajes;
    pendingMessages.delete(telefono);

    // Mostrar "escribiendo..." solo ahora, después de los 45s de espera
    const hayContenido = mensajesAcumulados.some((m) => m.tipo !== "sticker");
    if (hayContenido) {
      presenciaInmediata(telefono).catch((e) =>
        console.warn(`[PRESENCE] No disponible para ${telefono}:`, e.message)
      );
    }

    procesarMensajesAcumulados(telefono, mensajesAcumulados);
  }, DEBOUNCE_MS);

  res.status(200).json({ status: "queued" });
});

module.exports = router;
