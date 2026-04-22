const axios = require("axios");

const SYSTEM_ANALIZAR = `Analizas conversaciones de WhatsApp de un consultorio de psicología en Perú (Ítaca Conversemos). Tu tarea es determinar en qué etapa está la conversación y qué datos del lead ya se conocen.

ETAPAS:
- "apertura"      → primer contacto, Eli aún no sabe nada del usuario
- "escucha"       → el usuario está compartiendo su situación, aún no es momento de pedir datos
- "calificacion"  → ya hubo escucha suficiente, Eli está recogiendo: para quién, edad, ciudad, motivo
- "info"          → Eli ya tiene los datos y está presentando la primera consulta o respondiendo preguntas
- "cierre"        → el usuario quiere agendar, Eli está pidiendo DNI y coordinando con la asistente
- "fuera_flujo"   → número equivocado, spam, o mensaje completamente irrelevante

DATOS DEL LEAD (marca los que ya están confirmados en la conversación):
nombre_contacto, para_quien, edad_paciente, ciudad, motivo, dni_contacto, dni_paciente

Responde SOLO con JSON válido, sin texto adicional, sin markdown:
{
  "etapa": "calificacion",
  "datos_disponibles": ["nombre_contacto", "ciudad", "motivo"],
  "datos_faltantes": ["edad_paciente", "dni_contacto"],
  "nota": "Una oración con el contexto clave que ayude a responder mejor este mensaje."
}`;

async function analizarContexto(historial) {
  const ultimos = historial.slice(-10);

  if (ultimos.length === 0) {
    return {
      etapa: "apertura",
      datos_disponibles: [],
      datos_faltantes: ["nombre_contacto", "para_quien", "edad_paciente", "ciudad", "motivo", "dni_contacto"],
      nota: "Primer contacto.",
    };
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_ANALIZAR },
          ...ultimos,
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  } catch (err) {
    console.error("[CONTEXTO] Error:", err.message);
    return { etapa: "escucha", datos_disponibles: [], datos_faltantes: [], nota: "" };
  }
}

module.exports = { analizarContexto };
