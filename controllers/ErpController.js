import ErpModel from "../models/ErpModel.js"
import { sendError } from "../utils/apiError.js"

class ErpController {
  /**
   * GET /api/erp
   * Los cuatro modulos del ERP con sus pantallas, anotados con lo que
   * puede ver quien pregunta. Es lo que dibuja la pantalla de inicio.
   */
  async estructura(req, res) {
    try {
      const model = new ErpModel(req.user)
      res.json(await model.paraUsuario(req.user))
    } catch (error) {
      sendError(res, error)
    }
  }
}

const controller = new ErpController()

export default {
  estructura: controller.estructura.bind(controller)
}
