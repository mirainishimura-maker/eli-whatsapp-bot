const axios = require("axios");

const evolutionClient = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: {
    apikey: process.env.EVOLUTION_API_KEY,
    "Content-Type": "application/json",
  },
});

/**
 * Activa el indicador "escribiendo..." en el chat del usuario.
 * Evolution API lo mantiene visible mientras dura la petición (delayMs).
 *
 * @param {string} numero - Número destino
 * @param {number} delayMs - Cuánto tiempo mostrar el indicador (ms)
 */
async function simularEscribiendo(numero, delayMs) {
  const instancia = process.env.EVOLUTION_INSTANCE;

  // Algunos deployments usan /chat/sendPresence, otros /presence
  // Se intenta con el endpoint más común de Evolution API v2
  await evolutionClient.post(`/chat/sendPresence/${instancia}`, {
    number: numero,
    options: {
      presence: "composing",
      delay: delayMs,
    },
  });
}

/**
 * Envía un mensaje de texto por WhatsApp usando Evolution API.
 * @param {string} numero - Número destino (formato: 51987654321 sin +)
 * @param {string} texto - Texto a enviar
 */
async function enviarMensaje(numero, texto) {
  const instancia = process.env.EVOLUTION_INSTANCE;

  await evolutionClient.post(`/message/sendText/${instancia}`, {
    number: numero,
    text: texto,
  });
}

/**
 * Extrae el texto del mensaje entrante desde el payload de Evolution API.
 * Soporta: conversación directa, texto extendido y contenido multimedia con caption.
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
 * Ejemplo: "51987654321@s.whatsapp.net" -> "51987654321"
 */
function extraerTelefono(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.replace(/@.*$/, "");
}

module.exports = { simularEscribiendo, enviarMensaje, extraerTexto, extraerTelefono };
