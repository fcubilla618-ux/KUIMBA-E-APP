# Entrega inicial — issue #1

Destino: fcubilla618-ux/KUIMBA-E-APP, beta-firebase-roles-cajas.
Base original: 0416733b8c32845255a27e428b2915bb0ddc0afe, PWA 3.13.
Origen recuperado: fcubilla618-ux/kuimbae-style-pwa,
feature/barberos-permisos-20261021, bbc796d1f07a3fd8d369e0a47ee7bd06ee74dfc4.

## Diseño y alcance
Conservar byte a byte HTML, logo, fotos, manifest y service worker originales.
Servidor exclusivo de desarrollo transforma en memoria el HTML original:
inicio de sesión Firebase Auth en memoria, perfil users/uid, consultas por dueño,
lectura en tiempo real y conexión exclusiva a emuladores con proyecto demo.
No reutilizar la interfaz simplificada ni el sincronizador V1 de arrays completos.
No activar escrituras: el servidor futuro debe validar choques de turnos y ventas
atómicas antes de permitirlas. Caja se lee de v2Cash, nunca se reconstruye desde
turnos ni se suma nuevamente v2Sales. Todos los roles requieren active=true.
El prototipo exige vínculo recíproco users.barberId ↔ v2Barbers.uid.
No es un despliegue ni una integración productiva terminada.

Alternativas: sustituir la interfaz por la beta pierde funciones; abrir datasets
V1 a barberos expone datos ajenos. Adaptar las pantallas originales con módulos
separados conserva la experiencia y permite verificar aislamiento primero.

## Archivos afectables y pasos
- [x] development/access.mjs, session.mjs: perfil, consultas, limpieza de listeners,
  estados cargando/sin registros/error/desconectado y protección frente a callbacks viejos.
- [x] development/firestore.rules y tests/rules.test.mjs: negar escrituras para
  todos; lecturas propias, costos admin, V1 admin, perfil inmutable y vínculos.
- [x] development/client.mjs, bridge.js, server.mjs: login y pantallas originales
  sin persistir datos de sesión ni reemplazar los originales; localhost únicamente.
- [x] development/audit.mjs: auditoría offline del formato exportFullBackup original,
  duplicados, referencias, totales y vínculos; salida sin datos personales.
- [x] tests: unidad, emulador, Android/tablet; documentar resultados reales.
- [x] Revisión del diff y preparación de primera entrega verificable para PR en borrador, sin merge.

## Riesgos y pendientes
Sin respaldo real no se puede diagnosticar si V1 está vacío o sin importar,
ni declarar una migración correcta. Estados vacíos no significan error de acceso.
Dani/Junior/Walter requieren verificación real previa a migrar; los fixtures son
sintéticos. La interfaz original interpola IDs en handlers: validar IDs antes de
entregarlos. No incluir costos en v2Products; reglas no ocultan campos.
Ninguna regla local debe desplegarse a producción: V1 está bloqueado para escritura
en este entorno aislado y necesita comparación con las reglas reales antes de uso.

## Fuentes oficiales
- https://firebase.google.com/docs/firestore/security/rules-query
- https://firebase.google.com/docs/emulator-suite/connect_firestore
- https://firebase.google.com/docs/auth/web/auth-state-persistence
