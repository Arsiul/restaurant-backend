import AuthModel from "../models/AuthModel.js"
import { perfilCompleto } from "../utils/perfil.js"
import { correoDe, usuarioDe, esCorreoDeLaEmpresa, errorDeDominio, DOMINIO } from "../utils/dominio.js"

const CLAVE_MINIMA = 8

const messages = {
  "Invalid login credentials": "Usuario o contrasena incorrectos",
  "Email not confirmed": "Tu cuenta aun no esta verificada",
  "User already registered": "Ese usuario ya tiene una cuenta",
  "already been registered": "Ese usuario ya tiene una cuenta",
  "Token has expired or is invalid": "El codigo expiro o no es valido",
  "Email rate limit exceeded": "Demasiados correos enviados. Espera unos minutos",
  "For security purposes": "Espera unos segundos antes de solicitar otro codigo",
  "New password should be different": "La nueva contrasena debe ser distinta de la anterior"
}

const translate = (text = "") => {
  const key = Object.keys(messages).find((item) => text.includes(item))
  return key ? messages[key] : "Ocurrio un error. Intenta nuevamente"
}

/**
 * El correo de acceso se arma con el usuario y el dominio de la empresa:
 * "jperez" entra como jperez@rimberio.com. Tambien se acepta el correo
 * completo, que es lo que escribe casi todo el mundo.
 *
 * El dominio se exige solo al crear la cuenta (`exigirDominio`). Al
 * autenticar no se valida: hacerlo dejaria fuera a las cuentas anteriores
 * a esta regla, y no aporta nada, porque un correo que no existe lo
 * rechaza Supabase igual.
 */
const correoDeEntrada = (valor, { exigirDominio = false } = {}) => {
  const texto = String(valor || "").trim()

  if (!texto) return { error: "Indica tu usuario" }

  if (texto.includes("@")) {
    if (exigirDominio && !esCorreoDeLaEmpresa(texto)) return { error: errorDeDominio() }
    return { email: texto.toLowerCase() }
  }

  const email = correoDe(texto)

  if (!email) return { error: "El usuario solo admite letras, numeros, punto y guion bajo" }

  return { email }
}

/**
 * El rol y los modulos viven en la base, no en el token. Se adjuntan a la
 * respuesta del login para que el frontend sepa que dibujar, pero cada
 * peticion posterior los vuelve a resolver en el servidor.
 */
const perfilDe = (userId, token) => perfilCompleto(userId, token)

class AuthController {
  async register(req, res) {
    const { password, fullName } = req.body
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email, {
      exigirDominio: true
    })

    if (fallo) return res.status(400).json({ error: fallo })

    if (!password) {
      return res.status(400).json({ error: "La contrasena es obligatoria" })
    }

    if (password.length < CLAVE_MINIMA) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${CLAVE_MINIMA} caracteres` })
    }

    try {
      const model = new AuthModel()
      const data = await model.register(email, password, fullName || "", usuarioDe(email))

      if (data.session) {
        const perfil = await perfilDe(data.user.id, data.session.access_token)
        return res.json({ verified: true, token: data.session.access_token, user: data.user, perfil })
      }

      res.json({ verified: false, email })
    } catch (error) {
      res.status(400).json({ error: translate(error.message) })
    }
  }

  async verify(req, res) {
    const { token } = req.body
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email)

    if (fallo) return res.status(400).json({ error: fallo })

    if (!token) {
      return res.status(400).json({ error: "El codigo es obligatorio" })
    }

    try {
      const model = new AuthModel()
      const data = await model.verify(email, token)
      const perfil = await perfilDe(data.user.id, data.session.access_token)

      res.json({ token: data.session.access_token, user: data.user, perfil })
    } catch (error) {
      res.status(400).json({ error: translate(error.message) })
    }
  }

  async resend(req, res) {
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email)

    if (fallo) return res.status(400).json({ error: fallo })

    try {
      const model = new AuthModel()
      await model.resend(email)
      res.json({ sent: true })
    } catch (error) {
      res.status(400).json({ error: translate(error.message) })
    }
  }

  async login(req, res) {
    const { password } = req.body
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email)

    if (fallo) return res.status(400).json({ error: fallo })

    if (!password) {
      return res.status(400).json({ error: "La contrasena es obligatoria" })
    }

    try {
      const model = new AuthModel()
      const data = await model.login(email, password)
      const perfil = await perfilDe(data.user.id, data.session.access_token)

      res.json({ token: data.session.access_token, user: data.user, perfil })
    } catch (error) {
      const pending = error.message.includes("Email not confirmed")
      res.status(400).json({ error: translate(error.message), pending, email: pending ? email : undefined })
    }
  }

  /**
   * POST /api/auth/recuperar
   * Manda el codigo al correo de la cuenta. Responde siempre lo mismo:
   * decir si el usuario existe convertiria esta ruta en un directorio
   * de cuentas para cualquiera.
   */
  async recuperar(req, res) {
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email)

    if (fallo) return res.status(400).json({ error: fallo })

    try {
      const model = new AuthModel()
      await model.recuperar(email)
    } catch (error) {
      if (String(error.message || "").includes("rate limit")) {
        return res.status(400).json({ error: translate(error.message) })
      }
    }

    res.json({ sent: true, email })
  }

  /** POST /api/auth/clave  -> canjea el codigo y fija la contrasena nueva */
  async clave(req, res) {
    const { token, password } = req.body
    const { email, error: fallo } = correoDeEntrada(req.body.usuario || req.body.email)

    if (fallo) return res.status(400).json({ error: fallo })

    if (!token) return res.status(400).json({ error: "Ingresa el codigo que llego a tu correo" })

    if (!password || password.length < CLAVE_MINIMA) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${CLAVE_MINIMA} caracteres` })
    }

    try {
      const model = new AuthModel()
      await model.cambiarClave(email, token, password)
      res.json({ actualizada: true })
    } catch (error) {
      res.status(400).json({ error: translate(error.message) })
    }
  }

  /** GET /api/auth/me  -> el perfil vigente segun la base */
  async me(req, res) {
    res.json({ perfil: req.user })
  }

  /** GET /api/auth/dominio  -> lo consulta la pantalla de inicio de sesion */
  async dominio(req, res) {
    res.json({ dominio: DOMINIO })
  }
}

export default new AuthController()
