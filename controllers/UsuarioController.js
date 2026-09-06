import UsuarioModel from "../models/UsuarioModel.js"
import { sendError } from "../utils/apiError.js"
import ErpModel from "../models/ErpModel.js"
import { aUsuario, correoDe } from "../utils/dominio.js"

const ROLES = ["admin", "trabajador"]

const CLAVE_MINIMA = 8

const lista = (valor) => (Array.isArray(valor) ? [...new Set(valor)] : [])

const traducir = (mensaje = "") => {
  if (mensaje.includes("already been registered") || mensaje.includes("already registered")) {
    return "Ese usuario ya tiene una cuenta"
  }
  if (mensaje.includes("Password")) return `La contrasena debe tener al menos ${CLAVE_MINIMA} caracteres`
  return mensaje || "No se pudo completar la operacion"
}

/**
 * Modulo de usuarios del administrador. Todas las rutas ya pasaron por
 * requireAdmin, asi que aqui solo queda validar los datos y evitar que un
 * administrador se deje a si mismo fuera del sistema.
 */
class UsuarioController {
  /** GET /api/usuarios */
  async listar(req, res) {
    try {
      const model = new UsuarioModel(req.user)
      const cuentas = await model.listar()

      const erp = new ErpModel(req.user)
      const estructura = await erp.estructura()
      const reparto = await erp.resumenTodos()

      const todosCursos = estructura.map((curso) => curso.id)
      const todasClaves = estructura.flatMap((curso) => curso.modulos.map((m) => m.clave))

      res.json(
        cuentas.map((perfil) => {
          // El administrador pasa por encima del reparto, igual que en la
          // base: mostrarle casillas sueltas seria mentir sobre lo que ve.
          const asignado = reparto[perfil.id] || { cursos: [], modulos: [] }

          const suyo =
            perfil.role === "admin" ? { cursos: todosCursos, modulos: todasClaves } : asignado

          // `asignado` va aparte de lo efectivo: para un administrador lo
          // efectivo es todo, y el panel necesita saber que le quedaria si
          // dejara de serlo. Sin eso no puede avisar de que va a quedarse
          // sin acceso a nada.
          return { ...perfil, esYo: perfil.id === req.user.id, ...suyo, asignado }
        })
      )
    } catch (error) {
      sendError(res, error)
    }
  }

  /** POST /api/usuarios */
  async crear(req, res) {
    const usuario = aUsuario(req.body.usuario)
    const fullName = String(req.body.fullName || "").trim()
    const password = String(req.body.password || "")
    const role = ROLES.includes(req.body.role) ? req.body.role : "trabajador"
    const empresa = String(req.body.empresa || "").trim() || req.user.empresa

    // Por defecto nace sin nada: pertenecer no da acceso a nada por si
    // solo. Si el formulario marco algo, se aplica al terminar el alta.
    const cursos = lista(req.body.cursos)
    const modulos = lista(req.body.modulos)

    if (!usuario) {
      return res.status(400).json({ error: "Indica el usuario con el que va a iniciar sesion" })
    }

    if (!fullName) {
      return res.status(400).json({ error: "El nombre completo es obligatorio" })
    }

    if (password.length < CLAVE_MINIMA) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${CLAVE_MINIMA} caracteres` })
    }

    try {
      const model = new UsuarioModel(req.user)

      if (await model.usuarioTomado(usuario)) {
        return res.status(409).json({ error: `El usuario "${usuario}" ya esta tomado` })
      }

      const perfil = await model.crear({
        email: correoDe(usuario),
        password,
        usuario,
        fullName,
        role,
        empresa
      })

      if (perfil.role !== "admin" && (cursos.length > 0 || modulos.length > 0)) {
        await new ErpModel(req.user).asignar(perfil.id, { cursos, modulos })
      }

      res.json(perfil)
    } catch (error) {
      if (error.status === 422 || error.code === "email_exists" || error.message) {
        return res.status(400).json({ error: traducir(error.message) })
      }
      sendError(res, error)
    }
  }

  /** PATCH /api/usuarios/:id  -> nombre, rol o empresa */
  async actualizar(req, res) {
    const id = req.params.id
    const datos = {}

    if (req.body.fullName !== undefined) datos.full_name = String(req.body.fullName).trim()
    if (req.body.empresa !== undefined) datos.empresa = String(req.body.empresa).trim()

    if (req.body.role !== undefined) {
      if (!ROLES.includes(req.body.role)) {
        return res.status(400).json({ error: "El rol indicado no existe" })
      }

      // Quitarse el rol a uno mismo deja el panel sin quien lo administre.
      if (id === req.user.id && req.body.role !== req.user.role) {
        return res.status(400).json({ error: "No puedes cambiarte el rol a ti mismo" })
      }

      datos.role = req.body.role
    }

    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: "No hay nada que actualizar" })
    }

    try {
      const model = new UsuarioModel(req.user)
      res.json(await model.actualizar(id, datos))
    } catch (error) {
      sendError(res, error)
    }
  }

  /** POST /api/usuarios/:id/clave  -> el admin restablece la contrasena */
  async clave(req, res) {
    const password = String(req.body.password || "")

    if (password.length < CLAVE_MINIMA) {
      return res
        .status(400)
        .json({ error: `La contrasena debe tener al menos ${CLAVE_MINIMA} caracteres` })
    }

    try {
      const model = new UsuarioModel(req.user)
      const perfil = await model.buscar(req.params.id)

      if (!perfil) return res.status(404).json({ error: "El usuario no existe" })

      await model.cambiarClave(perfil.id, password)
      res.json({ actualizada: true })
    } catch (error) {
      sendError(res, error)
    }
  }

  /** GET /api/usuarios/catalogo  -> el ERP entero, para armar el formulario */
  async catalogo(req, res) {
    try {
      res.json(await new ErpModel(req.user).estructura())
    } catch (error) {
      sendError(res, error)
    }
  }

  /**
   * PUT /api/usuarios/:id/modulos  { cursos: [id], modulos: [clave] }
   *
   * Deja a la persona exactamente con eso: a que modulos del ERP entra, y
   * que pantallas ve dentro de cada uno. Marcar todo un modulo equivale a
   * concederlo completo, sin ir pantalla por pantalla.
   */
  async asignarModulos(req, res) {
    const cursos = lista(req.body.cursos)
    const modulos = lista(req.body.modulos)

    try {
      const model = new UsuarioModel(req.user)
      const perfil = await model.buscar(req.params.id)

      if (!perfil) return res.status(404).json({ error: "El usuario no existe" })

      if (perfil.role === "admin") {
        return res.status(400).json({
          error: "Un administrador ya entra a todo el ERP por su rol. No hace falta asignarle nada"
        })
      }

      const aplicado = await new ErpModel(req.user).asignar(perfil.id, { cursos, modulos })

      res.json({ id: perfil.id, ...aplicado })
    } catch (error) {
      sendError(res, error)
    }
  }

  /** DELETE /api/usuarios/:id */
  async eliminar(req, res) {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" })
    }

    try {
      const model = new UsuarioModel(req.user)
      const perfil = await model.buscar(req.params.id)

      if (!perfil) return res.status(404).json({ error: "El usuario no existe" })

      await model.eliminar(perfil.id)
      res.json({ eliminado: true })
    } catch (error) {
      sendError(res, error)
    }
  }
}

const controller = new UsuarioController()

export default {
  listar: controller.listar.bind(controller),
  crear: controller.crear.bind(controller),
  actualizar: controller.actualizar.bind(controller),
  clave: controller.clave.bind(controller),
  eliminar: controller.eliminar.bind(controller),
  catalogo: controller.catalogo.bind(controller),
  asignarModulos: controller.asignarModulos.bind(controller)
}
