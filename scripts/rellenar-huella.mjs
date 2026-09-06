import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { huellaDeFilas } from "../utils/huella.js"

/**
 * Calcula la huella de las importaciones anteriores a la migracion 008.
 *
 * Usa la misma funcion que el servidor a proposito: si se calculara en SQL,
 * el valor no coincidiria con el que produce el backend y el control de
 * duplicados no detectaria nada.
 */
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

const { data: pendientes, error } = await db
  .from("imports")
  .select("id,archivo,total_filas")
  .is("huella", null)
  .order("id")

if (error) {
  console.error("No se pudo leer las importaciones:", error.message)
  process.exit(1)
}

if (pendientes.length === 0) {
  console.log("Todas las importaciones ya tienen huella.")
  process.exit(0)
}

console.log(`${pendientes.length} importaciones sin huella\n`)

const vistas = new Map()

for (const importacion of pendientes) {
  const { data: filas, error: fallo } = await db
    .from("import_rows")
    .select("data")
    .eq("import_id", importacion.id)
    .order("fila", { ascending: true })

  if (fallo) {
    console.log(`  ${importacion.id}  ${importacion.archivo}: ${fallo.message}`)
    continue
  }

  const huella = huellaDeFilas(filas.map((f) => f.data))

  await db.from("imports").update({ huella }).eq("id", importacion.id)

  const repetida = vistas.get(huella)
  vistas.set(huella, importacion.id)

  console.log(
    `  ${String(importacion.id).padStart(3)}  ${importacion.archivo.padEnd(34)}` +
      `${huella.slice(0, 12)}` +
      (repetida ? `   <- mismo contenido que la ${repetida}` : "")
  )
}

console.log("\nListo.")
