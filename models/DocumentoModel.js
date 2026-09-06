import { randomUUID } from "node:crypto"
import { adminClient } from "../config/supabase.js"
import { normalizeName } from "../utils/normalize.js"

const BUCKET = "documentos-cursos"

const CAMPOS =
  "id,curso_id,modulo_id,user_id,nombre_original,nombre_archivo,extension," +
  "mime_type,tamano_bytes,storage_bucket,storage_path,descripcion,created_at"

/** Segundos que vive el enlace de previsualizacion. */
const VIGENCIA = 300

/**
 * Documentacion de respaldo del curso.
 *
 * Se apoya en infraestructura que ya existia: el bucket privado
 * `documentos-cursos` y la tabla `documentos_curso`. Ninguno de los dos se
 * modifica desde aqui, solo se usan.
 *
 * Todo pasa por la clave de servicio, y no por eleccion: la tabla tiene RLS
 * activo y ninguna politica, y el bucket tampoco tiene politicas, asi que
 * ningun token de usuario llega a ellos. El control de acceso lo hace el
 * middleware del modulo antes de entrar aqui.
 */
class DocumentoModel {
  constructor(user) {
    this.user = user
    this.db = adminClient()
  }

  /** Los documentos vivos de un curso, con quien los subio. */
  async listar(cursoId) {
    const { data, error } = await this.db
      .from("documentos_curso")
      .select(CAMPOS)
      .eq("curso_id", cursoId)
      .eq("activo", true)
      .order("created_at", { ascending: false })

    if (error) throw error

    const autores = await this.autores([...new Set((data || []).map((d) => d.user_id))])

    return (data || []).map((doc) => ({ ...doc, autor: autores[doc.user_id] || "Desconocido" }))
  }

  async buscar(id) {
    const { data, error } = await this.db
      .from("documentos_curso")
      .select(CAMPOS + ",activo")
      .eq("id", id)
      .maybeSingle()

    if (error) throw error
    return data
  }

  /**
   * Sube el archivo y deja su ficha.
   *
   * Se guarda primero en el bucket y despues la fila. Si la fila fallara,
   * el archivo se retira: es preferible perder la subida a dejar en el
   * bucket algo que nadie va a poder encontrar ni borrar nunca.
   */
  async crear({ cursoId, moduloId, archivo, descripcion }) {
    const extension = (archivo.originalname.split(".").pop() || "").toLowerCase()
    const nombreArchivo = `${this.identificador(archivo.originalname)}-${randomUUID()}.${extension}`
    const carpeta = moduloId ? `modulo-${moduloId}` : "general"
    const ruta = `curso-${cursoId}/${carpeta}/${nombreArchivo}`

    const { error: fallo } = await this.db.storage
      .from(BUCKET)
      .upload(ruta, archivo.buffer, { contentType: archivo.mimetype, upsert: false })

    if (fallo) throw fallo

    const { data, error } = await this.db
      .from("documentos_curso")
      .insert({
        curso_id: cursoId,
        modulo_id: moduloId,
        user_id: this.user.id,
        nombre_original: archivo.originalname,
        nombre_archivo: nombreArchivo,
        extension,
        mime_type: archivo.mimetype,
        tamano_bytes: archivo.size,
        storage_bucket: BUCKET,
        storage_path: ruta,
        descripcion: descripcion || null
      })
      .select(CAMPOS)
      .single()

    if (error) {
      await this.db.storage.from(BUCKET).remove([ruta])
      throw error
    }

    return data
  }

  async actualizar(id, datos) {
    const { data, error } = await this.db
      .from("documentos_curso")
      .update(datos)
      .eq("id", id)
      .select(CAMPOS)
      .single()

    if (error) throw error
    return data
  }

  /** Enlace temporal para ver el archivo. El bucket es privado. */
  async urlFirmada(documento) {
    const { data, error } = await this.db.storage
      .from(documento.storage_bucket || BUCKET)
      .createSignedUrl(documento.storage_path, VIGENCIA)

    if (error) throw error

    return { url: data.signedUrl, expiraEn: VIGENCIA }
  }

  /**
   * Borra el archivo y su ficha.
   *
   * Se elimina de verdad y no con `activo = false`: apagar la fila deja el
   * archivo ocupando el bucket sin que nadie pueda volver a verlo ni
   * borrarlo, y eso se acumula.
   */
  async eliminar(documento) {
    const { error: fallo } = await this.db.storage
      .from(documento.storage_bucket || BUCKET)
      .remove([documento.storage_path])

    if (fallo) throw fallo

    const { error } = await this.db.from("documentos_curso").delete().eq("id", documento.id)
    if (error) throw error

    return true
  }

  async autores(ids) {
    if (ids.length === 0) return {}

    const { data, error } = await this.db
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids)

    if (error) throw error

    const mapa = {}
    ;(data || []).forEach((perfil) => {
      mapa[perfil.id] = perfil.full_name || perfil.email
    })

    return mapa
  }

  /** "21.anexo_hh.docx" -> "21-anexo_hh", como los que ya estan guardados. */
  identificador(nombre) {
    const base = nombre.replace(/\.[^.]+$/, "")

    return (
      normalizeName(base)
        .replace(/[^a-z0-9_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "documento"
    )
  }
}

export default DocumentoModel
