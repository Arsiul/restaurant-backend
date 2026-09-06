import ImportModel from "../models/ImportModel.js"
import Importer from "../utils/Importer.js"
import Comparador from "../utils/Comparador.js"
import Insight from "../utils/Insight.js"
import { huellaDeFilas } from "../utils/huella.js"
import { sendError } from "../utils/apiError.js"

const VISTA_PREVIA = 200

class ImportController {
  /** POST /api/imports  (multipart: file + empresa + esPropia) */
  async subir(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: "Selecciona un archivo CSV o Excel" })
    }

    const empresa = String(req.body.empresa || "").trim()
    const esPropia = String(req.body.esPropia) === "true"

    if (!empresa) {
      return res.status(400).json({ error: "Indica a que restaurante pertenecen los datos" })
    }

    try {
      const { filas, formato } = Importer.leer(req.file.buffer, req.file.originalname)
      const estructura = Importer.analizar(filas)
      const limpias = Importer.sinVacias(Importer.limpiar(filas, estructura))

      if (limpias.length === 0) {
        return res.status(400).json({ error: "El archivo no tiene filas con datos" })
      }

      const model = new ImportModel(req.user)

      // El mismo contenido no se importa dos veces. Se comprueba antes de
      // escribir nada: si no, quedaria la fila creada y el archivo a medio
      // guardar cuando se rechace.
      const huella = huellaDeFilas(limpias)
      const repetida = await model.buscarPorHuella(huella)

      if (repetida) {
        const autores = await model.autores([repetida.user_id])
        const cuando = new Date(repetida.created_at).toLocaleDateString("es-PE")

        return res.status(409).json({
          error:
            `Este archivo ya fue importado el ${cuando} por ` +
            `${autores[repetida.user_id] || "otro usuario"} como "${repetida.archivo}". ` +
            `Si lo necesitas de nuevo, elimina el anterior primero`,
          duplicado: {
            id: repetida.id,
            archivo: repetida.archivo,
            empresa: repetida.empresa,
            fecha: repetida.created_at
          }
        })
      }

      const importacion = await model.crear({
        archivo: req.file.originalname,
        empresa,
        es_propia: esPropia,
        formato,
        columnas: estructura.map((campo) => campo.original),
        total_filas: limpias.length,
        huella
      })

      await model.guardarFilas(importacion.id, limpias)

      // La estructura viaja al frontend porque es el navegador quien crea o
      // amplia empresa_datos, llamando a la funcion RPC empresa_materializar.
      // Este backend no ejecuta DDL.
      res.json({
        importacion,
        estructura,
        resumen: {
          filas: limpias.length,
          columnas: estructura.length,
          formato
        }
      })
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message })
      sendError(res, error)
    }
  }

  /** GET /api/imports?ambito=propias|otras */
  async listar(req, res) {
    try {
      const model = new ImportModel(req.user)

      const ambito = req.query.ambito
      const soloPropias = ambito === "propias" ? true : ambito === "otras" ? false : null

      const lista = await model.listar({ soloPropias })
      const autores = await model.autores([...new Set(lista.map((i) => i.user_id))])

      res.json(
        lista.map((importacion) => ({
          ...importacion,
          autor: autores[importacion.user_id] || "Desconocido"
        }))
      )
    } catch (error) {
      sendError(res, error)
    }
  }

  /** GET /api/imports/:id  -> metadata y las primeras filas para el modal */
  async detalle(req, res) {
    try {
      const model = new ImportModel(req.user)
      const importacion = await model.buscar(req.params.id)

      if (!importacion) {
        return res.status(404).json({ error: "La importacion no existe o no tienes acceso" })
      }

      const desde = Number(req.query.desde) || 0
      const limite = Math.min(Number(req.query.limite) || VISTA_PREVIA, 500)

      const filas = await model.filas(importacion.id, { limite, desde })
      const autores = await model.autores([importacion.user_id])

      res.json({
        importacion: { ...importacion, autor: autores[importacion.user_id] || "Desconocido" },
        filas,
        desde,
        limite
      })
    } catch (error) {
      sendError(res, error)
    }
  }

  /**
   * GET /api/imports/:id/resumen
   *
   * Metricas, series e insights de un solo archivo. Es el mismo analisis
   * que hace /api/comparar en modo individual, expuesto aqui porque
   * pertenece a otra decision: mirar lo que uno acaba de importar es parte
   * de importar, y no deberia exigir el modulo de comparacion.
   */
  async resumen(req, res) {
    try {
      const model = new ImportModel(req.user)
      const importacion = await model.buscar(req.params.id)

      if (!importacion) {
        return res.status(404).json({ error: "La importacion no existe o no tienes acceso" })
      }

      const filas = await model.filas(importacion.id)
      const analisis = Comparador.analizar(importacion, filas)

      res.json({
        empresa: analisis,
        series: Comparador.series(analisis, null),
        insights: Insight.comparar(analisis, null)
      })
    } catch (error) {
      sendError(res, error)
    }
  }

  /** DELETE /api/imports/:id */
  async eliminar(req, res) {
    try {
      const model = new ImportModel(req.user)
      const importacion = await model.buscar(req.params.id)

      if (!importacion) {
        return res.status(404).json({ error: "La importacion no existe o no tienes acceso" })
      }

      const { materializadas } = await model.eliminar(
        importacion.id,
        importacion.tabla_fisica
      )

      res.json({
        eliminado: true,
        archivo: importacion.archivo,
        filas: importacion.total_filas,
        materializadas
      })
    } catch (error) {
      sendError(res, error)
    }
  }
}

const controller = new ImportController()

export default {
  subir: controller.subir.bind(controller),
  listar: controller.listar.bind(controller),
  detalle: controller.detalle.bind(controller),
  resumen: controller.resumen.bind(controller),
  eliminar: controller.eliminar.bind(controller)
}
