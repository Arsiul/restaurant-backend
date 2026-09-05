import { Router } from "express"
import ImportController from "../controllers/ImportController.js"
import { requireAuth, requireModulo, requireAlgunModulo } from "../middlewares/auth.js"
import { upload } from "../middlewares/upload.js"
import { IMPORTAR, ARCHIVOS, COMPARAR } from "../utils/modulos.js"

const router = Router()

router.use(requireAuth)

// Cargar pertenece al modulo de importacion. Consultar sirve a los tres:
// quien importa revisa lo suyo, y quien analiza o compara necesita verlo
// todo. El alcance de cada uno lo decide ImportModel.
router.post("/", requireModulo(IMPORTAR), upload.single("file"), ImportController.subir)

router.get("/", requireAlgunModulo(IMPORTAR, ARCHIVOS, COMPARAR), ImportController.listar)
router.get("/:id", requireAlgunModulo(IMPORTAR, ARCHIVOS, COMPARAR), ImportController.detalle)

// El resumen de un archivo propio es parte de importarlo, no de comparar
router.get(
  "/:id/resumen",
  requireAlgunModulo(IMPORTAR, ARCHIVOS, COMPARAR),
  ImportController.resumen
)
router.delete("/:id", requireAlgunModulo(IMPORTAR, ARCHIVOS), ImportController.eliminar)

export default router
