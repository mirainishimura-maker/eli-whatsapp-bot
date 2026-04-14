const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `Eres Eli, una asistente virtual amable y empática de un consultorio de psicología.
Tu objetivo es calificar leads en 4 pasos ordenados. NUNCA saltes pasos.

PASOS DE CALIFICACIÓN:
1. DATOS BÁSICOS: Saluda con calidez, presenta el servicio y solicita nombre y ciudad.
2. PRECIO: Informa que la consulta psicológica tiene un costo de S/50 (soles). Confirma si el usuario puede continuar con ese precio.
3. MOTIVO: Pregunta brevemente el motivo de consulta (ansiedad, depresión, relaciones, etc.).
4. CONTACTO DE PAGO: Indica que para confirmar la cita necesitas los datos de pago y proporciona el método disponible. Una vez que el usuario confirme, marca el lead como calificado.

REGLAS:
- Siempre responde en español, con un tono cálido y profesional.
- Avanza al siguiente paso solo cuando el usuario haya respondido el paso actual.
- Si el usuario rechaza el precio o no puede pagar, despídete amablemente sin marcar como calificado.
- No brindes diagnósticos ni consejos clínicos, solo agenda citas.

FORMATO DE RESPUESTA (OBLIGATORIO - siempre JSON válido):
{
  "respuesta": "El texto que le enviarás al usuario por WhatsApp",
  "lead": {
    "nombre": "nombre del usuario o cadena vacía si aún no lo sabes",
    "ciudad": "ciudad del usuario o cadena vacía si aún no la sabes",
    "calificado": false
  }
}

El campo "calificado" solo será true cuando el usuario haya completado los 4 pasos exitosamente.`;

/**
 * Envía el historial de conversación a GPT-4o y retorna la respuesta parseada.
 * @param {Array} history - Array de mensajes { role, content }
 * @param {string} nuevoMensaje - El último mensaje del usuario
 * @returns {{ respuesta: string, lead: { nombre: string, ciudad: string, calificado: boolean } }}
 */
async function procesarConIA(history, nuevoMensaje) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: nuevoMensaje },
  ];

  const response = await axios.post(
    OPENAI_URL,
    {
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const contenido = response.data.choices[0].message.content;
  const parsed = JSON.parse(contenido);

  // Guardar el turno completo en el historial
  const historialActualizado = [
    ...history,
    { role: "user", content: nuevoMensaje },
    { role: "assistant", content: contenido },
  ];

  return {
    respuesta: parsed.respuesta,
    lead: parsed.lead,
    historialActualizado,
  };
}

module.exports = { procesarConIA };
