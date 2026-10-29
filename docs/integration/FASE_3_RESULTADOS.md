# Fase 3 — integración ampliada en emuladores

Rama: beta-firebase-roles-cajas. Base: PR #2,
6588d87965000b0bd1917f92b3aa55184cabefa1.
No despliegue, merge, modificación de main ni acceso a Firebase real.

## Capacidades verificables

| Función | Integración de ensayo |
|---|---|
| Turnos y agenda | Se reutiliza fase 2: transacciones, conflictos, revisiones, cobros y reversiones; ahora también horario/feriados de configuración compartida y permisos actuales. |
| Clientes | Documentos por propietario, clientes sin turnos y notas en vivo. Admin elige propietario; no se abren arrays V1 a barberos. |
| Servicios/precios | Crear/editar/baja lógica por barbero. Admin administra todo; barbero sólo sus servicios con permiso explícito. Precios históricos de turnos se conservan. |
| Productos/inventario | Crear/editar/baja lógica, stock/fotos compartidos y costos separados sólo para admin. Venta cambia revisión para impedir que un editor obsoleto restaure stock vendido. |
| Cajas | General e individuales desde los mismos asientos; corrección auditada de medio de pago propio, sin alterar importes/propietario ni registros con reversión. |
| Usuarios | Panel admin con cuentas ficticias, rol, vínculo, estado, cuatro permisos y cambio de contraseña. Perfiles y vínculos recíprocos se autorizan en servidor, no en almacenamiento local. |
| Ajustes | Identidad, logo, dirección/teléfono del negocio, días, horarios, intervalos, feriados/vacaciones, clasificación de clientes y mensaje de WhatsApp compartidos. |
| Fotos y diseño | Data URL raster con tamaño/MIME/firma validados; originales intactos. Se reutilizan sus formularios, compresión, estilos, navegación, filtros y utilidades de compartir. |
| Respaldo | Exportación local de datos de la sesión con suplemento V2 que conserva notas por propietario y costos admin. Sin contraseñas. |
| Migración | Auditoría y simulación offline desde CLI y el control «Auditar respaldo (sin importar)». Nunca importa automáticamente. |

Los registros de servicio/producto se dan de baja conservando historia. Las
contraseñas sólo se envían a Auth Emulator, nunca se guardan en Firestore,
recibos, auditoría ni respaldo. Recibos guardan fingerprint, no contraseña.
La provisión inicia una cuenta Auth deshabilitada y la habilita tras confirmar
perfil/vínculo. Cada cambio vuelve a comprobar el administrador. Un fallo de
proceso con operación Auth en vuelo deja una marca bloqueada para revisión manual
del emulador; no se adivina ni expira inseguramente una operación incierta.

## Pruebas y resultados

`npm run test:all` terminó con código **0**, sin pruebas omitidas:

| Grupo | Pasan |
|---|---:|
| Unitarias (contrato, sesión, gestión, migración, horario y reintentos) | 36 |
| Reglas Firestore | 6 |
| Operaciones transaccionales | 12 |
| HTTP autenticado | 4 |
| Gestión con Auth/Firestore Emulator | 7 |
| Navegador: 8 Pixel 7 + 8 tablet | 16 |
| **Total** | **81** |

`npm run build:dev`, chequeos de sintaxis y `git diff --check` pasan. No son
pruebas en Android/iPad físicos ni Safari. Se revisaron visualmente las capturas
Android/tablet. El comando de conservación de originales terminó sin diferencias:
`git diff --exit-code 0416733b8c32845255a27e428b2915bb0ddc0afe -- index.html sw.js
manifest.webmanifest '*.png' '*.jpg' LEEME_INSTALACION.txt`.

Registro final local: `/tmp/kuimbae-p3-release-check.log`; capturas bajo artifacts/
(ignoradas por Git). Emuladores/Chromium se ejecutaron con permisos del entorno
para abrir puertos locales; los fallos previos se corrigieron, no se sustituyeron
por éxitos simulados. La auditoría online npm de esta fase confirma 0 altos,
0 críticos y 5 moderados en herramientas CLI.

Se probó con admin, Walter, Dani y Junior ficticios. Casos adicionales: dos
administradores deshabilitándose concurrentemente (queda uno activo), dos cuentas
reclamando el mismo barbero (un solo vínculo), pérdida de respuesta HTTP,
revocación de permisos, anotaciones privadas, editor obsoleto de inventario,
imágenes/logo entre sesiones, esquema malicioso y claves de cliente que intentan
inyectar handlers. Restauración en seco y exportación V2 también se prueban en UI.

La simulación conserva importes/signos, precios históricos, stock, fotos,
configuración y costos históricos separados. Repetirla no agrega documentos;
cualquier conflicto bloquea todo y deja el origen intacto. Cuentas reales,
propietarios ambiguos y vínculos de producción no se verificaron porque no se
consultó Firebase real ni existe respaldo real autorizado en este entorno.

## Errores encontrados y corregidos

- Un observador heredado de fase 1 retenía el bloqueo visual antiguo y volvía a
  deshabilitar los botones de gestión. Ahora invoca la política actual.
- La selección de propietario de notas debía poblarse antes de elegir el dueño;
  se corrigió el caso admin que abría un cliente con notas de otro barbero.
- Los borradores de notas conservan su revisión mientras se editan; al recibir
  una actualización sin borrador se refrescan contenido y revisión.
- El editor de usuarios conservaba UID/revisión oculta entre sesiones. Se reinicia
  por completo y también se limpian el mapeo/reporte de migración.
- Se espera a procesar la foto del logo antes de habilitar Guardar ajustes.
- La simulación tenía límites más amplios que el servidor: se alinearon IDs,
  importes enteros, stock, fotos canónicas con firma, claves, horarios y ajustes.
- Las ediciones de costo preservan el mapa histórico privado de ventas migradas.
- Correo Auth duplicado es conflicto definitivo, para poder corregir el formulario
  sin quedar bloqueado intentando confirmar un error permanente.

Las pruebas de permisos esperan el nuevo perfil verificado antes de navegar:
actualizar un perfil limpia la vista anterior y reconstruye los listeners.
Una cuenta desactivada pierde datos visibles; para reactivarla debe ingresar otra
vez. No se bajaron controles, no se eliminaron pruebas ni se simuló éxito.

## Pendientes y límites explícitos

1. **Restauración remota y borrado global:** protegidos en la copia conectada.
   Los botones destructivos originales no ejecutan escritura remota. El código
   original completo permanece disponible en sus archivos sin modificación.
2. **Migración real:** pendiente de respaldo revisado, propietarios/vínculos reales,
   resolución de conflictos y aprobación independiente. `ok` offline no autoriza
   importación. No se reimportan todavía respaldos con suplemento V2.
3. **Respaldo operacional:** el exportado conserva datos funcionales de la sesión;
   no exporta Auth, hashes de contraseña, locks, recibos ni todo el diario interno
   del servidor. No sustituye un respaldo administrativo de Firebase.
4. **Producción:** servidor y reglas exclusivos de emuladores. No se debe desplegar
   tal como está. Quedan revisión/configuración productiva, credenciales, límites
   operativos y pruebas con dispositivos físicos. El Auth Emulator acepta tokens
   de ensayo sin firma; ningún token de ese tipo se debe aceptar en producción.
5. **Offline/PWA:** instalación y worker originales se conservan. El worker de la
   copia de ensayo se desactiva para evitar cachés entre cuentas; las escrituras
   requieren servidor, no hay cola offline. Las confirmaciones pendientes sólo
   viven en memoria: revisar agenda/caja si se recarga antes de confirmarlas.
6. **Permisos:** manageAppointments, canSell, manageClients y manageServices.
   El administrador siempre conserva gestión general; no hay permisos arbitrarios
   ni asignación de privilegios mediante localStorage o el cuerpo de una solicitud.
7. **Auditoría npm:** se mantienen cinco avisos moderados transitivos de
   firebase-tools (pubsub/OpenTelemetry y gaxios/uuid), sin altos/críticos en la
   auditoría online de esta fase. No se ejecutó audit fix --force ni se cambiaron
   dependencias para ocultar avisos. Mismo lockfile que fase 2.

Guía: README-DEVELOPMENT.md. Contrato: FASE_3_PLAN.md. Datos de migración y mapeo:
FASE_3_MIGRACION.md. Los registros brutos y capturas de esta sesión quedan bajo
/tmp y artifacts/ (no versionados); sólo se suben código, fixtures ficticios y
resultados agregados. Ningún respaldo real ni foto de clientes se incorpora a Git.
