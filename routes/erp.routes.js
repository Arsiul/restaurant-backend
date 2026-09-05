import { Router } from "express"
import ErpController from "../controllers/ErpController.js"
import { requireAuth } from "../middlewares/auth.js"

const router = Router()

// Cualquiera con sesion ve la estructura: los modulos a los que no llega
// aparecen apagados, que es informacion, no acceso.
router.use(requireAuth)

router.get("/", ErpController.estructura)

export default router
