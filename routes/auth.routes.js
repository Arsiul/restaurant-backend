import { Router } from "express"
import AuthController from "../controllers/AuthController.js"
import { requireAuth } from "../middlewares/auth.js"

const router = Router()

router.get("/dominio", AuthController.dominio)

router.post("/register", AuthController.register)
router.post("/verify", AuthController.verify)
router.post("/resend", AuthController.resend)
router.post("/login", AuthController.login)

// Recuperacion de contrasena. Mismo mecanismo de codigo que el registro.
router.post("/recuperar", AuthController.recuperar)
router.post("/clave", AuthController.clave)

router.get("/me", requireAuth, AuthController.me)

export default router
