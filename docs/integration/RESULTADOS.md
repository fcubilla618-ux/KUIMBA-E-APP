# Resultado de la primera entrega — 2026-10-29

## Verificación ejecutada

`npm run test:all` terminó con código 0:

- 5 pruebas unitarias: perfil activo y rol; callbacks viejos tras cambio de sesión;
  permisos; respaldo sin duplicados ni vínculos rotos; stock y duración inválidos;
  superposición de agenda y formato corrupto.
- 5 pruebas Firestore Emulator: aislamiento directo y por consultas para los tres
  barberos, costos/V1 privados, lectura general admin, ausencia de perfil,
  inactividad, vínculo no recíproco y rechazo de toda escritura de clientes.
  Se probaron create/update/delete, cambio de dueño/rol, stock negativo,
  contabilidad y dos intentos simultáneos de reserva. Los errores PERMISSION_DENIED
  del log son los rechazos esperados por las aserciones.
- 4 pruebas Chromium: dos con viewport Android Pixel 7 y dos con viewport tablet
  iPad. Login, caja individual/general, turnos visibles en dos contextos y sin
  duplicación, actualización y borrado del historial del cliente, desconexión,
  reconexión, revocación y limpieza de DOM. Capturas revisadas visualmente;
  corregido el panel de sesión que agregaba una pantalla de espacio vacío.
- `npm run build:dev`, `node --check` de bridge/server y `git diff --check`: pasan.
- `git diff --exit-code HEAD -- index.html sw.js manifest.webmanifest '*.png'
  '*.jpg' LEEME_INSTALACION.txt`: sin cambios en archivos originales.

Las pruebas usan únicamente demo-kuimbae-original, Auth 127.0.0.1:19099 y
Firestore 127.0.0.1:18080, con perfiles y clientes ficticios.
Los puertos/browsers inicialmente fueron bloqueados por el sandbox; se ejecutaron
finalmente con los permisos de ejecución del entorno. Ninguna prueba de esta suite
quedó omitida ni se sustituyó un fallo por un éxito simulado.

## Revisión

Revisión independiente del código: corregidos duración inválida normalizada por
el preview recuperado e historial de cliente sin refrescar. Se agregaron aserciones
para ambos casos y se repitió la suite completa. No se habilitaron escrituras para
conseguir que las pruebas pasaran.

## Alcance y pendientes

Esta es una entrega inicial de lectura, preparada para PR **en borrador**. No está
terminada la integración productiva de la tarea #1:

1. Implementar servidor de reservas sin superposiciones y ventas transaccionales
   con idempotencia. Hoy el bloqueo de escritura es la protección, tanto admin
   como barberos; no existe aún creación de turnos/ventas desde la UI Firebase.
2. Obtener respaldo real y verificar fuera del repo los vínculos de cuentas de
   Walter, Dani y Junior. No se consultó Firestore real para hacerlo.
3. Mapear servicios compartidos, ventas sin dueño, notas/clientMeta, ajustes,
   fotos y catálogo; separar costos antes de cargar documentos V2. Auditar y
   comparar totales V1/V2 sin sobrescribir el origen.
4. Validar reglas productivas completas y transición V1 de administrador;
   estas reglas locales bloquean todas las escrituras V1/V2 y no se desplegaron.
5. Probar Android/tablet físicos y Safari/iOS. Los viewports de Chromium no
   acreditan pruebas en hardware real ni el motor Safari. La instalación/offline
   de la PWA original se conserva en sus archivos; el ensayo desactiva su worker
   deliberadamente para aislar sesiones y no certifica instalación productiva.

Se conservaron todas las funciones en los archivos originales. El modo conectado
de ensayo permite navegar sus pantallas y leer datos autorizados; la edición,
restauración y reinicio quedan bloqueados para no fingir sincronización.
No se publicaron aplicaciones, no se fusionó main, no se desplegaron reglas y no
se importaron, alteraron ni borraron datos reales de Firebase.
