import { Router } from "express"
import CompararController from "../controllers/CompararController.js"
import { requireAuth, requireModulo } from "../middlewares/auth.js"
import { COMPARAR } from "../utils/modulos.js"

const router = Router()

router.use(requireAuth, requireModulo(COMPARAR))

router.post("/", CompararController.comparar)

export default router
