# Kuimba’e Style — Firebase en desarrollo · fase 2

Trabajo para [issue #1](https://github.com/fcubilla618-ux/KUIMBA-E-APP/issues/1),
solo en `beta-firebase-roles-cajas`. Servidor transaccional de ensayo sobre las **pantallas de
la PWA original 3.13**. Los archivos originales no se modifican. Abrir index.html
normalmente conserva la aplicación local original; Firebase solo se conecta al
servir la copia transformada en memoria mediante `npm run dev`.

## Ejecutar y verificar

Requisitos: Node 24+, Java 21+, npm y Chromium de Playwright.

```sh
npm ci
npx playwright install chromium
npm run dev
```

En otra terminal:

```sh
npm run test:all
```

El navegador usa http://127.0.0.1:4173. Pruebas y seed generan cuentas ficticias y
contraseñas aleatorias solo en memoria. No hay credenciales reales. El seed es un
helper exclusivo de pruebas; borra **solo** la base del emulador del proyecto demo.
No ejecutar simultáneamente varias instancias de emuladores. Las pruebas de navegador
inician el servidor local automáticamente si no está activo y reinician los fixtures entre proyectos.
No hay configuración ni comandos de hosting/deploy en este trabajo.

Para explorar manualmente las pantallas, mantener `npm run dev` y ejecutar en
otras terminales `npm run emulators:dev` y `npm run seed:demo`. Este último reinicia
solo el emulador y muestra las cuatro contraseñas ficticias recién generadas.
No guarda contraseñas ni datos en archivos. No correrlo durante las pruebas.

`npm test` ejecuta los tests unitarios sin emuladores.
Las capturas Android/tablet se guardan en `artifacts/` (ignorado por Git).
El service worker se conserva en el original y se desactiva en la copia de ensayo
para impedir cachés de otra sesión. Usar un origen/puerto nuevo para el ensayo;
no reutilizar un origen con un service worker instalado previamente.

## Qué permite esta entrega

- Firebase Auth email/contraseña con sesión en memoria y perfil real `users/{uid}`.
- Admin: lectura general e individual. Barbero: documento propio, agenda,
  servicios autorizados, ventas y caja filtradas por barberId.
- Catálogo sin costos internos; costos en colección separada solo para admin.
- Listeners en tiempo real con reemplazo por snapshot; caja desde v2Cash, sin
  sumar ventas dos veces ni fabricar movimientos desde turnos atendidos.
- Al salir, perder permisos o quedar sin conexión se ocultan y limpian registros.
- Estados distintos para carga, datos vacíos y permisos/conexión fallida.
- **Escrituras directas de clientes bloqueadas**, incluso admin, por reglas.
  Los formularios de turnos y venta llaman al servidor autenticado de ensayo.
- Crear/modificar/cancelar turnos con exclusión transaccional por barbero/día y
  revisión para no pisar cambios de otro dispositivo. Admin puede reasignar a un
  barbero activo con un servicio autorizado para ese barbero.
- Atender registra una venta y caja individual con precio histórico del turno.
  Cancelar un turno cobrado agrega una reversión, sin borrar los registros.
- Venta de producto: precio vigente del servidor, descuento de stock y venta/caja
  individuales en una sola transacción. La caja general suma esos mismos registros.
- Claves idempotentes para reintentos y botón «Reintentar confirmación» cuando se
  pierde la respuesta. No empezar otra intención hasta resolver la pendiente.
- Fecha contable y filtro «Hoy» usan America/Asuncion; timestamps de auditoría UTC.
  Catálogo, precios, perfiles, notas, ajustes y restauración aún no admiten escritura
  remota. Sus funciones originales permanecen en el HTML intacto.

El contrato está en [plan fase 2](docs/integration/FASE_2_PLAN.md) y la validación en
[resultados fase 2](docs/integration/FASE_2_RESULTADOS.md). El servidor usa Firebase
Admin SDK exclusivamente con los emuladores. No usarlo como servidor productivo.

## Recuperación y auditoría

Se recuperaron `audit-v1.mjs` y `preview-appointments.mjs` del commit
`bbc796d1f07a3fd8d369e0a47ee7bd06ee74dfc4` de
`fcubilla618-ux/kuimbae-style-pwa`, rama `feature/barberos-permisos-20261021`.
Se adaptaron sus mensajes CLI para no imprimir fragmentos de JSON personal.
El adaptador nuevo conserva el diseño de `firebase-v2-data.js` (consulta restringida
por dueño); exige active=true también a admin y añade seguimiento del perfil,
limpieza de sesión y vínculo recíproco. No se copiaron credenciales, IDs reales,
reglas inseguras de escritura ni el sincronizador V1 de arrays compartidos.

```sh
node development/audit-cli.mjs /ruta/privada/respaldo.json /ruta/privada/vinculos.json
```

`vinculos.json` es un mapa UID → barberId, verificado manualmente fuera del repo.
La auditoría no conecta a Firebase ni escribe archivos; solo imprime conteos,
total de caja y errores sin nombres/teléfonos. Detecta duplicados, referencias
rotas, stock/precios inválidos y choques de agenda. Mantiene precios históricos.
`ready` solo indica que pasan las validaciones offline; siempre exige verificar
los perfiles reales antes de migrar. No existe importación automática.

Sin respaldo real no se puede afirmar si los ceros de la beta proceden de un V1
vacío, no importado o de otros errores. No convertir errores de permisos en listas
vacías. Walter, Dani y Junior necesitan verificación real de sus vínculos antes
de cualquier migración. También queda pendiente mapear servicios compartidos,
ventas históricas sin dueño, notas de clientes y ajustes al esquema V2.

Ver [plan, límites y riesgos](docs/integration/PLAN.md). Las reglas son exclusivas
del emulador; no sustituyen las reglas reales. Esta entrega no está lista para
producción. No publica, no fusiona main y no migra datos reales.
