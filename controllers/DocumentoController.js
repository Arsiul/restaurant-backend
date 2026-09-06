import DocumentoModel from "../models/DocumentoModel.js"
import ErpModel from "../models/ErpModel.js"
import { sendError } from "../utils/apiError.js"
import { CURSO_DOCUMENTOS } from "../utils/modulos.js"

/**
 * Documentacion del curso. Todo lo que llega aqui ya paso por
 * requireModulo, asi que solo queda validar el archivo y el destino.
 */
class DocumentoController {
  /** El curso al que pertenece este modulo, resuelto una sola vez. */
  async curso(user) {
    const estructura = await new ErpModel(user).estructura()

    return estructura.find((c) => c.modulos.some((m) => m.clave === CURSO_DOCUMENTOS)) || null
  }

  /** GET /api/documentos */
  async listar(req, res) {
    try {
      const curso = await this.curso(req.user)

      if (!curso) return res.status(404).json({ error: "El modulo no esta registrado en ningun curso" })

      const model = new DocumentoModel(req.user)

      res.json({
        curso: { id: curso.id, nombre: curso.nombre },
        // Los modulos del curso sirven para clasificar: un documento puede
        // quedar general o colgar de uno concreto.
        modulos: curso.modulos.map((m) => ({ id: m.id, nombre: m.nombre })),
        documentos: await model.listar(curso.id)
      })
    } catch (error) {
      sendError(res, error)
    }
  }

  /** POST /api/documentos  (multipart: file + moduloId + descripcion) */
  async subir(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: "Selecciona un documento" })
    }

    try {
      const curso = await this.curso(req.user)

      if (!curso) return res.status(404).json({ error: "El modulo no esta registrado en ningun curso" })

      // Un documento puede quedar general del curso. Si se indica modulo,
      // tiene que ser uno de este curso: la base lo valida igual, pero un
      // 400 explicado se lee mejor que la excepcion del trigger.
      let moduloId = null

      if (req.body.moduloId && req.body.moduloId !== "general") {
        moduloId = Number(req.body.moduloId)

        if (!curso.modulos.some((m) => m.id === moduloId)) {
          return res.status(400).json({ error: "El modulo indicado no pertenece a este curso" })
        }
      }

      const model = new DocumentoModel(req.user)

      const documento = await model.crear({
        cursoId: curso.id,
        moduloId,
        archivo: req.file,
        descripcion: String(req.body.descripcion || "").trim().slice(0, 500)
      })

      res.json(documento)
    } catch (error) {
      if (String(error.message || "").includes("EL_MODULO_NO_PERTENECE_AL_CURSO")) {
        return res.status(400).json({ error: "El modulo indicado no pertenece a este curso" })
      }
      sendError(res, error)
    }
  }

  /** GET /api/documentos/:id/enlace  -> url firmada para verlo */
  async enlace(req, res) {
    try {
      const model = new DocumentoModel(req.user)
      const documento = await model.buscar(req.params.id)

      if (!documento || !documento.activo) {
        return res.status(404).json({ error: "El documento no existe" })
      }

      res.json(await model.urlFirmada(documento))
    } catch (error) {
      sendError(res, error)
    }
  }

  /** PATCH /api/documentos/:id  -> descripcion o clasificacion */
  async actualizar(req, res) {
    const datos = {}

    if (req.body.descripcion !== undefined) {
      datos.descripcion = String(req.body.descripcion).trim().slice(0, 500) || null
    }

    if (req.body.moduloId !== undefined) {
      datos.modulo_id =
        req.body.moduloId && req.body.moduloId !== "general" ? Number(req.body.moduloId) : null
    }

    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: "No hay nada que actualizar" })
    }

    try {
      const model = new DocumentoModel(req.user)
      const documento = await model.buscar(req.params.id)

      if (!documento) return res.status(404).json({ error: "El documento no existe" })

      res.json(await model.actualizar(documento.id, datos))
    } catch (error) {
      if (String(error.message || "").includes("EL_MODULO_NO_PERTENECE_AL_CURSO")) {
        return res.status(400).json({ error: "El modulo indicado no pertenece a este curso" })
      }
      sendError(res, error)
    }
  }

  /** DELETE /api/documentos/:id */
  async eliminar(req, res) {
    try {
      const model = new DocumentoModel(req.user)
      const documento = await model.buscar(req.params.id)

      if (!documento) return res.status(404).json({ error: "El documento no existe" })

      await model.eliminar(documento)
      res.json({ eliminado: true })
    } catch (error) {
      sendError(res, error)
    }
  }
}

const controller = new DocumentoController()

export default {
  listar: controller.listar.bind(controller),
  subir: controller.subir.bind(controller),
  enlace: controller.enlace.bind(controller),
  actualizar: controller.actualizar.bind(controller),
  eliminar: controller.eliminar.bind(controller)
}
