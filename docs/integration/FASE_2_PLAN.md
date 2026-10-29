# Fase 2: operaciones del servidor — plan de implementación

Base: PR #2, rama beta-firebase-roles-cajas, commit
314e799b33eb801a5d976eb29be97a379e6edadf.

Objetivo: habilitar turnos y ventas reales de ensayo sobre las pantallas originales,
sin desplegar ni conectar a Firebase real. Se reutilizan perfiles, consultas,
reglas de aislamiento, listeners y auditoría de la fase 1.

## Contrato y límites

Servidor Node local con Firebase Admin SDK. Rechaza iniciar con destinos de
emulador/proyecto diferentes de demo-kuimbae-original, 127.0.0.1:18080/19099.
No acepta credenciales ni configuración productiva. Token Auth verificado en
servidor; rol, active y vínculo recíproco comprobados dentro de cada transacción.
Nunca se toma autorización de localStorage, del cuerpo ni de claims de rol.

POST /api/v2/operations, JSON con operationId y action:
appointment.create/update/cancel/complete, product.sell.
Operación idempotente por usuario y contenido canónico. Repetirla devuelve el
mismo resultado sin duplicar turnos, ventas, stock ni caja; reutilizar la clave
con otro contenido falla. Las actualizaciones exigen revision para no pisar
cambios de otro dispositivo. Importes enteros en guaraníes, calculados por el
servidor desde el servicio/producto; no se aceptan precio, importe ni stock del
cliente. La caja y las ventas se escriben exclusivamente desde estas operaciones.

Agenda: documento de exclusión por barbero/fecha leído y actualizado junto con
la consulta de turnos activos y la reserva. Serializa incluso dos agendas vacías.
Modificar fecha/barbero bloquea ambos días en orden estable; detecta también
turnos anteriores sin lock. Intervalos semiabiertos: terminar a las 11 permite
comenzar a las 11. Duración del servicio validada en servidor; sin cruce de día.

Caja: atender un turno crea una venta y un movimiento de servicio una sola vez.
Cancelar un turno atendido conserva los registros originales y agrega reversión
contable, nunca borra historia. Ventas de productos descuentan stock y generan
venta + caja del vendedor en una única transacción. Admin elige un barbero válido;
el barbero sólo puede operar su propia identidad. Movimientos sin costo privado.

Archivos originales HTML, logos, fotos, manifest, service worker sin modificar.
La copia servida añade puente de operaciones; catálogo, perfiles, precios,
respaldos y ajustes siguen protegidos de escrituras hasta sus respectivas fases.

## Pasos y pruebas

- [x] backend/validation.mjs: esquemas estrictos, fechas, cantidades, dinero,
  claves idempotentes y revisión; tests unitarios antes de implementar.
- [x] backend/runtime.mjs y operations.mjs: conexión exclusiva emulador, Auth,
  transacciones de perfil/agenda/ventas/caja/stock. Tests con cuatro cuentas,
  simultaneidad, cambios obsoletos, replay, cancelación, intento de dueño/precio
  ajeno, inactivos y fallos atómicos. Reglas cliente siguen sin allow write.
- [x] backend/http.mjs + development/server.mjs: transporte mismo origen,
  límites de cuerpo, tipos, token y errores sin datos privados.
- [x] development/operations-client.mjs + puente: crear/modificar/cancelar/atender,
  vender, elegir caja admin; no mutación optimista ni persistencia offline.
- [x] Tests unitarios + reglas + operaciones HTTP/transacciones + Android/tablet;
  documentación reproducible con resultados reales, revisión y actualización PR.

## Riesgos revisables

Admin SDK omite las reglas: cada operación debe autorizar dentro de la transacción.
Reintentos no pueden tener efectos externos. Precio del turno se congela al
reservar; completar no cambia el precio histórico. Cancelar no elimina contabilidad.
No importar datos reales. Ningún fixture o test debe depender de cuentas reales.
Los tokens sin firma del Auth Emulator sólo son válidos aquí; no es un servidor
productivo ni una certificación de despliegue/seguridad de producción.

Fuentes oficiales:
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/emulator-suite/connect_auth
- https://firebase.google.com/docs/admin/setup

## Resoluciones de la revisión

- Se agregó una confirmación independiente del estado visible para reintentar el
  payload original después de perder la respuesta de un commit.
- El día comercial se fijó en America/Asuncion para caja y filtros; createdAt sigue
  siendo UTC. Se verificó alrededor de la medianoche UTC.
- El flujo no edita contabilidad existente: sólo genera asientos o reversiones.
- La auditoría dejó cinco avisos moderados sólo de herramientas CLI, documentados;
  se corrigieron los avisos altos de gRPC sin degradar ni silenciar pruebas.

Validación final: 39 pruebas pasan; ver FASE_2_RESULTADOS.md.
