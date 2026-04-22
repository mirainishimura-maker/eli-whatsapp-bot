const { obtenerLeadsEnFollowup, actualizarPasoFollowup } = require("./airtable");
const { enviarMensaje, enviarImagenUrl } = require("./evolution");

const INTERVALO_MS = 15 * 60 * 1000; // revisar cada 15 min

/**
 * Secuencia de recontacto de 8 pasos.
 *
 * delayMs: tiempo mínimo desde ultima_actividad para disparar este paso.
 *          Cada paso actualiza ultima_actividad, así que el delay es relativo
 *          al paso anterior (o a la última actividad real del usuario).
 *
 * Cronología aproximada desde que el lead deja de responder:
 *   Paso 0 → +1h   (texto, sin imagen)
 *   Paso 1 → +3h   (texto, sin imagen)
 *   Paso 2 → +1d   (imagen 1)
 *   Paso 3 → +3d   (imagen 2)
 *   Paso 4 → +5d   (imagen 8)
 *   Paso 5 → +7d   (imagen 5)
 *   Paso 6 → +10d  (imagen 9)
 *   Paso 7 → +15d  (imagen 10)
 */
const SECUENCIA = [
  {
    delayMs: 1 * 60 * 60 * 1000, // 1h desde última actividad real
    imagen: null,
    texto: (nombre) =>
      `${nombre ? `Hola ${nombre} 🫂` : "Hola 🫂"} Pensamos en ti. Hay cosas que se sienten más ligeras cuando hay alguien con quien hablarlas. Estoy aquí para ayudarte, ¿conversamos? ¿Tienes dudas para empezar?`,
  },
  {
    delayMs: 2 * 60 * 60 * 1000, // 2h desde paso 0 → total ~3h
    imagen: null,
    texto: () =>
      `No tienes que estar seguro/a de nada para empezar. La primera sesión es precisamente para eso: explorar, sin presión. ¿Hablamos? 🩵`,
  },
  {
    delayMs: 21 * 60 * 60 * 1000, // 21h desde paso 1 → total ~1 día
    imagen: process.env.FOLLOWUP_IMG_1,
    texto: () =>
      `Hola 👋 Solo pasé a preguntarte esto. A veces la vida nos absorbe tanto que lo más importante lo dejamos para "después"... y ese después nunca llega. Si en algún momento sentiste que necesitabas un espacio para ti, aquí seguimos 🩵 ¿Seguimos donde lo dejamos?`,
  },
  {
    delayMs: 48 * 60 * 60 * 1000, // 48h desde paso 2 → total ~3 días
    imagen: process.env.FOLLOWUP_IMG_2,
    texto: () =>
      `¿Te suena familiar? 😅 El momento perfecto nunca llega solo. Pero tú sí puedes crearlo. Escríbenos y buscamos juntos el espacio que funcione para ti. 🩵`,
  },
  {
    delayMs: 48 * 60 * 60 * 1000, // 48h desde paso 3 → total ~5 días
    imagen: process.env.FOLLOWUP_IMG_8,
    texto: () =>
      `Estas preguntas no son para alarmarte. Son para recordarte que mereces entenderte mejor. Podemos ayudarte en eso. 🫂🩵`,
  },
  {
    delayMs: 48 * 60 * 60 * 1000, // 48h desde paso 4 → total ~7 días
    imagen: process.env.FOLLOWUP_IMG_5,
    texto: () =>
      `Ese primer paso ya lo diste cuando nos contactaste. No dejes que quede a medias. Aún tienes tiempo de agendarte. Escríbenos 💬🩵`,
  },
  {
    delayMs: 72 * 60 * 60 * 1000, // 72h desde paso 5 → total ~10 días
    imagen: process.env.FOLLOWUP_IMG_9,
    texto: () =>
      `Hace un tiempo nos contactaste y algo te trajo hasta aquí. Ese algo sigue siendo válido. Cuando sientas que es momento, la puerta está abierta. 🩵💬`,
  },
  {
    delayMs: 120 * 60 * 60 * 1000, // 120h desde paso 6 → total ~15 días
    imagen: process.env.FOLLOWUP_IMG_10,
    texto: () =>
      `Queremos recordarte que seguimos aquí, con espacio para ti. Si quieres dar el paso, es tan sencillo como responder este mensaje. ¿Conversamos? 💬🩵`,
  },
];

function primerNombre(nombreCompleto) {
  if (!nombreCompleto) return null;
  return nombreCompleto.split(" ")[0];
}

async function verificarYEnviarFollowups() {
  try {
    const leads = await obtenerLeadsEnFollowup();
    if (leads.length === 0) return;

    const ahora = Date.now();

    for (const record of leads) {
      const paso = record.fields["PASO_FOLLOWUP"] ?? 0;
      if (paso >= SECUENCIA.length) continue;

      const ultimaActividad = record.fields.ultima_actividad;
      if (!ultimaActividad) continue;

      const diff = ahora - new Date(ultimaActividad).getTime();
      const step = SECUENCIA[paso];

      if (diff < step.delayMs) continue;

      const telefono = record.fields["CELULAR"];
      if (!telefono) continue;

      const nombre = primerNombre(record.fields["NOMBRES"]);

      try {
        if (step.imagen) {
          await enviarImagenUrl(telefono, step.imagen, step.texto(nombre));
        } else {
          await enviarMensaje(telefono, step.texto(nombre));
        }

        await actualizarPasoFollowup(record.id, paso + 1);
        console.log(`[FOLLOWUP] Paso ${paso + 1}/${SECUENCIA.length} → ${telefono} (${nombre || "sin nombre"})`);
      } catch (err) {
        console.error(`[FOLLOWUP] Error paso ${paso} → ${telefono}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[FOLLOWUP] Error general:", err.message);
  }
}

function iniciarFollowup() {
  console.log("[FOLLOWUP] Secuencia de 8 pasos activa — verifica cada 15 min");
  setTimeout(verificarYEnviarFollowups, 2 * 60 * 1000);
  setInterval(verificarYEnviarFollowups, INTERVALO_MS);
}

module.exports = { iniciarFollowup };
