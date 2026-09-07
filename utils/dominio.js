import { normalizeName } from "./normalize.js"

/**
 * Toda la empresa inicia sesion con un correo del mismo dominio. El
 * usuario es la parte corta: "jperez" vive como jperez@rimberio.com.
 *
 * El dominio se lee del entorno para que cambiar de razon social no
 * obligue a tocar codigo. Si no esta definido, no se exige ninguno: eso
 * deja el sistema utilizable en desarrollo sin configuracion previa.
 */
export const DOMINIO = String(process.env.EMPRESA_DOMINIO || "").trim().toLowerCase()

/**
 * Nombre de la empresa. Es del sistema y no de cada cuenta.
 *
 * Antes vivia en `profiles.empresa` y se escribia a mano al dar de alta a
 * alguien. Con una sola empresa eso no aportaba nada y si permitia que dos
 * personas la escribieran distinto: sus importaciones propias quedaban
 * etiquetadas con nombres diferentes y el mismo restaurante aparecia como
 * dos empresas en la comparacion.
 */
export const EMPRESA = String(process.env.EMPRESA_NOMBRE || "").trim() || "Mi empresa"

/** Normaliza un texto libre a un usuario valido: jperez, ana.torres, sede_lima. */
export const aUsuario = (valor) =>
  normalizeName(valor)
    .replace(/[^a-z0-9_.]+/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 40)

/** Correo con el que se autentica un usuario. */
export const correoDe = (usuario) => {
  const limpio = aUsuario(usuario)
  if (!limpio) return ""
  return DOMINIO ? `${limpio}@${DOMINIO}` : limpio
}

/** Usuario que hay detras de un correo. */
export const usuarioDe = (correo) => aUsuario(String(correo || "").split("@")[0])

/**
 * Valida que un correo pertenezca a la empresa. Sin dominio configurado
 * cualquiera pasa, para no bloquear un entorno recien clonado.
 */
export const esCorreoDeLaEmpresa = (correo) => {
  if (!DOMINIO) return true
  return String(correo || "").trim().toLowerCase().endsWith(`@${DOMINIO}`)
}

export const errorDeDominio = () =>
  DOMINIO
    ? `El correo debe pertenecer al dominio de la empresa (@${DOMINIO})`
    : "El correo no es valido"
