import { Router } from "express"
import TareaController from "../controllers/TareaController.js"
import { requireAuth, requireModulo } from "../middlewares/auth.js"
import { COMPARAR } from "../utils/modulos.js"

const router = Router()

// Asignar una tarea nace de la comparacion, asi que va con ese modulo. El
// trabajador lee y cierra las suyas desde su propio modulo, contra la base.
router.use(requireAuth, requireModulo(COMPARAR))

router.get("/trabajadores", TareaController.trabajadores)
router.get("/", TareaController.listar)
router.post("/", TareaController.crear)
router.delete("/:id", TareaController.eliminar)

export default router
