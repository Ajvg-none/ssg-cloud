# AGENTS.md – SGG Cloud

Sistema de Garantías para ópticas. Monorepo sin tooling compartido: `backend/` y `frontend/` son paquetes independientes.

## Stack

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend | Express 5 + Prisma v7 + PostgreSQL | CommonJS (`require`), sin TypeScript |
| Frontend | React 19 + Vite 8 + Tailwind 3 | ESM, sin TypeScript, Zustand, React Router v7 |
| ERP externo | GesVision REST API | `app.gesvision.com`, credenciales en `.env` |
| Impresión | QZ Tray (cliente local del lab) + `qz-tray` npm en frontend | RAW ESC/POS vía WebSocket local; **firma digital SHA512** vía `/api/qz/*` para impresión silenciosa |
| VCA | Entrega nativa del backend (fs + cron) | El backend genera y escribe el `.vca` en `lab.vcaNetworkPath`; sin agente externo |
| Logs | Winston + winston-daily-rotate-file (rotación diaria, 14d) | `backend/logs/sgg-*.log`; retención configurable con `LOG_RETENTION_DAYS` |

## Comandos

```bash
# Backend (puerto 3000)
cd backend
npm run dev              # nodemon src/server.js
npm run start            # node src/server.js (producción)
npm run prisma:generate  # npx prisma generate
npm run prisma:migrate   # npx prisma migrate dev
npm run db:reset -- --yes # ⚠️ DESTRUCTIVO: vacía la BD y deja solo admin/admin123

# Frontend (puerto 5173)
cd frontend
npm run dev              # vite
npm run build            # vite build
npm run lint             # oxlint (sin typecheck)
npm run preview          # vite preview (build servido)
```

No hay comandos de test reales. `backend/test.js` es un script manual contra el login y creación de garantías.

## Prisma v7 — Patrón de conexión

La mayoría de los archivos que usan BD crean su propia conexión con el patrón driver adapter:

```js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

Excepción: `config/prisma.js` exporta un singleton compartido usado por `services/vcaService.js`.

El proyecto tiene Prisma skills instaladas (`backend/skills-lock.json`).

## Arquitectura

```
backend/src/
  server.js          — entrypoint, registra rutas y cron
  config/            — prisma.js (singleton), logger.js (winston daily rotate), gesvision.js
  routes/            — auth, store, lab, admin
  controllers/       — lógica de cada ruta
  middleware/
    auth.js          — JWT (Bearer token, adjunta req.user)
    role.js          — requireRole(['ADMIN','TIENDA',...])
  services/
    syncService.js   — consulta GesVision y guarda en OrderCache
    vcaService.js    — entrega nativa del VCA (fs) + reintentos
  legacy/            — CÓDIGO LEGADO: NO REESCRIBIR
    gesvisionApi.js  — cliente HTTP a GesVision
    fetchAndMapOrder.js — mapea datos crudos de orden
    lensware.js      — genera contenido VCA (formato Lensware)
    printer.js       — tickets ESC/POS (escpos, Bixolon)
  cron/
    orphanCleanup.js — cada 5 min, resetea PROCESSING → PENDING
    vcaDeliveryCron.js — entrega VCA local (fs) periódica
```

### Roles y autenticación

| Rol | Ruta base | Auth | UI |
|-----|----------|------|-----|
| `ADMIN` | `/api/admin/*` | JWT + `requireRole(['ADMIN'])` | `/admin` |
| `TIENDA` | `/api/store/*` | JWT + `requireRole(['TIENDA'])` | `/store` |
| `LABORATORIO` | `/api/lab/*` | JWT + `requireRole(['LABORATORIO','ADMIN'])` | `/lab` |

### Flujo de garantía

**Impresión del ticket (QZ Tray desde el frontend):**

1. Tienda consulta orden en GesVision (`GET /api/store/order/:n`)
2. Tienda crea garantía (`POST /api/store/warranties`) → status `PENDING` → se imprime **solo el formato A4** en el navegador (la tienda NO imprime el ticket tickera)
3. Lab abre el dashboard y pulsa "Procesar" sobre una garantía PENDING
4. Frontend: `connectQZ()` → `GET /api/lab/ticket-buffer/:id` (backend genera buffer ESC/POS base64) → `printRawData(printerName, base64)` imprime con QZ Tray → `POST /api/lab/warranties/:id/complete` → status `COMPLETED`
5. Cron limpia garantías atascadas en PROCESSING >5min → vuelta a `PENDING`

> El ticket-buffer **ya no genera ni devuelve datos VCA**. No usar `qz.file.write` desde el navegador.

**Firma digital QZ Tray (impresión silenciosa, sin diálogos):**

- Credenciales en `backend/keys/` (`qz-private-key.pem`, `qz-cert.pem`, `qz-cert.crt`); generarlas con `cd backend && npm run qz:genkeys`. Rutas configurables con `QZ_PRIVATE_KEY_PATH` / `QZ_CERT_PATH`. **La carpeta `keys/` está gitignoreada — no commitear la clave privada.**
- Frontend (`services/qzprintService.js`): `setCertificatePromise` + `setSignaturePromise(SHA512)` consumen `GET /api/qz/certificate` y `GET /api/qz/sign?request=...`. Antes de imprimir, `printRawData` valida con `checkQzSigning()` y traduce el 503 a un mensaje legible.
- **Si faltan credenciales en el servidor la impresión NO funciona**: `/api/qz/certificate` y `/api/qz/sign` responden **503** y QZ Tray aborta con `Failed to sign request` (al tener promesas de firma configuradas NO vuelve a mostrar sus diálogos de confirmación). El backend avisa al arrancar (`loadKeys()` en `server.js`); el fix es crear `backend/keys/`.
- Para que un PC imprima sin diálogos: confiar el certificado UNA vez — QZ Tray → icono bandeja → Advanced → **Site Manager** → arrastrar `qz-cert.crt` (alternativa: copiarlo como `C:\Program Files\QZ Tray\override.crt` y reiniciar QZ Tray)
- Cambio de computadora = instalar QZ Tray + repetir ese paso; la clave privada nunca sale del servidor
- ⚠️ **El par que vive en la raíz del repo (`private-key.pem` + `digital-certificate.txt`) es el certificado DEMO de QZ Industries** (`CN=QZ Tray Demo Cert`), cuya clave privada es pública: cualquier QZ Tray lo confía por defecto (no requiere Site Manager), por eso sirve como puente, pero no debe usarse en producción.
- **Rotación pendiente a certificado propio**: `cd backend && npm run qz:genkeys` (invalida el par actual) y luego confiar `backend/keys/qz-cert.crt` en **cada** PC que imprime, incluida la del servidor (su `override.crt` actual es el demo). Checklist: instalar/abrir QZ Tray → Advanced → Site Manager → arrastrar `qz-cert.crt` → probar con "Probar Impresión" en el panel del laboratorio.

**Entrega del archivo VCA (nativa, backend local):**

1. La tienda crea la garantía (`POST /api/store/warranties`) con `vcaDeliveredAt = null`.
2. Un cron (`cron/vcaDeliveryCron.js`, `VCA_RETRY_CRON`) ejecuta `services/vcaService.js` → genera el contenido `.vca` (legacy/lensware) y lo escribe **directamente con `fs`** en `lab.vcaNetworkPath` (escritura atómica `tmp` + `rename`, idempotente).
3. Al escribir OK marca `vcaDeliveredAt`; si falla (red/permisos) incrementa `vcaAttempts` y guarda `vcaLastError` para reintentar, **sin afectar la garantía**.
4. Ya no existe agente de polling: se eliminaron `routes/agentRoutes.js` y `middleware/labApiKey.js`. Config por `.env`: `VCA_WRITE_TIMEOUT_MS`, `VCA_MAX_ATTEMPTS`, `VCA_RETRY_CRON`. El corte “sin backfill” es **persistente** en `app_settings.vca_local_since` (sobrevive reinicios); `VCA_LOCAL_SINCE` lo sobrescribe manualmente.

### Convenciones del proyecto

- **Backend es CommonJS**: usa `require()`/`module.exports`, NO `import`/`export`
- **Frontend es ESM**: usa `import`/`export`
- **Legacy code**: `backend/src/legacy/` es código portado del sistema en producción. No reescribir la lógica interna. Solo adaptar para recibir parámetros externos (URLs, credenciales) en vez de depender de variables de entorno fijas.
- **Winston logger**: usar `logger.info()`/`logger.error()` etc. No `console.log`. Importar desde `../config/logger`.
- **bcrypt para passwords**: usar `bcrypt.compare()`/`bcrypt.hash()`.
- **Tailwind custom colors**: usar `opticolor-red`, `opticolor-gray-*` (definidos en `tailwind.config.js`).
- **Oxlint**: único linter del frontend. Config en `.oxlintrc.json`. Solo reglas react/rules-of-hooks y react/only-export-components.
- **No hay typecheck** en ningún paquete.

## Categorías de garantía (TIENDA / LABORATORIO)

El campo `warranties.category` (enum Prisma `WarrantyCategory`) indica **dónde originó el defecto**, no quién creó la garantía. Históricas y las que no lo envían → `TIENDA` (default).

- **Fuente única de verdad**: `backend/src/warrantyCategories/registry.js` (mapa key → descriptor). La API pública es `backend/src/warrantyCategories/index.js`; **ningún módulo importa la lista cruda**.
- **Añadir una categoría** = 3 pasos sumamente aditivos: (1) entrada en `registry.js`, (2) valor en el enum de `schema.prisma` + migración `ALTER TYPE ... ADD VALUE`, (3) `npm run prisma:generate`. Después aparece sola en `GET /api/warranty-categories`, en el selector del formulario y en los filtros de lab/admin. No tocar controllers ni componentes.
- **Tipos de garantía por categoría**: slot `warrantyTypes` del descriptor. Semántica: `null` = hereda la lista de TIENDA (categorías futuras); `[]` = lista **declaradamente vacía** → no se puede crear una garantía de esa categoría (backend responde 400 y el formulario bloquea el selector de tipo). LABORATORIO hoy tiene los 3 tipos **habilitados** (`Material no Solicitado`, `Formula no solicitada`, `Material Dañado`, decisión directiva 2026-10): **no generan VCA ni ticket** (política `deliverVca/printTicket=false` del descriptor, combinada con la lógica por tipo en `CreateWarrantyUseCase`), **sí generan la Orden A4** (impresa por la tienda; condition del print = `warrantyCase !== 'NEW_ORDER'`) y **nacen COMPLETED** (estado derivado: sin entregas operativas → COMPLETED). VCA y ticket NO dependen de la categoría salvo por esa política (contenido idéntico). El A4 de tienda muestra la categoría impresa.
- Las garantías de categoría **LABORATORIO** nacen `COMPLETED` con `processedAt`, **no encolan outbox VCA** ni admiten impresión de ticket (`409` en ticket-buffer), y la Orden A4 la imprime la tienda al guardar.
  
## Prerrequisitos de ejecución

1. PostgreSQL corriendo con BD `sistema_garantias`
2. Copiar/crear `backend/.env` con `DATABASE_URL`, `JWT_SECRET`, credenciales GesVision
3. `cd backend && npm install && npm run prisma:generate && npx prisma db push && npx prisma db seed`
4. `cd frontend && npm install`
5. Ejecutar backend y frontend en terminales separadas

## Advertencias

- **El `.env` del backend contiene credenciales reales de producción de GesVision.** No commitear a repositorios públicos. Rotar si esto fue expuesto.
- El archivo `backend/.gitignore` NO excluye `.env` — las credenciales están commiteadas actualmente.
- No hay tests automatizados. Cualquier cambio en auth, garantías o legacy debe probarse manualmente con `backend/test.js` o curl.
- `frontend/src/store/warrantyFormStore.js` (Zustand) mantiene el estado del formulario "Nueva Garantía" entre navegación de tabs de tienda.
