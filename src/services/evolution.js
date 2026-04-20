const axios = require("axios");

const evolutionClient = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: {
    apikey: process.env.EVOLUTION_API_KEY,
    "Content-Type": "application/json",
  },
});

// ─────────────────────────────────────────────
// PRESENCIA
// ─────────────────────────────────────────────

/**
 * Dispara el indicador "escribiendo..." de forma inmediata al recibir el mensaje.
 * Se llama en background (fire-and-forget) desde el webhook para que el usuario
 * vea a Eli activa mientras se procesa el mensaje.
 *
 * @param {string} numero - Número destino
 */
async function presenciaInmediata(numero) {
  const instancia = process.env.EVOLUTION_INSTANCE;
  await evolutionClient.post(`/chat/sendPresence/${instancia}`, {
    number: numero,
    options: {
      presence: "composing",
      delay: 15000, // 15 segundos — cubre el tiempo inicial de procesamiento
    },
  });
}

/**
 * Activa el indicador "escribiendo..." justo antes de enviar la respuesta.
 * Lo mantiene visible durante delayMs milisegundos.
 *
 * @param {string} numero   - Número destino
 * @param {number} delayMs  - Cuánto tiempo mostrar el indicador (ms)
 */
async function simularEscribiendo(numero, delayMs) {
  const instancia = process.env.EVOLUTION_INSTANCE;
  await evolutionClient.post(`/chat/sendPresence/${instancia}`, {
    number: numero,
    options: {
      presence: "composing",
      delay: delayMs,
    },
  });
}

// ─────────────────────────────────────────────
// ENVÍO DE MENSAJES
// ─────────────────────────────────────────────

/**
 * Envía un mensaje de texto simple por WhatsApp.
 * @param {string} numero - Número destino (formato: 51987654321 sin +)
 * @param {string} texto  - Texto a enviar
 */
async function enviarMensaje(numero, texto) {
  const instancia = process.env.EVOLUTION_INSTANCE;
  await evolutionClient.post(`/message/sendText/${instancia}`, {
    number: numero,
    text: texto,
  });
}

/**
 * Envía la respuesta de Eli dividiéndola en bloques si tiene varios párrafos.
 * Cada bloque se envía como un mensaje separado con un breve delay humano entre ellos.
 *
 * Regla de división: separa por líneas dobles (\n\n).
 * Si la respuesta es un solo bloque, se envía directo sin delay adicional.
 *
 * @param {string} numero - Número destino
 * @param {string} texto  - Texto completo de la respuesta de Eli
 */
async function enviarMensajeChunked(numero, texto) {
  const bloques = texto
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (bloques.length <= 1) {
    return enviarMensaje(numero, texto.trim());
  }

  for (let i = 0; i < bloques.length; i++) {
    if (i > 0) {
      // Pausa humana entre bloques: 2 a 3 segundos
      const pausa = 2000 + Math.random() * 1000;
      // Mostrar typing brevemente antes del siguiente bloque
      simularEscribiendo(numero, pausa).catch(() => {});
      await new Promise((r) => setTimeout(r, pausa));
    }
    await enviarMensaje(numero, bloques[i]);
  }
}

// ─────────────────────────────────────────────
// EXTRACCIÓN DE DATOS DEL WEBHOOK
// ─────────────────────────────────────────────

/**
 * Extrae el tipo de mensaje entrante desde el objeto message de Evolution API.
 * Retorna: 'audio' | 'imagen' | 'sticker' | 'texto' | null
 *
 * @param {object} message - El campo message del payload del webhook
 */
function extraerTipoMensaje(message) {
  if (!message) return null;
  if (message.audioMessage) return "audio";
  if (message.stickerMessage) return "sticker";
  if (message.imageMessage) return "imagen";
  // Video, documento con caption y texto directo → manejados como texto
  if (extraerTexto(message)) return "texto";
  return null;
}

/**
 * Extrae el texto del mensaje entrante desde el payload de Evolution API.
 * Soporta: conversación directa, texto extendido y multimedia con caption.
 */
function extraerTexto(message) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    null
  );
}

/**
 * Extrae el número de teléfono limpio desde el remoteJid de WhatsApp.
 * Ejemplo: "51987654321@s.whatsapp.net" → "51987654321"
 */
function extraerTelefono(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.replace(/@.*$/, "");
}

// ─────────────────────────────────────────────
// DESCARGA DE MEDIA
// ─────────────────────────────────────────────

/**
 * Descarga un archivo multimedia (audio o imagen) desde Evolution API en base64.
 * Devuelve { base64, mimetype }.
 *
 * @param {object} data - El objeto data completo del webhook (incluye key, message, etc.)
 */
async function descargarMediaBase64(data) {
  const instancia = process.env.EVOLUTION_INSTANCE;
  const response = await evolutionClient.post(
    `/chat/getBase64FromMediaMessage/${instancia}`,
    { message: data }
  );
  return response.data; // { base64: "...", mimetype: "audio/ogg" }
}

/**
 * Envía una imagen desde una URL al número destino.
 * @param {string} numero  - Número destino (ej: 51987654321)
 * @param {string} url     - URL pública de la imagen
 * @param {string} caption - Texto opcional debajo de la imagen
 */
async function enviarImagenUrl(numero, url, caption = "") {
  const instancia = process.env.EVOLUTION_INSTANCE;
  await evolutionClient.post(`/message/sendMedia/${instancia}`, {
    number: numero,
    mediatype: "image",
    media: url,
    caption,
  });
}

module.exports = {
  presenciaInmediata,
  simularEscribiendo,
  enviarMensaje,
  enviarMensajeChunked,
  enviarImagenUrl,
  extraerTipoMensaje,
  extraerTexto,
  extraerTelefono,
  descargarMediaBase64,
};
