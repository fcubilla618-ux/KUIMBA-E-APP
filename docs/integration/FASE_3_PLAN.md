# Fase 3 — integración del catálogo, clientes, configuración y permisos

Base PR #2: 6588d87965000b0bd1917f92b3aa55184cabefa1, rama
beta-firebase-roles-cajas. Sólo emuladores y datos ficticios; no deploy ni merge.

## Arquitectura y contrato

Se amplía el servidor de operaciones existente, manteniendo los archivos de la
PWA original intactos. Nuevas colecciones: v2Clients (por barberId),
v2Settings/public (configuración del negocio compartida), users (sólo admin para
listas; perfil propio para sesión). Catálogo público sin costos; v2ProductCosts
privado. El servidor conserva revisiones, recibos idempotentes y auditoría.

Nuevas operaciones, además de action y operationId:
- service.save: id, revision (0 nuevo), barberId, name, description, price,
  duration, active. service.delete: id, revision. Baja lógica.
- product.save: id, revision, name, category, price, cost, stock, photo, active.
  product.delete: id, revision. Costos separados y stock auditado; baja lógica.
- barber.save: id, revision, name, role (descripción), photo, active. No acepta uid.
- client.save: id, revision, barberId, key, name, phone, notes. id determinista
  client- + SHA256(JSON canónico {barberId,key}); notas aisladas por propietario.
- settings.save: revision, settings con las claves originales DEFAULT_SETTINGS.
- user.create: email, password, name, role, barberId (vacío para admin), permissions.
- user.update: uid, revision, name, role, barberId, active, permissions.
- user.password: uid, password. Sólo admin; nunca persistir contraseña en Firestore.
- cash.payment: id, revision, payment. Sólo método de pago, no importe/propietario;
  corrección auditada, respetando reversiones y venta vinculada.

permissions={manageAppointments,canSell,manageClients,manageServices}, booleanos.
Barberos: tres primeros habilitados si falta campo (compatibilidad fase 2),
manageServices sólo con true explícito. Admin administra todo. Perfiles y vínculos
se leen dentro de cada transacción; nadie puede elevarse ni deshabilitar al último
admin. Operaciones Auth usan cuentas de ensayo y patrón de provisión deshabilitada
hasta confirmar el perfil, sin efectos externos dentro de un reintento Firestore.

Fotos raster data URL de tamaño limitado, compartidas sin duplicar costos. Las
ventas incrementan la revisión del producto para que una edición obsoleta no
restaure stock vendido. Los ajustes de horario se validan también al reservar.

## Plan de trabajo

- [x] Operaciones de gestión y pruebas de autorización, usuarios, catálogo,
  versiones/stock, datos privados, ajustes y fotos.
- [x] Listeners de clientes/configuraciones/usuarios y reglas de lectura aisladas.
- [x] Puente con los formularios originales: servicios/precios, productos/fotos,
  notas de clientes, barberos/fotos, ajustes/logo/horarios y método de pago.
- [x] Panel admin de usuarios, permisos y contraseñas de ensayo, sin confiar en
  autorización del navegador ni persistir contraseñas.
- [x] Auditoría y simulación de migración offline: IDs/dueños, precios históricos,
  fotos/configuración, totales y conflictos/idempotencia; ningún acceso Firebase.
- [x] Suite completa, revisión independiente, documentación de resultados,
  limitaciones explícitas y actualización del PR sin fusionar.

## Restauración y funciones destructivas

El exportado original se conserva y amplía para no perder documentos V2 ni costos
admin. Restaurar un respaldo real y vaciar globalmente la base remota quedan
bloqueados: se ofrece auditoría/simulación sin escritura, según el pedido de esta
fase. No afirmar que la migración real o un despliegue están completos. Compartir
imágenes/WhatsApp, navegación, filtros, instalación original y respaldos permanecen.
El worker de ensayo continúa desactivado para no cachear sesiones ajenas.

Fuentes: https://firebase.google.com/docs/auth/admin/manage-users,
https://firebase.google.com/docs/firestore/manage-data/transactions,
https://firebase.google.com/docs/firestore/security/rules-fields.

## Cierre de validación

81 pruebas aprobadas, sin omisiones; originales sin diferencias y build correcto.
Revisión independiente y regresiones de editor entre sesiones y compatibilidad
migración/servidor corregidas. Ver FASE_3_RESULTADOS.md para errores encontrados,
reproducción, límites y funciones expresamente pendientes.
