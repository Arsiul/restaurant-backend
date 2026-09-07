import { adminClient, userClient } from "../config/supabase.js"
import { modulosDeLaApp } from "./modulos.js"
import { EMPRESA } from "./dominio.js"

const CAMPOS = "id,email,usuario,full_name,role,empresa,activo"

/**
 * Quien es alguien, resuelto en un solo lugar: su perfil y los modulos a
 * los que llega.
 *
 * Los modulos salen de `emp_mis_modulos()`, que lee la capa de cursos de
 * la plataforma. Se invoca con el token de la persona y no con la clave de
 * servicio, porque la funcion resuelve por `auth.uid()`: es la misma via
 * que usan las funciones empresa_* dentro de la base, de modo que lo que
 * decide el servidor y lo que decide Postgres no pueden discrepar.
 */
export const perfilCompleto = async (userId, token) => {
  const { data: perfil } = await adminClient()
    .from("profiles")
    .select(CAMPOS)
    .eq("id", userId)
    .single()

  if (!perfil) return null

  let claves = []

  if (token) {
    const { data } = await userClient(token).rpc("emp_mis_modulos")
    claves = Array.isArray(data) ? data : []
  }

  // La empresa sale de la configuracion y no de la fila: hay cuentas
  // antiguas con el valor por defecto que nadie eligio, y si se devolviera
  // tal cual cada una etiquetaria sus importaciones con un nombre distinto.
  return { ...perfil, empresa: EMPRESA, modulos: modulosDeLaApp(claves) }
}
