import { Router } from "express"
import UsuarioController from "../controllers/UsuarioController.js"
import { requireAuth, requireAdmin } from "../middlewares/auth.js"

const router = Router()

// Crear cuentas y repartir accesos es potestad exclusiva del administrador.
router.use(requireAuth, requireAdmin)

router.get("/catalogo", UsuarioController.catalogo)
router.get("/", UsuarioController.listar)
router.post("/", UsuarioController.crear)
router.patch("/:id", UsuarioController.actualizar)
router.post("/:id/clave", UsuarioController.clave)
router.put("/:id/modulos", UsuarioController.asignarModulos)
router.delete("/:id", UsuarioController.eliminar)

export default router
