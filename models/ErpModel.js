import { adminClient } from "../config/supabase.js"
import { tienePantalla, RUTAS } from "../utils/modulos.js"

/**
 * La estructura del ERP y quien puede entrar a que.
 *
 * El ERP son los `cursos`, y dentro de cada uno estan sus `curso_modulos`.
 * El acceso se reparte en dos niveles, que es como lo resuelve
 * `app_tiene_modulo` dentro de la base:
 *
 *   entrar a un modulo  =  tener el curso  Y  tener ese modulo
 *
 * El administrador entra a todo por su rol y no pasa por el reparto.
 */
class ErpModel {
  constructor(user) {
    this.user = user
    this.db = adminClient()
  }

  /** Los cuatro modulos del ERP con sus pantallas, en orden. */
  async estructura() {
    const { data: cursos, error } = await this.db
      .from("cursos")
      .select("id,nombre,slug,descripcion,orden")
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (error) throw error

    const { data: modulos, error: fallo } = await this.db
      .from("curso_modulos")
      .select("id,curso_id,clave,nombre,slug,descripcion,orden")
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (fallo) throw fallo

    return (cursos || []).map((curso) => ({
      ...curso,
      modulos: (modulos || [])
        .filter((modulo) => modulo.curso_id === curso.id)
        .map((modulo) => ({
          ...modulo,
          ruta: RUTAS[modulo.clave] || null,
          // El plan del curso va por delante de lo construido. Decirlo es
          // mas util que ocultar los que todavia no tienen pantalla.
          disponible: tienePantalla(modulo.clave)
        }))
    }))
  }

  /** Que cursos y que modulos tiene concedidos una persona. */
  async accesosDe(userId) {
    const { data: cursos, error } = await this.db
      .from("usuario_cursos")
      .select("curso_id")
      .eq("user_id", userId)
      .eq("activo", true)

    if (error) throw error

    const { data: modulos, error: fallo } = await this.db
      .from("usuario_modulos")
      .select("modulo_id")
      .eq("user_id", userId)
      .eq("activo", true)

    if (fallo) throw fallo

    return {
      cursos: (cursos || []).map((fila) => fila.curso_id),
      modulos: (modulos || []).map((fila) => fila.modulo_id)
    }
  }

  /**
   * La estructura anotada con lo que puede ver una persona concreta.
   *
   * Es lo que dibuja la pantalla de inicio. Los modulos a los que no llega
   * se muestran apagados y no se esconden: saber que el ERP tiene cuatro
   * partes, aunque solo se entre a una, ubica mejor que ver una sola.
   */
  async paraUsuario(perfil) {
    const estructura = await this.estructura()

    if (perfil.role === "admin") {
      return estructura.map((curso) => ({
        ...curso,
        acceso: true,
        porRol: true,
        modulos: curso.modulos.map((modulo) => ({ ...modulo, acceso: true }))
      }))
    }

    const { cursos, modulos } = await this.accesosDe(perfil.id)

    return estructura.map((curso) => {
      const acceso = cursos.includes(curso.id)

      return {
        ...curso,
        acceso,
        porRol: false,
        modulos: curso.modulos.map((modulo) => ({
          ...modulo,
          // Sin el curso no hay modulo que valga, aunque la fila exista.
          acceso: acceso && modulos.includes(modulo.id)
        }))
      }
    })
  }

  /**
   * Deja a alguien exactamente con los cursos y modulos indicados.
   *
   * Los dos niveles se escriben juntos porque son una sola decision del
   * administrador: a que modulo del ERP entra, y que pantallas ve dentro.
   *
   * Conceder una pantalla implica conceder su modulo del ERP: sin eso la
   * base negaria igual, y el panel estaria mostrando un permiso que en los
   * hechos no existe.
   *
   * Revocar apaga la fila en vez de borrarla, que es para lo que la
   * plataforma puso la columna `activo`: queda el rastro de quien tuvo que.
   */
  async asignar(userId, { cursos = [], modulos = [] }) {
    const estructura = await this.estructura()

    const idsCurso = cursos.map(Number).filter((id) => Number.isFinite(id))
    const clavesModulo = new Set(modulos)

    // Un modulo concedido arrastra a su curso
    estructura.forEach((curso) => {
      const alguno = curso.modulos.some((modulo) => clavesModulo.has(modulo.clave))
      if (alguno && !idsCurso.includes(curso.id)) idsCurso.push(curso.id)
    })

    const filasCurso = estructura.map((curso) => ({
      user_id: userId,
      curso_id: curso.id,
      activo: idsCurso.includes(curso.id),
      asignado_por: this.user.id
    }))

    if (filasCurso.length > 0) {
      const { error } = await this.db
        .from("usuario_cursos")
        .upsert(filasCurso, { onConflict: "user_id,curso_id" })

      if (error) throw error
    }

    const filasModulo = estructura.flatMap((curso) =>
      curso.modulos.map((modulo) => ({
        user_id: userId,
        modulo_id: modulo.id,
        activo: idsCurso.includes(curso.id) && clavesModulo.has(modulo.clave),
        asignado_por: this.user.id
      }))
    )

    if (filasModulo.length > 0) {
      const { error } = await this.db
        .from("usuario_modulos")
        .upsert(filasModulo, { onConflict: "user_id,modulo_id" })

      if (error) throw error
    }

    return this.resumenDe(userId, estructura)
  }

  /** Lo concedido a alguien, para devolverselo al panel. */
  async resumenDe(userId, estructura = null) {
    const arbol = estructura || (await this.estructura())
    const { cursos, modulos } = await this.accesosDe(userId)

    const claves = []

    arbol.forEach((curso) => {
      if (!cursos.includes(curso.id)) return

      curso.modulos.forEach((modulo) => {
        if (modulos.includes(modulo.id)) claves.push(modulo.clave)
      })
    })

    return {
      cursos: arbol.filter((curso) => cursos.includes(curso.id)).map((curso) => curso.id),
      modulos: claves
    }
  }

  /** Lo concedido a todas las cuentas de una vez, para el listado. */
  async resumenTodos() {
    const estructura = await this.estructura()

    const { data: filasCurso, error } = await this.db
      .from("usuario_cursos")
      .select("user_id,curso_id")
      .eq("activo", true)

    if (error) throw error

    const { data: filasModulo, error: fallo } = await this.db
      .from("usuario_modulos")
      .select("user_id,modulo_id")
      .eq("activo", true)

    if (fallo) throw fallo

    const porModuloId = {}
    estructura.forEach((curso) => {
      curso.modulos.forEach((modulo) => {
        porModuloId[modulo.id] = { clave: modulo.clave, cursoId: curso.id }
      })
    })

    const cursosDe = {}
    ;(filasCurso || []).forEach((fila) => {
      if (!cursosDe[fila.user_id]) cursosDe[fila.user_id] = []
      cursosDe[fila.user_id].push(fila.curso_id)
    })

    const modulosDe = {}
    ;(filasModulo || []).forEach((fila) => {
      const modulo = porModuloId[fila.modulo_id]
      if (!modulo) return
      if (!(cursosDe[fila.user_id] || []).includes(modulo.cursoId)) return

      if (!modulosDe[fila.user_id]) modulosDe[fila.user_id] = []
      if (!modulosDe[fila.user_id].includes(modulo.clave)) modulosDe[fila.user_id].push(modulo.clave)
    })

    const salida = {}

    new Set([...Object.keys(cursosDe), ...Object.keys(modulosDe)]).forEach((id) => {
      salida[id] = { cursos: cursosDe[id] || [], modulos: modulosDe[id] || [] }
    })

    return salida
  }
}

export default ErpModel
