import { createHash } from "node:crypto"

/**
 * Huella del contenido de un archivo importado.
 *
 * Se calcula sobre las filas ya leidas, no sobre los bytes del archivo, y
 * eso es a proposito: el mismo CSV guardado con otra codificacion, con
 * otros saltos de linea o exportado de nuevo desde Excel produce bytes
 * distintos pero los mismos datos. Lo que interesa es si los datos ya
 * estan, no si el fichero es identico.
 *
 * Las claves se ordenan antes de serializar para que dos archivos con las
 * mismas columnas en distinto orden den la misma huella.
 */
const normalizar = (fila) =>
  Object.keys(fila)
    .sort()
    .map((clave) => `${clave}=${String(fila[clave] ?? "").trim()}`)
    .join("\u0001")

export const huellaDeFilas = (filas) =>
  createHash("sha256")
    .update(filas.map(normalizar).join("\u0002"))
    .digest("hex")
