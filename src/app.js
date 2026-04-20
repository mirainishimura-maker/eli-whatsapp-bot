const express = require("express");
const webhookRouter = require("./routes/webhook");
const errorHandler = require("./middleware/errorHandler");
const { iniciarFollowup } = require("./services/followup");

const app = express();

// Iniciar sistema de seguimiento automático de leads fríos
iniciarFollowup();

// Parsear JSON en el body de las peticiones
app.use(express.json());

// Ruta de salud para verificar que el servidor está activo
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rutas principales
app.use("/webhook", webhookRouter);

// Manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;
