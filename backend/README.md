# SGG Cloud — Backend

Backend del Sistema de Garantías para ópticas Opti-Color (Express 5 + Prisma v7 + PostgreSQL).

## Clasificación de responsabilidad del error (solo informativo)

Cada garantía registra quién causó el error mediante el campo `responsibleParty`
(enum `TIENDA | LABORATORIO`) y `responsibleSource` (`AUTO | MANUAL | null`).

### Mapeo automático (archivo `src/utils/responsibility.js`)

| Tipo de garantía | Responsable |
|---|---|
| Error de Medida | `LABORATORIO` |
| Error de Transcripcion | `TIENDA` |
| Error de RX | `TIENDA` |
| Error de Tipo de Lente (Material) | `null` (sin clasificar, decisión pendiente de negocio) |

- `responsibleSource = 'AUTO'`: derivado del tipo al crear la garantía
  (en `POST /api/store/warranties`); el valor `responsibleParty` del body se ignora.
- `null = sin clasificar`: el tipo de Lente es ambiguo (montura o cristal pueden
  haberse mal recomendado desde cualquiera de las dos partes).
- **Solo para reportes/auditoría**: no bloquea flujos, no aparece en el A4 ni en
  el formulario de tienda. Visible en el panel de admin (filtro, columna y cards)
  y en el modal de detalle.

### Backfill de datos históricos

```bash
npm run backfill:responsibility
```

Idempotente: solo actualiza registros con `responsibleParty = null`; las del
tipo de Lente quedan "sin clasificar" para la Fase 2.

### Fase 2 (pendiente)

Selector manual de responsable en el formulario de tienda para el tipo
"Error de Tipo de Lente (Material)": entonces `responsibleSource = 'MANUAL'`
y el enum ya lo soporta sin cambios de migración.
