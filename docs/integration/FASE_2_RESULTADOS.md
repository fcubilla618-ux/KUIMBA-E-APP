# Fase 2 — servidor seguro en entorno local

Base: PR #2 / beta-firebase-roles-cajas. No despliegue, no merge, no Firebase real.

## Cambios

- `backend/validation.mjs`: contrato estricto de operaciones; rechaza rol, precio,
  stock o importes enviados por el cliente y revisiones ausentes.
- `backend/runtime.mjs`: Firebase Admin SDK limitado a proyecto demo y emuladores
  Auth/Firestore en loopback; rechaza destinos distintos y desactiva la detección
  de metadatos de nube. No introduce cuentas ni credenciales productivas.
- `backend/operations.mjs`: transacciones, autorización con perfil y vínculo
  reales dentro de la transacción, exclusión de agenda por día/barbero, revisión
  de documentos y recibos idempotentes por usuario/contenido.
- `backend/http.mjs`: token Auth verificado (incluye usuario deshabilitado),
  origen, método y JSON limitado a 16 KiB; errores sin registros privados.
- Puente de desarrollo: conecta los mismos formularios de la PWA para reservar,
  modificar, cancelar, atender y vender. Admin puede elegir barbero; cada barbero
  opera únicamente su agenda y caja. Los datos cambian por snapshots confirmados,
  sin mutaciones locales optimistas ni cola offline.
- Caja y ventas inmutables: stock + venta + caja del vendedor en una transacción;
  cobro de servicio conserva precio de reserva. Cancelar cobrado agrega venta y
  caja negativas vinculadas al asiento original y con el mismo medio de pago.
- `business-time.mjs`: fecha/hora contable en America/Asuncion y createdAt en UTC.
  La copia de interfaz usa ese mismo día comercial para filtros de caja.
- Confirmación perdida: botón independiente que reenvía el payload original y su
  misma clave, aunque el listener ya cambió revisión/estado o consumió el stock.
  Mientras una respuesta sea ambigua no se inicia otra intención diferente.

## Verificación

`npm run test:all` terminó con código **0**, sin pruebas omitidas:

| Grupo | Pasan | Cobertura principal |
|---|---:|---|
| Unitarias | 12 | Contrato estricto, sesión, auditoría heredada, claves/reintentos, día comercial |
| Reglas Firestore | 5 | Aislamiento de los tres barberos, V1/costos e internos privados, escrituras directas denegadas |
| Operaciones transaccionales | 10 | Cuatro perfiles, solapamientos simultáneos, adyacencia, revisión obsoleta, reasignación, stock final, recibos, reversiones, precio histórico y zona horaria |
| HTTP | 4 | Token válido/inválido/caducado/audiencia/usuario deshabilitado, origen/JSON/tamaño, texto UTF-8 fragmentado |
| Navegador | 8 | 4 Pixel 7 y 4 tablet: UI original, sincronización en dos contextos, sesión/offline y recorrido completo de los cuatro perfiles; pérdida de respuesta después del commit |
| **Total** | **39** | **Todas pasan** |

El recorrido de UI comprobó crear, modificar, cancelar, atender y vender como admin,
Walter, Dani y Junior. La caja general final del fixture fue 780 Gs en 11 asientos,
con cuatro cobros de servicios y cuatro ventas de productos además de sus tres
asientos iniciales. Las pruebas de recuperación perdieron deliberadamente la
respuesta HTTP después del commit: confirmar nuevamente no duplicó cobros ni
stock, y permitió operar después.

`npm run build:dev`, los chequeos de sintaxis y `git diff --check` pasan.
`git diff --exit-code 0416733b8c32845255a27e428b2915bb0ddc0afe -- index.html sw.js
manifest.webmanifest '*.png' '*.jpg' LEEME_INSTALACION.txt` no mostró cambios.
Capturas de agenda/caja revisadas visualmente en ambos tamaños, guardadas bajo
artifacts/ (no versionadas). Registro bruto de esta sesión:
`/tmp/kuimbae-p2-verified.log` (no se incorpora información personal al repositorio).
Las ejecuciones locales de emuladores y Chromium requirieron los permisos de
puertos/procesos del entorno; finalmente se ejecutaron todas las pruebas reales.

Las cuentas admin/Walter/Dani/Junior son sintéticas (example.test) con contraseñas
aleatorias generadas en memoria. En las pruebas de operaciones el horario de
atención del fixture permite todos los días para no depender del día de ejecución.
Los tests de carrera no simulan éxito: ejecutan transacciones contra Firestore
Emulator, verifican un solo ganador, stock no negativo y venta/caja únicas.

Revisión independiente: se corrigió la recuperación tras respuesta perdida y la
fecha UTC de caja. Se añadieron pruebas de ambos casos antes de la validación final.
Los archivos originales index.html, logos/imágenes, manifest y sw.js permanecen
sin cambios respecto de main original.

## Auditoría de dependencias

Firebase Admin 14.5.0 agregado únicamente al entorno de desarrollo; gRPC exige
una versión corregida >=1.13.6 mediante override compatible. La auditoría online
posterior no informa avisos altos/críticos. Quedan cinco avisos moderados
transitivos de firebase-tools: pubsub/OpenTelemetry y gaxios/uuid. No se ejecutó
`audit fix --force` ni se degradaron los SDK para silenciarlos. Esas dependencias
son herramientas locales, no el SDK del servidor de operaciones ni el bundle del
navegador. Requieren seguimiento antes de preparar un entorno productivo.

Fuentes de los avisos: https://github.com/advisories/GHSA-m9gg-hp2v-232j,
https://github.com/advisories/GHSA-f596-whhp-79r4,
https://github.com/advisories/GHSA-8988-4f7v-96qf,
https://github.com/advisories/GHSA-w5hq-g745-h8pq.

## Límites pendientes

Servidor de desarrollo, no publicable como está: Auth Emulator permite tokens sin
firma sólo para las pruebas. Una implantación futura necesita configuración y
verificación de tokens productivos, revisión operativa y aprobación separadas.

Esta fase no implementa escritura remota de catálogo/precios, perfiles, notas de
clientes, ajustes, restauración ni importación. Permanecen protegidas en la copia
conectada y completas en los archivos originales. No se migraron datos V1 ni se
verificaron perfiles reales. Se necesitan respaldo y mapeo revisados antes de una
migración real. Android/tablet son viewports Chromium; no hardware ni Safari.

El servidor comprueba solapamientos por barbero y fecha y duración/precio del
servicio, pero no configura feriados, horarios de atención o stock de producción.
La caja contable admite sólo cobros/ventas del servidor y reversiones de servicios;
no hay edición arbitraria de movimientos ni devolución de productos en esta fase.
El día comercial es America/Asuncion. Revisar ese valor al configurar otro negocio.

Las claves pendientes se conservan sólo en memoria: ante recarga/cierre durante
una confirmación incierta hay que revisar agenda/caja antes de repetir una venta;
no se persisten datos privados ni operaciones offline en localStorage.
