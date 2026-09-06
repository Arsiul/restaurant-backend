import { adminClient } from "../config/supabase.js"
import { ARCHIVOS, COMPARAR } from "../utils/modulos.js"

const LOTE = 500

const CAMPOS =
  "id,archivo,empresa,es_propia,formato,columnas,total_filas,tabla_fisica,huella,user_id,created_at"

/**
 * Acceso a las importaciones. Usa el cliente de servicio porque el
 * controlador ya resolvio el rol: el administrador debe poder leer los
 * archivos de todos los trabajadores, y RLS por si sola no distingue eso
 * sin reenviar el token en cada llamada.
 */
class ImportModel {
  constructor(user) {
    this.user = user
    this.db = adminClient()
  }

  /**
   * Quien revisa o compara necesita ver los archivos de todos; quien solo
   * importa ve los suyos. El alcance sale del modulo y ya no del rol, asi
   * un trabajador con "Archivos cargados" concedido revisa igual que un
   * administrador, que es justamente para lo que sirve repartir modulos.
   */
  aplicarAlcance(query) {
    const suyos = this.user.modulos || []

    if (suyos.includes(ARCHIVOS) || suyos.includes(COMPARAR)) return query

    return query.eq("user_id", this.user.id)
  }

  async listar({ soloPropias = null } = {}) {
    let query = this.db.from("imports").select(CAMPOS).order("created_at", { ascending: false })

    query = this.aplicarAlcance(query)

    if (soloPropias === true) query = query.eq("es_propia", true)
    if (soloPropias === false) query = query.eq("es_propia", false)

    const { data, error } = await query
    if (error) throw error

    return data
  }

  async buscar(id) {
    const { data, error } = await this.aplicarAlcance(
      this.db.from("imports").select(CAMPOS).eq("id", id)
    ).maybeSingle()

    if (error) throw error
    return data
  }

  /**
   * Busca una importacion con el mismo contenido.
   *
   * No se limita a lo que ve quien pregunta: si otra persona ya cargo ese
   * archivo, sigue siendo un duplicado. Acotarlo por usuario permitiria
   * que el mismo dato entrara tantas veces como trabajadores haya.
   */
  async buscarPorHuella(huella) {
    if (!huella) return null

    const { data, error } = await this.db
      .from("imports")
      .select(CAMPOS)
      .eq("huella", huella)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async crear(datos) {
    const { data, error } = await this.db
      .from("imports")
      .insert({ ...datos, user_id: this.user.id })
      .select(CAMPOS)
      .single()

    if (error) throw error
    return data
  }

  /** Inserta por lotes: un archivo de 20 mil filas no entra en un solo insert. */
  async guardarFilas(importId, filas) {
    for (let i = 0; i < filas.length; i += LOTE) {
      const lote = filas.slice(i, i + LOTE).map((data, indice) => ({
        import_id: importId,
        fila: i + indice + 1,
        data
      }))

      const { error } = await this.db.from("import_rows").insert(lote)
      if (error) throw error
    }

    return filas.length
  }

  async filas(importId, { limite = null, desde = 0 } = {}) {
    let query = this.db
      .from("import_rows")
      .select("fila,data")
      .eq("import_id", importId)
      .order("fila", { ascending: true })

    if (limite) query = query.range(desde, desde + limite - 1)

    const { data, error } = await query
    if (error) throw error

    return data.map((registro) => registro.data)
  }

  async contarFilas(importId) {
    const { count, error } = await this.db
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId)

    if (error) throw error
    return count || 0
  }

  /**
   * Elimina la importacion, sus filas y lo que se volco a la tabla de la
   * empresa.
   *
   * `import_rows` cae sola por la clave foranea, pero `empresa_datos` no:
   * esa tabla la crea la funcion que materializa y no tiene clave foranea
   * contra `imports`. Sin este barrido quedarian filas que ya no se pueden
   * rastrear hasta ningun archivo.
   */
  async eliminar(id, tablaFisica = null) {
    let materializadas = 0

    // El nombre sale de la base y solo lo escribe empresa_materializar,
    // pero igual se valida: va directo a la consulta.
    const valida = tablaFisica === "empresa_datos" || /^emp_[a-z0-9_]+$/.test(tablaFisica || "")

    if (tablaFisica && valida) {
      const { count, error } = await this.db
        .from(tablaFisica)
        .delete({ count: "exact" })
        .eq("import_id", id)

      // 42P01 es que la tabla ya no existe. No es un fallo para lo que se
      // esta haciendo: si no esta, no hay nada que limpiar.
      if (error && error.code !== "42P01") throw error

      materializadas = count || 0
    }

    const { error } = await this.db.from("imports").delete().eq("id", id)
    if (error) throw error

    return { materializadas }
  }

  async actualizar(id, datos) {
    const { data, error } = await this.db
      .from("imports")
      .update(datos)
      .eq("id", id)
      .select(CAMPOS)
      .single()

    if (error) throw error
    return data
  }

  /** Perfiles de los trabajadores, para mostrar quien cargo cada archivo. */
  async autores(ids) {
    if (ids.length === 0) return {}

    const { data, error } = await this.db
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids)

    if (error) throw error

    const mapa = {}
    data.forEach((perfil) => {
      mapa[perfil.id] = perfil.full_name || perfil.email
    })

    return mapa
  }
}

export default ImportModel
