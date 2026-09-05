import { userClient } from "../config/supabase.js"
import { perfilCompleto } from "../utils/perfil.js"

/**
 * Valida el token contra Supabase y adjunta el perfil a la peticion.
 *
 * El rol y los modulos se leen siempre de la base, nunca de lo que manda
 * el cliente: de otro modo bastaria editar el localStorage para ser
 * administrador.
 */
export const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || ""

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sesion no valida" })
  }

  const token = header.slice(7).trim()

  if (!token) {
    return res.status(401).json({ error: "Sesion no valida" })
  }

  try {
    const { data, error } = await userClient(token).auth.getUser()

    if (error || !data.user) {
      return res.status(401).json({ error: "Sesion expirada. Vuelve a iniciar sesion" })
    }

    const perfil = await perfilCompleto(data.user.id, token)

    if (!perfil) {
      return res.status(403).json({ error: "El usuario no tiene un perfil asignado" })
    }

    // La plataforma da de baja una cuenta sin borrarla. Una sesion abierta
    // no deberia sobrevivir a eso.
    if (perfil.activo === false) {
      return res.status(403).json({ error: "Tu cuenta esta desactivada. Consulta con el administrador" })
    }

    req.token = token
    req.user = perfil
    next()
  } catch (error) {
    res.status(401).json({ error: "Sesion no valida" })
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Esta seccion es solo para administradores" })
  }
  next()
}

/**
 * Exige acceso a un modulo concreto. Es la misma condicion que aplican las
 * funciones empresa_* dentro de la base, para que ninguna via quede mas
 * abierta que la otra.
 */
export const requireModulo = (clave) => (req, res, next) => {
  if (req.user.modulos.includes(clave)) return next()

  res.status(403).json({ error: "No tienes acceso a este modulo" })
}

/** Para lo que sirve a mas de un modulo, como el listado de archivos. */
export const requireAlgunModulo = (...claves) => (req, res, next) => {
  if (claves.some((clave) => req.user.modulos.includes(clave))) return next()

  res.status(403).json({ error: "No tienes acceso a este modulo" })
}
