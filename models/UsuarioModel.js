import { adminClient } from "../config/supabase.js"

const CAMPOS = "id,email,usuario,full_name,role,empresa,created_at"

/**
 * Alta y mantenimiento de las cuentas, desde el panel del administrador.
 *
 * Usa la Admin API de Supabase: la cuenta nace ya confirmada, sin codigo
 * de verificacion, porque quien la crea es alguien de confianza que ya
 * demostro su rol en el servidor. El registro publico sigue existiendo y
 * ese si pasa por el correo.
 */
class UsuarioModel {
  constructor(user) {
    this.user = user
    this.db = adminClient()
  }

  async listar() {
    const { data, error } = await this.db
      .from("profiles")
      .select(CAMPOS)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data
  }

  async buscar(id) {
    const { data, error } = await this.db.from("profiles").select(CAMPOS).eq("id", id).maybeSingle()

    if (error) throw error
    return data
  }

  /**
   * true si el usuario corto ya esta tomado por otra cuenta.
   *
   * La comparacion es exacta y no `ilike`: el guion bajo es un comodin de
   * LIKE, asi que "j_perez" daria por tomado un "jxperez" que no tiene nada
   * que ver. Todos los usuarios se guardan en minuscula, de modo que `eq`
   * ya cubre el caso insensible.
   */
  async usuarioTomado(usuario, exceptoId = null) {
    let query = this.db.from("profiles").select("id").eq("usuario", String(usuario).toLowerCase())

    if (exceptoId) query = query.neq("id", exceptoId)

    const { data, error } = await query.limit(1)
    if (error) throw error

    return data.length > 0
  }

  /**
   * Crea la cuenta y le deja el perfil listo. El trigger de la base ya
   * inserta la fila en profiles con el usuario que viaja en la metadata;
   * aqui solo se completan rol y empresa, que el trigger no toca a
   * proposito para que nadie se autoproclame administrador al registrarse.
   */
  async crear({ email, password, usuario, fullName, role, empresa }) {
    const { data, error } = await this.db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, usuario }
    })

    if (error) throw error

    const { data: perfil, error: fallo } = await this.db
      .from("profiles")
      .update({ full_name: fullName, usuario, role, empresa })
      .eq("id", data.user.id)
      .select(CAMPOS)
      .single()

    if (fallo) {
      // Sin perfil la cuenta no sirve para nada y quedaria ocupando el
      // correo, asi que se deshace el alta.
      await this.db.auth.admin.deleteUser(data.user.id)
      throw fallo
    }

    return perfil
  }

  async actualizar(id, datos) {
    const { data, error } = await this.db
      .from("profiles")
      .update(datos)
      .eq("id", id)
      .select(CAMPOS)
      .single()

    if (error) throw error
    return data
  }

  /**
   * Cambio de clave hecho por el administrador. Es la salida cuando el
   * correo de la empresa no recibe mensajes y la recuperacion por codigo
   * no llega a ninguna bandeja.
   */
  async cambiarClave(id, password) {
    const { error } = await this.db.auth.admin.updateUserById(id, { password })
    if (error) throw error
    return true
  }

  async eliminar(id) {
    // profiles, imports y tareas caen por la clave foranea contra auth.users
    const { error } = await this.db.auth.admin.deleteUser(id)
    if (error) throw error
    return true
  }
}

export default UsuarioModel
