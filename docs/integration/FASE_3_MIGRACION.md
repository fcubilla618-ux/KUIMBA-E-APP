# Auditoría y simulación offline de fase 3

No hay escritura Firebase, credenciales, red, importación real ni respaldo real
verificado. Las pruebas usan exclusivamente datos sintéticos. Una auditoría sin
errores sólo acredita los controles implementados; no autoriza restauración real.

`await prepareMigration(backup, mapping)` en
`development/migration/phase3-plan.mjs` genera documentos privados en memoria y un
`report` exclusivamente agregado. Nunca renderizar, registrar ni exportar el plan
completo. Las claves de documentos son relativas a ROOT: `v2Barbers/id`, etc.
`simulateMigration(plan, existingDocuments={})` clona un diccionario de documentos:
crea los ausentes, reconoce los idénticos y bloquea **todo** ante un conflicto o
una auditoría fallida. No modifica sus entradas. Repetir sobre el resultado no
crea documentos nuevos.

Mapeo explícito (sin nombres ni credenciales inferidas):

```json
{
  "barberLinks": {"barber-id": "auth-uid-existente"},
  "serviceAssignments": {"servicio-global-id": ["barber-id"]},
  "productSaleOwners": {"venta-sin-dueno-id": "barber-id"},
  "clientOwners": {"clave-cliente-original": ["barber-id"]}
}
```

`userLinks` propone vínculos recíprocos; no crea usuarios Auth ni inventa perfiles,
roles o permisos. El operador debe verificar las cuentas y vínculos recíprocos
antes de cualquier futura importación. `users`/`permissions` en mapping se
rechazan. Servicios globales reciben ID `servicio-id` + `-` + `barber-id`;
colisiones bloquean. El fingerprint de cliente usa SHA256 JSON canónico igual al
servidor. Las notas exigen asignación explícita incluso si hay un solo barbero.

El precio histórico se conserva, los costos de catálogo quedan separados y las
fotos raster se conservan sin transformación. Los asientos vinculados a turnos
usan `service-{appointmentId}` y las reversiones `reverse-{appointmentId}` para
coincidir con la protección contable del servidor. No se inventan cobros de
turnos atendidos: su ausencia bloquea y requiere revisión. No se cambian signos,
fechas ni importes. Referencias históricas sin catálogo inequívoco requieren
revisión manual. No se infiere dueño de ventas ni de notas compartidas.

CLI local: `node development/migration/phase3-cli.mjs respaldo.json mapeo.json
[documentos-existentes.json]`. Sólo imprime contadores, totales y códigos; errores
no incluyen rutas ni datos del archivo. El plan privado nunca se escribe a disco.
La compatibilidad completa con copias reales, resolución de incidencias y
aplicación remota quedan pendientes.

Los costos históricos de ventas (`unitCost`, `costTotal`, `profit`) se conservan
sólo en `v2ProductCosts/{productId}.historicalSales/{saleId}` como mapa privado,
no en documentos de ventas/caja legibles por barberos. No se recalculan a partir
del costo actual. No se inventa `createdBy` ni una fecha de creación operativa.

La configuración se guarda como `{id:'public', settings:{...}, revision:1}`.
Reimportar una exportación con `v2`/`v2Data` está bloqueado: requiere un contrato de
simulación separado que preserve revisiones, recibos y vínculos V2 existentes.

El auditor aplica los límites operativos V2: IDs (incluidos los generados) de
hasta 128 caracteres seguros, importes enteros hasta 1.000.000.000, stock hasta
1.000.000 y duración de 1 a 1440 minutos sin cruzar medianoche. Fotos: base64
canónico, firma raster compatible con MIME y máximo 250 KiB decodificados.
Horarios, rangos, claves y límites de configuración se comprueban antes de
marcar el plan válido. Una nota sin identidad de cliente en los turnos requiere
revisión en lugar de crear un perfil vacío.
