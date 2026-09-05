import { publicClient, userClient } from "../config/supabase.js"

class AuthModel {
  constructor() {
    this.db = publicClient()
  }

  async register(email, password, fullName, usuario) {
    const { data, error } = await this.db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, usuario } }
    })

    if (error) throw error
    return data
  }

  async verify(email, token) {
    const { data, error } = await this.db.auth.verifyOtp({
      email,
      token,
      type: "signup"
    })

    if (error) throw error
    return data
  }

  async resend(email) {
    const { error } = await this.db.auth.resend({ type: "signup", email })
    if (error) throw error
    return true
  }

  async login(email, password) {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  /**
   * Envia el codigo de recuperacion. Se usa el mismo mecanismo que la
   * verificacion del registro, con codigo en vez de enlace, para no
   * depender de que la URL de retorno este declarada en el proyecto.
   */
  async recuperar(email) {
    const { error } = await this.db.auth.resetPasswordForEmail(email)
    if (error) throw error
    return true
  }

  /**
   * Canjea el codigo por una sesion y cambia la clave con ella. El codigo
   * de recuperacion es de un solo uso: si es valido, la sesion que emite
   * alcanza para el updateUser y despues se descarta.
   */
  async cambiarClave(email, token, password) {
    const { data, error } = await this.db.auth.verifyOtp({ email, token, type: "recovery" })

    if (error) throw error

    const { error: fallo } = await userClient(data.session.access_token).auth.updateUser({
      password
    })

    if (fallo) throw fallo

    return true
  }
}

export default AuthModel
