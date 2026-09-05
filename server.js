import "dotenv/config"
import express from "express"
import cors from "cors"

import authRoutes from "./routes/auth.routes.js"
import importRoutes from "./routes/import.routes.js"
import compararRoutes from "./routes/comparar.routes.js"
import tareaRoutes from "./routes/tarea.routes.js"
import usuarioRoutes from "./routes/usuario.routes.js"
import erpRoutes from "./routes/erp.routes.js"

const app = express()
const port = process.env.PORT || 4000

const origins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: origins.length > 0 ? origins : true }))
app.use(express.json({ limit: "2mb" }))

app.use("/api/auth", authRoutes)
app.use("/api/imports", importRoutes)
app.use("/api/comparar", compararRoutes)
app.use("/api/tareas", tareaRoutes)
app.use("/api/usuarios", usuarioRoutes)
app.use("/api/erp", erpRoutes)

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" })
})

app.use((req, res) => {
  res.status(404).json({ error: "Recurso no encontrado" })
})

app.use((error, req, res, next) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "El archivo supera los 10 MB permitidos" })
  }

  const mensaje = error.message || "Error interno del servidor"
  const status = mensaje.includes("Formato no permitido") ? 400 : 500

  res.status(status).json({ error: mensaje })
})

app.listen(port, () => {
  console.log(`API disponible en http://localhost:${port}`)
})
