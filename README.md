# Backend

API REST del sistema de analisis competitivo de restaurantes. Arquitectura MVC
sobre Node.js y Express.

## Que hace el sistema

Un trabajador importa archivos CSV o Excel de ventas, propios y de la
competencia, con cualquier estructura de columnas. El administrador los revisa
y compara dos restaurantes entre si para entender por que uno vende mas. El
resultado de esa comparacion vuelve al trabajador como columnas concretas que
conviene empezar a registrar, y el trabajador las crea en la base desde la
interfaz.

## Requisitos

Node.js 18 o superior.

## Instalacion

```
npm install
npm run dev
```

La API queda disponible en `http://localhost:4000`.

## Variables de entorno

| Variable | Descripcion |
|---|---|
| `SUPABASE_URL` | URL del proyecto de Supabase |
| `SUPABASE_ANON_KEY` | Clave publicable, para validar el token del usuario |
| `SUPABASE_SERVICE_KEY` | Clave de servicio. Ignora RLS |
| `SUPABASE_PROJECT_REF` | Identificador del proyecto. Solo para migraciones |
| `SUPABASE_ACCESS_TOKEN` | Token de la Management API. Solo para migraciones |
| `PORT` | Puerto de la API |
| `CLIENT_URL` | Origenes permitidos por CORS, separados por coma |
| `EMPRESA_DOMINIO` | Dominio de correo de la empresa. Vacio desactiva la validacion |
| `EMPRESA_NOMBRE` | Nombre de la empresa. Es del sistema, no de cada cuenta |

En este equipo la API corre en el **4001** y no en el 4000, porque ese puerto
lo ocupa Docker Desktop (`com.docker.backend.exe`). El frontend apunta ahi con
`VITE_API_URL`. Si el 4000 queda libre, basta con volver a ponerlo en esas dos
variables.

La API en ejecucion no usa la Management API. Las dos ultimas variables solo
las lee `scripts/db.mjs`, que aplica las migraciones desde la terminal en
desarrollo, y no hacen falta para desplegar.

## Estructura de carpetas

```
backend/
  server.js                    Express, CORS y montaje de rutas
  config/
    supabase.js                Clientes publico, con token de usuario y de servicio
  routes/
    auth.routes.js             Autenticacion
    import.routes.js           Carga y consulta de archivos
    comparar.routes.js         Comparacion entre restaurantes
    tarea.routes.js            Asignacion de tareas a los trabajadores
    usuario.routes.js          Alta y mantenimiento de cuentas
  controllers/
    AuthController.js          Registro, verificacion, login y perfil
    ImportController.js        Lectura del archivo y guardado
    CompararController.js      Analisis de uno o dos archivos
    TareaController.js         Alta y seguimiento de tareas
    UsuarioController.js       Cuentas: alta, rol, clave y baja
    DocumentoController.js     Documentacion de respaldo del curso
  models/
    AuthModel.js               Supabase Auth
    ImportModel.js             Tablas imports e import_rows
    TareaModel.js              Tabla tareas y destinatarios
    UsuarioModel.js            Admin API de Supabase y tabla profiles
    ErpModel.js                Estructura del ERP y reparto de accesos
    DocumentoModel.js          Bucket de documentos y tabla documentos_curso
  middlewares/
    auth.js                    Valida el token y resuelve el rol desde la base
    upload.js                  Recepcion del archivo con Multer
  utils/
    dominio.js                 Usuario, correo y dominio de la empresa
    modulos.js                 Que ruta abre cada clave de la plataforma
    perfil.js                  Perfil y modulos efectivos, en un solo lugar
    huella.js                  Huella del contenido, para detectar duplicados
    Importer.js                Lectura de CSV y Excel sin estructura fija
    Estructura.js              Deteccion de columnas y tipos del archivo
    Mapeo.js                   Traduce columnas reales a roles comparables
    Comparador.js              Calculo de metricas y series
    Insight.js                 Reglas de comparacion entre restaurantes
  migrations/
    001_roles_e_imports.sql    Esquema, RLS y trigger de perfiles
    002_rpc_empresa.sql        Funciones que el frontend llama para el DDL
    003_tareas.sql             Tabla tareas, RLS y cierre automatico
    004_usuarios_y_acceso.sql  Columna usuario en profiles
    005_alinear_con_modulos.sql  Acceso por modulo. Consume la capa de la plataforma
    006_erp_cuatro_modulos.sql   Los tres modulos del ERP que faltaban
    007_modulo_documentos.sql    Registra el modulo Documentos. Solo una fila
    008_huella_de_importacion.sql  Impide importar dos veces el mismo contenido
  scripts/
    db.mjs                     Ejecuta SQL contra la Management API
    rellenar-huella.mjs        Huella de las importaciones anteriores a 008
    seed-users.mjs             Crea las cuentas de prueba
    gen-csv.mjs                Genera los archivos de ejemplo
    probar-*.mjs               Pruebas manuales de cada flujo
```

## El ERP y sus modulos

El sistema es un **ERP de cuatro modulos**. Todo lo desarrollado hasta ahora
vive dentro de uno solo, **Big Data**; los otros tres existen en la
estructura y estan vacios.

```
ERP
|- Big Data     Importar datos, Datasets, Analisis, Comparacion,
|               Estructura de datos, Graficos
|- Modulo 2     vacio
|- Modulo 3     vacio
|- Modulo 4     vacio
```

### Esa estructura no la inventa este repositorio

La base la comparten varias aplicaciones y trae una capa de permisos que
**aqui se consume pero no se administra**:

| Objeto | De quien es |
|---|---|
| `cursos`, `curso_modulos`, `usuario_cursos`, `usuario_modulos` | Plataforma |
| `profiles.activo` | Plataforma |
| `app_role()`, `app_tiene_modulo(clave)`, `emp_exigir_modulo(clave)` | Plataforma |
| `emp_mis_modulos()` | De aqui. Solo lectura sobre lo anterior |
| Las siete funciones `empresa_*` | De aqui |

Nada de la columna izquierda se crea, se altera ni se borra desde estas
migraciones. `005` agrega una funcion de lectura y vuelve a emitir las
funciones que si son de este proyecto; `006` solo inserta las filas de los
tres modulos que faltaban.

Los nombres, las descripciones y el orden salen de `curso_modulos`.
`utils/modulos.js` no los repite: solo dice que ruta abre cada clave.

### El acceso tiene dos niveles

Es como lo resuelve `app_tiene_modulo` dentro de la base, y es tambien como
lo pide el negocio:

```
entrar a una pantalla  =  tener el modulo del ERP  Y  tener esa pantalla
```

Es la interseccion, no la union. El administrador concede el modulo del ERP,
y dentro elige si van todas sus pantallas, algunas o una sola. Marcar el
modulo entero concede sus pantallas de una vez.

Un modulo vacio se concede igual, aunque no tenga nada dentro todavia.

| Clave | Pantalla | Que protege |
|---|---|---|
| `big_data.importar` | Importar datos | `POST /api/imports` y `empresa_materializar` |
| `big_data.estructura` | Estructura de datos | Las otras seis funciones `empresa_*` |
| `big_data.datasets` | Datasets | Ver los archivos de todos |
| `big_data.comparar` | Comparacion | `/api/comparar` y `/api/tareas` |

Big Data declara ademas `big_data.analisis` y `big_data.graficos`, que estan
en el plan y todavia no tienen pantalla. El panel los muestra como tales en
vez de esconderlos: el administrador tiene que poder ver el plan completo.

Administrar cuentas (`/api/usuarios`) **no es un modulo**. Va atado al rol de
administrador a proposito: poder crear cuentas es poder crear
administradores, y si esa llave se pudiera repartir, repartir permisos
dejaria de significar algo.

### Donde se verifica

Tres capas, y ninguna confia en la anterior:

| Capa | Que hace |
|---|---|
| `App.jsx` | Decide que rutas se dibujan. Solo interfaz |
| `requireModulo(clave)` | Corta la peticion en el servidor |
| `emp_exigir_modulo(clave)` | Dentro de la base, en cada funcion `empresa_*` |

El servidor resuelve los modulos llamando a `emp_mis_modulos()` **con el
token de la persona**, no con la clave de servicio: asi la respuesta sale de
la misma `auth.uid()` que usan las funciones de la base, y lo que decide
Express no puede discrepar de lo que decide Postgres.

`GET /api/erp` devuelve **solo lo concedido**. Los modulos a los que una
cuenta no llega no se envian, ni siquiera marcados como bloqueados: que no
aparezcan en pantalla no basta si el navegador igual recibe sus nombres. Lo
mismo dentro de un modulo concedido, donde solo viajan las pantallas
concedidas; si fueran todas, la tarjeta delataria cuantas hay en total.

El administrador recibe la estructura completa, porque entra a todo por su
rol.

Una cuenta nueva nace sin nada. Pertenecer no da acceso a nada por si solo, y
el lanzador se lo dice en vez de dejarla frente a una pantalla vacia.

## Cuentas y acceso

**`EMPRESA_DOMINIO` es obligatoria en cualquier entorno.** Sin ella el correo
se arma sin la parte del dominio y Supabase rechaza el alta con
`Unable to validate email address: invalid format`.

Toda la empresa inicia sesion con un correo del mismo dominio. El **usuario**
es la parte corta y vive en `profiles.usuario`: `jperez` entra como
`jperez@rimberio.com`. El dominio se lee de `EMPRESA_DOMINIO`, asi que cambiar
de razon social no obliga a tocar codigo. Si la variable esta vacia no se exige
ninguno, para que un entorno recien clonado arranque sin configuracion previa.

La regla aplica a las cuentas **nuevas**. Las que ya existian con otro dominio
siguen entrando con su correo completo: 004 les asigna el usuario a partir de la
parte previa a la arroba, numerandolo si estaba tomado.

Hay dos formas de que exista una cuenta:

| Via | Quien | Verificacion |
|---|---|---|
| Panel de usuarios | El administrador | Ninguna: nace activa |
| Registro publico | La persona | Codigo de 8 digitos al correo |

Las que crea el administrador nacen verificadas porque quien las da de alta ya
demostro su rol contra la base: pedirle ademas a la persona que confirme un
codigo no agrega ninguna garantia.

El **rol nunca sale de la metadata del registro**. Si el trigger lo leyera de
ahi, bastaria mandar `role: "admin"` al registrarse. Toda cuenta nace como
trabajador y el administrador la promueve despues, con la clave de servicio.

### Recuperar la contrasena

Cualquiera puede pedir un codigo desde la pantalla de inicio de sesion. Se
eligio codigo y no enlace por lo mismo que en el registro: un enlace obliga a
declarar la URL de retorno en el proyecto de Supabase, y ahi el correo deja de
funcionar cuando cambia el dominio del despliegue.

```
POST /api/auth/recuperar  ->  resetPasswordForEmail
POST /api/auth/clave      ->  verifyOtp(type: recovery) y updateUser
```

La plantilla de **Reset Password** del proyecto tiene que incluir
`{{ .Token }}`, igual que la de confirmacion que ya usa el registro.

Si el dominio de la empresa no recibe correo real, ese codigo no llega a
ninguna bandeja. Para eso existe `POST /api/usuarios/:id/clave`: el
administrador restablece la contrasena a mano desde el panel.

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `profiles` | Usuario, rol y empresa de cada cuenta. Se crea sola al registrarse |
| `imports` | Un registro por archivo: nombre, empresa, si es propia, columnas |
| `import_rows` | El contenido, en una columna `data` de tipo JSONB |
| `cambios_estructura` | Bitacora de cada ALTER y CREATE aplicado |
| `tareas` | Insights que el admin convirtio en orden para un trabajador |
| `empresa_datos` | Tabla fisica con los datos propios. La crea la primera importacion |
| `emp_*` | Tablas que crea el trabajador para registrar algo nuevo |

Los archivos importados se guardan en `import_rows.data` como JSONB porque cada
uno trae columnas distintas y no se pueden conocer de antemano. La tabla
`empresa_datos` es la excepcion: al ser la que el trabajador amplia con columnas
nuevas, necesita ser una tabla real con columnas reales.

## Endpoints

### Autenticacion

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/auth/register` | Crea la cuenta y envia el codigo |
| POST | `/api/auth/verify` | Valida el codigo y devuelve el token |
| POST | `/api/auth/resend` | Reenvia el codigo |
| POST | `/api/auth/login` | Inicia sesion, devuelve token y perfil |
| POST | `/api/auth/recuperar` | Envia el codigo para restablecer la clave |
| POST | `/api/auth/clave` | Canjea el codigo y fija la contrasena nueva |
| GET | `/api/auth/dominio` | Dominio de la empresa. Publico, lo leen los formularios |
| GET | `/api/auth/me` | Perfil vigente segun la base |

Todas las rutas que reciben una identidad aceptan el campo `usuario` con el
correo completo o con el usuario a secas: si llega `jperez` se le agrega el
dominio antes de autenticar.

El dominio se exige **solo al crear la cuenta**, no al entrar. Validarlo tambien
al autenticar dejaria fuera a las cuentas anteriores a esta regla, y no aporta
nada: un correo que no existe lo rechaza Supabase igual.

`/api/auth/recuperar` responde `sent: true` exista o no la cuenta. Decir cual
existe convertiria la ruta en un directorio de correos para cualquiera.

### Archivos

| Metodo | Ruta | Modulo | Descripcion |
|---|---|---|---|
| POST | `/api/imports` | `importar` | Carga un CSV o Excel. Rechaza contenido repetido |
| GET | `/api/imports` | `importar`, `datasets` o `comparar` | Lista archivos |
| GET | `/api/imports/:id` | `importar`, `datasets` o `comparar` | Metadata y filas |
| GET | `/api/imports/:id/resumen` | `importar`, `datasets` o `comparar` | Metricas, series e insights de ese archivo |
| DELETE | `/api/imports/:id` | `importar` o `datasets` | Elimina la importacion, sus filas y lo materializado |

Quien tenga `datasets` o `comparar` ve los archivos de todos; quien solo
tenga `importar` ve los suyos. El alcance sale del modulo y ya no del rol,
que es justamente para lo que sirve repartirlos.

`/resumen` devuelve el mismo analisis que `/api/comparar` en modo
individual, y vive aqui a proposito: mirar lo que uno acaba de importar es
parte de importar, y no deberia exigir el modulo de comparacion.

El borrado arrastra tres cosas: la fila de `imports`, sus `import_rows` y lo
que se hubiera volcado en `empresa_datos`. Las primeras caen por la clave
foranea; las ultimas **no**, porque `empresa_datos` la crea la funcion que
materializa y no lleva clave foranea contra `imports`. Sin ese barrido
quedarian filas que ya no se pueden rastrear hasta ningun archivo.

Las columnas que el trabajador haya agregado a mano se conservan: se borran
filas, no estructura.

### Usuarios (solo admin)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/usuarios` | Todas las cuentas, con lo efectivo y lo asignado |
| POST | `/api/usuarios` | Crea una cuenta, ya verificada |
| PATCH | `/api/usuarios/:id` | Cambia el nombre o el rol |
| POST | `/api/usuarios/:id/clave` | Restablece la contrasena |
| PUT | `/api/usuarios/:id/modulos` | Deja a la persona con exactamente esos modulos |
| GET | `/api/usuarios/catalogo` | Los modulos que se pueden repartir |
| DELETE | `/api/usuarios/:id` | Elimina la cuenta |

Un administrador no puede cambiarse el rol ni eliminarse a si mismo: seria la
forma mas rapida de dejar el panel sin nadie que lo administre.

La empresa no se pide al dar de alta. Hay una sola y sale de
`EMPRESA_NOMBRE`: cuando se escribia a mano en cada cuenta, dos personas
podian ponerla distinta y sus importaciones propias quedaban etiquetadas con
nombres diferentes, de modo que el mismo restaurante aparecia como dos
empresas en la comparacion. La columna `profiles.empresa` sigue existiendo y
se rellena con ese valor, pero el perfil que sirve la API ya no la lee de
ahi: hay cuentas antiguas con el valor por defecto que nadie eligio.

El listado devuelve dos cosas distintas por cuenta. `modulos` es lo efectivo,
que para un administrador es todo; `asignado` es lo que tiene concedido de
verdad. La interfaz necesita la segunda para poder avisar de que al quitarle
el rol se quedaria sin acceso a ninguna pantalla.

### Documentos (modulo `documentos`)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/documentos` | Documentos del curso, con los modulos para clasificarlos |
| POST | `/api/documentos` | Sube un PDF, Word, Excel o PowerPoint |
| GET | `/api/documentos/:id/enlace` | URL firmada, valida 5 minutos |
| PATCH | `/api/documentos/:id` | Cambia la descripcion o la clasificacion |
| DELETE | `/api/documentos/:id` | Borra el archivo y su ficha |

Este modulo **no crea nada**: se apoya en infraestructura que ya existia en
la plataforma compartida.

| Pieza | Que es |
|---|---|
| `storage.buckets` -> `documentos-cursos` | Bucket privado, 25 MB, siete tipos permitidos |
| `documentos_curso` | La ficha de cada archivo: ruta, mime, tamano, descripcion |
| `validar_documento_modulo_curso` | Trigger que comprueba que el modulo pertenezca al curso |

La tabla tiene **RLS activo y ninguna politica**, y el bucket tampoco tiene:
eso hace que solo la clave de servicio llegue a ellos. Por eso este modulo
pasa entero por el backend, sin las funciones RPC que necesito el modulo del
trabajador. El control de acceso lo hace `requireModulo` antes de entrar al
modelo.

Como el bucket es privado, ver un archivo no es abrir su ruta: el backend
firma un enlace temporal con la clave de servicio.

`documentos_curso.modulo_id` ya existia sin usar. Un documento puede quedar
general del curso o colgar de un modulo concreto, y esa es la clasificacion
que ofrece la pantalla.

El borrado es real y no logico. Apagar la fila con `activo = false` deja el
archivo ocupando el bucket sin que nadie pueda volver a verlo ni borrarlo, y
eso se acumula: quedaban dos fichas asi de antes.

### Comparacion (modulo `comparar`)

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/comparar` | Recibe uno o dos ids y devuelve metricas, series e insights |

### Tareas (modulo `comparar`)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/tareas/trabajadores` | Trabajadores a los que se puede asignar |
| GET | `/api/tareas` | Avance de todo lo asignado |
| POST | `/api/tareas` | Convierte un insight en una tarea |
| DELETE | `/api/tareas/:id` | Elimina una tarea |

Asignar es potestad del administrador. El trabajador lee y cierra las suyas
desde su modulo, directo contra la base con RLS.

## Tareas

Cada insight de la comparacion se puede convertir en una orden concreta para un
trabajador. El sistema no ejecuta nada por el: la tarea se muestra y el
trabajador la resuelve a mano con el formulario de siempre.

El trabajo del trabajador viene **unicamente** de estas tareas. No hay
sugerencias automaticas: si el administrador no lo pidio, no aparece. Antes
existia un endpoint que proponia columnas por su cuenta, y se elimino porque
competia con la asignacion y difuminaba quien decide que se hace.

| Tipo de tarea | Origen | Como se cierra |
|---|---|---|
| Ejecutable | Insight con `accion` (capacidades faltantes) | Sola, cuando la columna existe |
| De lectura | Cualquier otro insight | El trabajador la marca a mano |

El cierre automatico vive dentro de `empresa_agregar_columna`, no en el
frontend: asi la tarea se cierra sin importar por donde se haya creado la
columna. La funcion devuelve `tareasCerradas` para que la interfaz lo avise.

## Importacion de archivos

Formatos aceptados: `.csv`, `.xlsx` y `.xls`. Maximo 10 MB y 20 000 filas.

### El mismo archivo no entra dos veces

Cada importacion guarda una **huella** de su contenido, y una segunda carga
con la misma huella se rechaza con un 409 que dice cuando entro la primera y
quien la subio.

La huella se calcula sobre las filas ya leidas y no sobre los bytes del
fichero, y esa diferencia importa: el mismo CSV guardado con otra
codificacion, con otros saltos de linea o exportado de nuevo desde Excel da
bytes distintos y los mismos datos. Lo que interesa es si esos datos ya
estan, no si el fichero es identico. Renombrar el archivo tampoco sirve de
nada.

Las claves de cada fila se ordenan antes de serializar, asi que dos archivos
con las mismas columnas en distinto orden dan la misma huella.

La comprobacion no se limita a lo que ve quien sube: si otra persona ya
cargo ese archivo, sigue siendo un duplicado. Acotarla por usuario
permitiria que el mismo dato entrara tantas veces como trabajadores haya.

Se verifica **antes** de escribir nada. De lo contrario quedaria la fila de
`imports` creada y el archivo a medio guardar cuando se rechace.

`scripts/rellenar-huella.mjs` calcula la huella de las importaciones
anteriores a la migracion 008, con la misma funcion que usa el servidor.

No hay columnas obligatorias ni nombres esperados. El importador detecta las
cabeceras que traiga el archivo, deduce el tipo de cada una y guarda las filas
tal cual. Un CSV con `plato, categoria, precio` y otro con
`producto, tipo, precio_carta, canal` conviven sin conflicto.

Los CSV se leen en crudo. Sin eso la libreria interpreta que `2026-01` es una
fecha y la reescribe como `12/31/25`, corrompiendo la columna. Los Excel si se
leen con formato, porque ahi las fechas estan guardadas como numero de serie.

## El modulo del trabajador no pasa por este backend

Por requisito del proyecto, las operaciones sobre la base que hace el trabajador
salen del navegador. Estan implementadas como funciones RPC de Postgres en
`migrations/002_rpc_empresa.sql`, y el frontend las invoca con `supabase-js`.

| Funcion | Operacion |
|---|---|
| `empresa_tablas()` | Lista las tablas administrables |
| `empresa_leer(tabla, limite, desde)` | Filas y columnas, paginadas |
| `empresa_agregar_columna(...)` | `ALTER TABLE ... ADD COLUMN` |
| `empresa_crear_tabla(...)` | `CREATE TABLE emp_...` |
| `empresa_eliminar_columna(...)` | `ALTER TABLE ... DROP COLUMN` |
| `empresa_actualizar_celda(...)` | `UPDATE` de un valor |
| `empresa_materializar(id, estructura)` | Crea o amplia `empresa_datos` desde una importacion |

### Por que no se llama a la Management API desde el navegador

Fue lo primero que se intento y no es posible. `api.supabase.com` responde con
`Access-Control-Allow-Origin` unicamente para `https://supabase.com`, su propio
dashboard. Desde cualquier otro origen el navegador descarta la respuesta por
CORS, con token o sin el.

```
Origin: https://supabase.com     -> Access-Control-Allow-Origin: https://supabase.com
Origin: https://mi-app.vercel.app -> sin cabecera, bloqueado
```

El endpoint del proyecto (`<ref>.supabase.co/rest/v1/rpc/*`) si responde
`Access-Control-Allow-Origin: *`, por eso las funciones RPC son la unica via.

### Seguridad

La clave que viaja en el bundle es la publicable (`anon`), pensada para estar en
el navegador. Lo que protege las operaciones esta dentro de la base:

| Control | Efecto |
|---|---|
| `emp_exigir_trabajador()` | Cada funcion valida contra `profiles` que quien llama sea trabajador. Un admin recibe 403 |
| `grant execute ... to authenticated` | Sin sesion no se puede ni invocar la funcion |
| `emp_validar_tabla()` | Solo `empresa_datos` y `emp_*`. `profiles` o `auth.users` dan 403 |
| `emp_validar_columna()` | Regex `^[a-z][a-z0-9_]{0,58}$`. Cualquier intento de inyeccion no pasa |
| `emp_tipo_sql()` | Lista blanca de seis tipos. No se acepta SQL libre |
| `format('%I')` | Todo identificador se cita antes de interpolarse |
| Columnas reservadas | `id`, `import_id`, `fila` y `created_at` no se pueden tocar |
| `cambios_estructura` | Cada operacion queda registrada con su SQL, su motivo y su autor |

Las funciones son `SECURITY DEFINER` porque necesitan permisos de DDL, y los
ayudantes (`emp_*`) tienen el `execute` revocado para que PostgREST no los
exponga. `scripts/probar-rpc.mjs` ejercita cada control con un JWT real.

## Comparacion entre restaurantes

Dos archivos rara vez nombran igual la misma cosa. `utils/Mapeo.js` traduce las
columnas reales a roles comparables antes de calcular nada:

| Rol | Columnas que reconoce |
|---|---|
| producto | plato, producto, item, nombre_plato, articulo |
| categoria | categoria, tipo, familia, seccion, grupo |
| precio | precio_unitario, precio_final, precio, pvp |
| unidades | unidades, cantidad, vendidos, qty |
| ingresos | ingreso_total, venta_total, total, monto |
| periodo | mes, fecha, periodo, dia |

Para precio, unidades e ingresos exige ademas que la columna sea numerica: una
columna llamada `total` con texto adentro romperia todos los calculos.

Aparte de los roles, detecta **capacidades**: columnas que revelan algo que el
negocio hace, no un dato de la venta. Son las que producen el insight principal.

| Capacidad | Se detecta en |
|---|---|
| Canal de delivery | canal, delivery, reparto, modalidad |
| Promociones | promocion, descuento, oferta |
| Combos | combo, menu_dia, paquete |
| Fidelizacion | socio, club, puntos, membresia |
| Resenas | resena, calificacion, rating |
| Costo y margen | costo, margen, utilidad, food_cost |

Cada archivo de ejemplo trae capacidades distintas, de modo que cualquier
comparacion produzca al menos una columna que pedir:

| Archivo | Capacidades que aporta |
|---|---|
| `rimberio_ventas_2026.csv` | ninguna. Es el propio: todo le falta |
| `sabor_norteno_ventas_2026.csv` | delivery, promociones |
| `la_buena_mesa_ventas_2026.csv` | combos, fidelizacion, resenas |
| `costa_marina_ventas_2026.csv` | costos, resenas |

Una columna `canal` que solo dice `Salon` no cuenta como delivery, y una columna
booleana en la que nunca se dice que si tampoco: la capacidad tiene que estar
efectivamente en uso.

## Reglas de insight

`utils/Insight.js` evalua ocho reglas y devuelve las seis mas relevantes,
ordenadas por nivel (`oportunidad`, `alerta`, `info`).

| Regla | Situacion que detecta | Trae accion |
|---|---|---|
| Capacidades faltantes | El otro registra algo que nosotros ni medimos | Si |
| Peso del canal | Cuanto del ingreso ajeno sale del delivery | Si |
| Brecha de ingresos | El otro factura 15 por ciento mas | No |
| Ticket promedio | Diferencia mayor al 10 por ciento | No |
| Amplitud de catalogo | El otro mueve 25 por ciento mas productos | No |
| Categorias sin cubrir | Categorias que el otro trabaja y nosotros no | No |
| Concentracion | Un solo plato pasa el 18 por ciento del ingreso | No |
| Tendencia | Si la brecha se abre o se cierra en el periodo | No |

**En modo comparacion solo se devuelven las reglas con `accion`.** Un
diagnostico sin columna que crear no le sirve al administrador, porque no hay
nada que asignarle a nadie. Las ocho reglas se evaluan igual, pero las que no
producen una orden concreta se descartan antes de responder.

Al analizar un archivo suelto no hay comparacion posible, asi que ese modo
conserva sus observaciones informativas y no muestra el boton de asignar.

## Organizaciones

Ya existen, y no hubo que inventarlas: **el curso es la organizacion**. La
capa de la plataforma implementa exactamente el modelo de GitHub que se
pedia, con otros nombres.

| Concepto pedido | Como se llama en la base |
|---|---|
| Organizacion | `cursos` |
| Modulos que trae la organizacion | `curso_modulos` |
| Ser miembro | `usuario_cursos` |
| Permiso sobre un modulo | `usuario_modulos` |

Con una diferencia que conviene tener presente. `app_tiene_modulo` exige
**las dos cosas a la vez**:

```
acceso  =  estar inscrito en el curso  Y  tener el modulo asignado
```

No es la union sino la interseccion. Agregar a alguien a la organizacion no
le concede todavia sus modulos: hay que asignarselos. Se puede llegar al
mismo resultado sin tocar nada de la plataforma, con una accion del panel
que cree de una vez las filas de todos los modulos del curso; cambiar
`app_tiene_modulo` para que baste la inscripcion afectaria a las demas
aplicaciones que comparten la base, y eso no se toca desde aqui.

### El reparto desde el panel

`models/AccesoModel.js` escribe en `usuario_cursos` y `usuario_modulos`. Son
filas, no esquema: esas tablas existen justamente para esto.

Conceder implica inscribir. Como la base exige las dos cosas, pedir un modulo
sin inscripcion daria un acceso que despues no funciona, asi que
`PUT /api/usuarios/:id/modulos` da de alta la inscripcion en el curso cuando
hace falta. Eso es lo que hace que marcar todas las casillas equivalga a
"agregarlo a la organizacion con todo", sin haber tocado `app_tiene_modulo`.

Revocar apaga la fila (`activo = false`) en vez de borrarla, que es para lo
que la plataforma puso esa columna: queda el rastro de quien tuvo que.

**Solo se tocan filas de los cuatro modulos de esta aplicacion.** La base la
comparten varias apps: `big_data.analisis` y `big_data.graficos` pertenecen
al mismo curso pero no a este sistema, y una asignacion suya sobrevive
intacta a cualquier cosa que se haga desde este panel.

Al administrador no se le reparte nada: entra a todo por su rol, igual que lo
resuelve `app_tiene_modulo`, y el panel se lo muestra asi en vez de ofrecer
casillas que no significarian nada.
