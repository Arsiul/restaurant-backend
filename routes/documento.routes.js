import { Router } from "express"
import DocumentoController from "../controllers/DocumentoController.js"
import { requireAuth, requireModulo } from "../middlewares/auth.js"
import { uploadDocumento } from "../middlewares/upload.js"
import { DOCUMENTOS } from "../utils/modulos.js"

const router = Router()

router.use(requireAuth, requireModulo(DOCUMENTOS))

router.get("/", DocumentoController.listar)
router.post("/", uploadDocumento.single("file"), DocumentoController.subir)
router.get("/:id/enlace", DocumentoController.enlace)
router.patch("/:id", DocumentoController.actualizar)
router.delete("/:id", DocumentoController.eliminar)

export default router
