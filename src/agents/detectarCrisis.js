const axios = require("axios");

const SYSTEM_CRISIS = `Eres un detector de crisis psicológica. Analizas mensajes de WhatsApp enviados a un consultorio de psicología en Perú y detectas si hay señales de crisis.

SEÑALES DE CRISIS — cualquiera de estas activa la alerta:
- Menciones de querer hacerse daño (físico, autolesiones)
- Querer quitarse la vida / no querer seguir viviendo / ideación suicida
- Frases como: "ya no quiero estar aquí", "no aguanto más", "no tiene sentido seguir", "quiero desaparecer", "me quiero matar"
- Autolesiones activas o recientes mencionadas directamente
- Desesperanza profunda combinada con frases de querer terminar con todo
- Crisis emocional aguda con riesgo de daño inmediato

NO es crisis (no actives la alerta por):
- Tristeza, ansiedad, estrés, depresión sin señales de daño
- "Estoy mal", "ya no puedo", "estoy agotado" sin contexto de daño
- Frustración cotidiana intensa

Responde SOLO con JSON válido, sin texto adicional, sin markdown:
{"esCrisis":true,"nivel":"urgente","senales":["señal 1"]}
o
{"esCrisis":false,"nivel":"ninguno","senales":[]}

Nivel "urgente": riesgo inmediato de daño. Nivel "alto": señales claras pero sin inmediatez explícita.
Sé sensible pero no sobrediagnóstica. Prioriza no perder ninguna crisis real.`;

async function detectarCrisis(mensaje) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_CRISIS },
          { role: "user", content: mensaje },
        ],
        response_format: { type: "json_object" },
        max_tokens: 150,
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
    // Si falla el detector, no bloqueamos el flujo — logueamos y seguimos
    console.error("[CRISIS_DETECTOR] Error:", err.message);
    return { esCrisis: false, nivel: "ninguno", senales: [] };
  }
}

module.exports = { detectarCrisis };
