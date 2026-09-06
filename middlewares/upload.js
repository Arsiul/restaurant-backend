import multer from "multer"

const allowed = [".csv", ".xlsx", ".xls"]

const fileFilter = (req, file, cb) => {
  const name = file.originalname.toLowerCase()
  const valid = allowed.some((ext) => name.endsWith(ext))

  if (!valid) {
    return cb(new Error("Formato no permitido. Use CSV, XLSX o XLS"))
  }

  cb(null, true)
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
})

/**
 * Documentos de respaldo. Va aparte del importador porque son dos cosas
 * distintas: alli se lee el contenido para convertirlo en filas, aqui el
 * archivo se guarda tal cual.
 *
 * Los tipos y el tamano son los que ya declara el bucket
 * `documentos-cursos` en Supabase. Se repiten aqui para poder responder un
 * error entendible antes de subir 25 MB y que los rechace el bucket.
 */
const DOCUMENTOS_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]

const DOCUMENTOS_EXT = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]

export const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const nombre = file.originalname.toLowerCase()
    const extensionValida = DOCUMENTOS_EXT.some((ext) => nombre.endsWith(ext))
    const mimeValido = DOCUMENTOS_MIME.includes(file.mimetype)

    if (!extensionValida || !mimeValido) {
      return cb(new Error("Formato no permitido. Use PDF, Word, Excel o PowerPoint"))
    }

    cb(null, true)
  }
})
