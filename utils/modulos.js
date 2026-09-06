/**
 * Que pantalla de esta aplicacion corresponde a cada clave de la
 * plataforma.
 *
 * Los nombres, las descripciones y el orden NO estan aqui: viven en
 * `curso_modulos`, que es de donde los lee el backend. Este archivo solo
 * responde a "cuando alguien tiene esta clave, que ruta puede abrir".
 *
 * El curso Big Data declara siete modulos y esta aplicacion sabe dibujar
 * cinco. `analisis` y `graficos` existen en el plan pero todavia no
 * tienen pantalla, y se marcan como tales en vez de esconderlos: el
 * administrador tiene que poder ver el plan completo.
 */
export const RUTAS = {
  "big_data.importar": "/importar",
  "big_data.estructura": "/datos-empresa",
  "big_data.datasets": "/archivos",
  "big_data.comparar": "/comparar",
  "big_data.documentos": "/documentos"
}

export const CLAVES = Object.keys(RUTAS)

export const IMPORTAR = "big_data.importar"
export const ESTRUCTURA = "big_data.estructura"
export const ARCHIVOS = "big_data.datasets"
export const COMPARAR = "big_data.comparar"
export const DOCUMENTOS = "big_data.documentos"

/** La clave con la que el controlador ubica su curso. */
export const CURSO_DOCUMENTOS = DOCUMENTOS

/** El modulo del ERP donde vive todo lo construido. */
export const CURSO_CONSTRUIDO = "big-data"

export const tienePantalla = (clave) => Boolean(RUTAS[clave])

/** De todo lo que la plataforma reconozca, lo que esta app sabe dibujar. */
export const modulosDeLaApp = (claves = []) => CLAVES.filter((clave) => claves.includes(clave))
