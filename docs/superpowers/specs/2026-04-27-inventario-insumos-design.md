# Inventario de insumos médicos — Diseño Fase 1

**Fecha:** 2026-04-27
**Estado:** Diseño aprobado — listo para plan de implementación
**Scope:** Fase 1 (catálogo + lotes + conteo + auditoría). Fase 2 documentada como deuda técnica al final.

## Contexto

Hoy las enfermeras de curaciones avanzadas en CESFAM Pompeya (Comuna Quilpué) gestionan insumos médicos en planillas manuales. El proceso es:

- **Recepción**: ~1 vez al mes llega un pedido. Se registran lotes con vencimiento.
- **Conteo**: cada viernes se hace inventario físico de todo lo que hay.
- **Auditoría**: el Servicio de Salud audita periódicamente disponibilidad de insumos para curación de pie diabético (Canasta CAPD según ANEXO 5 del decreto GES 2022-2025). Se llena un Excel a mano (`CURACIONES.xlsx`).
- **Solicitudes de compra**: ~1 vez al mes se llena un Excel (`NUEVO FORMATO SOLICITUD UNIDADES`) pidiendo reposición.

Los productos se identifican por **código AVIS** (numérico, asignado por la Comuna de Quilpué). Otras comunas usan **RAYEN**. El Servicio de Salud puede usar otros sistemas y, aunque use AVIS, sus códigos pueden no coincidir con los de Quilpué.

## Objetivo Fase 1

Reemplazar el conteo manual y la generación manual del Excel auditable por:
1. Catálogo de productos con códigos externos (multi-comuna a futuro).
2. Lotes con fecha de vencimiento + alerta visual a 1 mes.
3. Recepciones y conteos como movimientos auditables.
4. Generación automática del Excel auditable de Canasta CAPD.

Quedan fuera (Fase 2):
- Solicitudes de restock mensuales y su Excel.
- Push del PWA / email para alertas de vencimiento.
- Llenado automático de columnas "Stock mes anterior" / "Stock solicitado mes actual".
- Decremento de stock al hacer curaciones (manejo de consumo por atención).

## Decisiones tomadas en brainstorming

| Tema | Decisión |
|---|---|
| Granularidad de stock | Por lote (con vencimiento) |
| Recepción vs. conteo | Flujos separados |
| Catálogo | `products` + `product_codes` (1 producto → N códigos externos) |
| Mapeo canasta | DB seedeado + UI admin para refinar |
| Notificaciones | In-app: banner + filas rojas (sin push/email Fase 1) |
| Excel auditable | Dos modos: al día actual / mes calendario seleccionable |
| Botas (`ORTESIS`) | NO entran al inventario (gestión externa por kinesiología) |
| Carga catálogo | Endpoint admin de bulk import desde `.xlsx` |
| `lotCode` | String libre del fabricante |
| Multi-establecimiento | Modelado desde Fase 1 (hoy: solo CESFAM Pompeya) |
| Cálculo de stock | Event-sourced (derivado de `lot_movements`) |
| Procesamiento Excel | Backend (`xlsx` lazy import como PDFKit) |

## Arquitectura

### Módulos backend nuevos

| Módulo | Path | Responsabilidad |
|---|---|---|
| Establishments | `backend/src/establishments/` | Catálogo de establecimientos. Hoy solo Pompeya (seedeado) |
| Products | `backend/src/inventory/products/` | Catálogo + códigos externos + bulk import Excel |
| Canasta | `backend/src/inventory/canasta/` | Categorías Canasta CAPD + mapeo categoría↔productos |
| Lots | `backend/src/inventory/lots/` | Lotes (CRUD + búsqueda) |
| Movements | `backend/src/inventory/movements/` | RECEPTION/COUNT/ADJUSTMENT + cálculo stock derivado |
| Stock counts | `backend/src/inventory/stock-counts/` | Sesión de conteo del viernes (DRAFT/CLOSED) |
| Audit export | `backend/src/inventory/audit-export/` | Genera Excel auditable Canasta CAPD |

Cada módulo sigue el patrón del repo: `*.entity.ts`, `*.dto.ts`, `*.controller.ts`, `*.service.ts`, `*.service.spec.ts`, `*.module.ts`.

### Pantallas frontend nuevas

| Pantalla | Path | Quién | Función |
|---|---|---|---|
| Lista de inventario | `frontend/src/pages/inventory/InventoryListPage.tsx` | user | Stock actual por producto, alertas vencimiento, búsqueda |
| Recepción | `frontend/src/pages/inventory/ReceptionPage.tsx` | user | Registrar lote nuevo cuando llega pedido |
| Conteo del viernes | `frontend/src/pages/inventory/StockCountPage.tsx` | user | Tabla editable de cantidad por lote, DRAFT con autosave, cierre |
| Catálogo (admin) | `frontend/src/pages/inventory/CatalogAdminPage.tsx` | admin | Bulk import Excel, listar/editar productos |
| Canasta (admin) | `frontend/src/pages/inventory/CanastaAdminPage.tsx` | admin | Editar mapeo categoría↔productos |
| Exportar auditoría | `frontend/src/pages/inventory/AuditExportPage.tsx` | user | Descargar Excel Canasta CAPD (al día / mes) |

### Integración con app actual

- Nueva entrada "Inventario" en menú lateral del `Layout.tsx` (visible si autenticado).
- Sub-rutas: `/inventory`, `/inventory/reception`, `/inventory/count`, `/inventory/audit-export`. Admin: `/inventory/admin/catalog`, `/inventory/admin/canasta`.
- Banner global de vencimiento en `Layout.tsx` (consume `GET /api/inventory/expiring`). Se muestra si hay ≥1 lote venciendo en 30 días.
- Multi-establecimiento: backend acepta `establishmentId` en queries/payloads. En Fase 1 frontend lo hardcodea a `1` (Pompeya). Si en el futuro hay >1, se agrega selector.

## Modelo de datos

8 tablas nuevas. Convenciones del repo: `SERIAL` PK, FKs con `CASCADE` cuando hijo no tiene sentido sin padre, `createdAt` automático (`@CreateDateColumn()`).

### `establishments`

```
id           SERIAL PK
name         varchar         ej: "CESFAM Pompeya"
comuna       varchar         ej: "Quilpué"
createdAt    TIMESTAMP
```

Seed inicial: `(1, 'CESFAM Pompeya', 'Quilpué')`.

### `products`

Catálogo de productos cross-comuna.

```
id                SERIAL PK
name              varchar          ej: "APÓSITO RINGER CON PHMB 10X10 CM UNIDAD"
type              varchar          enum: INSUMO | MEDICAMENTO | ORTESIS | OTRO
packaging         varchar          ej: "UNIDAD" | "CAJA POR 100"
tracksExpiration  boolean DEFAULT true
createdAt         TIMESTAMP
```

`type=ORTESIS` queda en el catálogo para que estén "registrados", pero no se reciben al inventario en Fase 1 (decisión: kinesiología los gestiona aparte). El bulk import los carga igual.

### `product_codes`

Múltiples códigos externos por producto.

```
id          SERIAL PK
productId   integer FK products(id) ON DELETE CASCADE
codeSystem  varchar          enum: AVIS_QUILPUE | AVIS_OTRA | RAYEN | OTRO
code        varchar
UNIQUE(codeSystem, code)
INDEX(productId)
```

Hoy solo se seedea `AVIS_QUILPUE`. Cuando llegue otra comuna, se agregan filas adicionales sin cambiar producto.

### `lots`

Cada llegada física de un producto.

```
id                SERIAL PK
productId         integer FK products(id) ON DELETE CASCADE
establishmentId   integer FK establishments(id) ON DELETE CASCADE
lotCode           varchar NULL                   (del fabricante)
expiresAt         date NULL                      (NULL si producto no rastrea vencimiento)
receivedAt        date NOT NULL
createdAt         TIMESTAMP
INDEX(productId, establishmentId)
INDEX(expiresAt)                                 (para query de vencimientos)
```

### `lot_movements`

Event-sourced — fuente de verdad del stock.

```
id              SERIAL PK
lotId           integer FK lots(id) ON DELETE CASCADE
type            varchar          enum: RECEPTION | COUNT | ADJUSTMENT
delta           integer NULL     (signed; usado por RECEPTION/ADJUSTMENT)
absoluteValue   integer NULL     (usado por COUNT — cantidad observada)
stockCountId    integer NULL FK stock_counts(id) ON DELETE CASCADE
notes           text NULL
performedById   integer FK users(id)
createdAt       TIMESTAMP
INDEX(lotId, createdAt)
CHECK ((type = 'COUNT' AND absoluteValue IS NOT NULL AND delta IS NULL)
    OR (type IN ('RECEPTION','ADJUSTMENT') AND delta IS NOT NULL AND absoluteValue IS NULL))
```

### `stock_counts`

Agrupa los movimientos `COUNT` de una sesión semanal.

```
id              SERIAL PK
establishmentId integer FK establishments(id) ON DELETE CASCADE
countDate       date NOT NULL
status          varchar          enum: DRAFT | CLOSED
closedAt        TIMESTAMP NULL
performedById   integer FK users(id)
createdAt       TIMESTAMP
UNIQUE(establishmentId, countDate)              (un conteo por día/establecimiento)
```

### `canasta_categories`

11 categorías de insumos + 3 de ayudas técnicas según `CURACIONES.xlsx`.

```
id            SERIAL PK
name          varchar          ej: "Apósitos bacteriostáticos"
section       varchar          enum: INSUMOS | AYUDAS_TECNICAS
displayOrder  integer          (controla orden en Excel exportado)
isOptional    boolean          (marca "(opcional)" del Excel original)
notes         text NULL        (columna Observaciones del Excel)
```

Seed inicial (en migración):

| id | name | section | order | optional | notes (resumen) |
|---|---|---|---|---|---|
| 1 | Apósitos bacteriostáticos | INSUMOS | 1 | false | Ringer+PHMB; DACC lámina; PHMB Rollo; Miel Gel |
| 2 | Apósito absorbente | INSUMOS | 2 | false | Alginato 10x10; Carboximetilcelulosa 10x10; Espuma Hidrofílica c/Silicona 10x10; Espuma c/Hidrogel 10x10 |
| 3 | Apósito hidratante | INSUMOS | 3 | false | Poliéster 10x10; Hidrogel 15g; Tull silicona 10x10; Nylon 10x10 |
| 4 | Apósito regenerativo | INSUMOS | 4 | false | Colágeno; Inhibidor Metaloproteasa |
| 5 | Solución limpiadora antibiofilm o limpiadora | INSUMOS | 5 | false | (sin nota original) |
| 6 | Ácidos grasos hiperoxigenados (lubricante cutáneo) | INSUMOS | 6 | false | (sin nota original) |
| 7 | Curetas 3-4 mm | INSUMOS | 7 | false | (sin nota original) |
| 8 | Apósitos bactericidas | INSUMOS | 8 | false | Alginato c/Plata 10x10; Plata Nanocristalina 10x10; Tull c/Plata; apósito que contenga plata |
| 9 | Espuma limpiadora (opcional) | INSUMOS | 9 | true | (sin nota original) |
| 10 | Protector cutáneo spray (opcional) | INSUMOS | 10 | true | Nota original menciona ejemplos de bactericidas — pertenece a categoría 8, no a esta. Confirmar con usuario al revisar seed |
| 11 | Hidrogel con plata (opcional) | INSUMOS | 11 | true | (sin nota original) |
| 12 | Botín descarga antepié c/dorsiflexión | AYUDAS_TECNICAS | 12 | false | Gestión externa por kinesiología |
| 13 | Botín plano para descarga | AYUDAS_TECNICAS | 13 | false | Gestión externa por kinesiología |
| 14 | Bota larga removible | AYUDAS_TECNICAS | 14 | false | Gestión externa por kinesiología |

Nota sobre fila 10: en el Excel original `CURACIONES.xlsx` la columna Observaciones de la fila "Protector cutáneo spray (opcional)" contiene los ejemplos de bactericidas — parece una nota desplazada del Excel original (pertenece a fila 8 "Apósitos bactericidas"). Implementación: aplicar a fila 8 y dejar fila 10 sin nota. Confirmar con usuario al revisar seed.

### `canasta_category_products`

Mapeo M:N categoría↔producto.

```
canastaCategoryId   integer FK canasta_categories(id) ON DELETE CASCADE
productId           integer FK products(id)           ON DELETE CASCADE
PRIMARY KEY(canastaCategoryId, productId)
```

Mapeo inicial **propuesto** (a refinar con usuario antes del seed final). Plan de generación:
1. Aplicar pistas explícitas del Excel original (códigos AVIS conocidos: 1778, 857, 1408, 1776, 1760, 2091, etc.).
2. Búsqueda por patrones sobre `articulo` para el resto: regex como `/RINGER.*PHMB/`, `/ALGINATO.*PLATA/`, `/COLAGEN/`, `/METALOPROTEASA/`, `/PRONTOSAN|POLIHEXANIDA/`, `/LINOVERA|ÁCIDOS GRASOS/`, `/CURETA.*[34]/`, etc.
3. Productos sin match → no se asocian a ninguna categoría (válido: gasa, jeringa, guantes, etc. son insumo de inventario pero no son canasta CAPD).
4. Output: `backend/seeds/canasta-mappings.ts` con array `{categoryId, productCriteria: {avisCode?, namePattern?}}` + comentario de fuente por línea.
5. Aplicar mediante endpoint `POST /api/inventory/canasta/seed-defaults` (admin), después de bulk import del catálogo.

### Cálculo del stock derivado

Implementado en `LotsService.getCurrentStock(lotId, atDate?)`:

```
Stock = (último COUNT con createdAt ≤ atDate, su absoluteValue)
      + Σ delta de RECEPTION/ADJUSTMENT con createdAt > último COUNT y ≤ atDate
```

Si no hay COUNT, se usa la suma de RECEPTION/ADJUSTMENT desde la creación.

`atDate` por defecto: `now()`. Para auditoría por mes calendario X: `atDate = último viernes del mes X` o `last day of month X`, según preferencia de la usuaria — el endpoint acepta el parámetro y aplica la regla en backend.

## Endpoints

Todos bajo `JwtAuthGuard`. Endpoints marcados con 🔒 requieren `role=admin` (vía nuevo `RolesGuard` + `@Roles('admin')`).

### Productos

| Método | Ruta | Body / Query | Response |
|---|---|---|---|
| GET | `/api/inventory/products` | `?search=&type=&page=&limit=` | `PaginatedResponse<Product>` |
| GET | `/api/inventory/products/:id` | — | `Product` con `codes[]` |
| POST 🔒 | `/api/inventory/products/import` | multipart/form-data: file `.xlsx`, sheet name | `{created, updated, skipped, errors[]}` |
| PATCH 🔒 | `/api/inventory/products/:id` | partial Product | `Product` |
| POST 🔒 | `/api/inventory/products/:id/codes` | `{codeSystem, code}` | `ProductCode` |
| DELETE 🔒 | `/api/inventory/products/codes/:codeId` | — | 204 |

### Lotes y movimientos

| Método | Ruta | Body / Query | Response |
|---|---|---|---|
| GET | `/api/inventory/lots` | `?productId=&establishmentId=&expiringInDays=&active=` | `Lot[]` con `currentStock` |
| GET | `/api/inventory/lots/:id` | — | `Lot` con `movements[]` |
| POST | `/api/inventory/lots/reception` | `{productId, establishmentId, lotCode?, expiresAt?, receivedAt, quantity, notes?}` | `Lot` (incluye movement creado) |
| POST | `/api/inventory/lots/:id/adjustments` | `{delta, notes}` | `LotMovement` |
| GET | `/api/inventory/expiring` | `?days=30&establishmentId=` | `{lots: Lot[], total: number}` |
| GET | `/api/inventory/stock-snapshot` | `?establishmentId=&date=` | `{productId, lotId, stock}[]` |

### Conteos (stock counts)

| Método | Ruta | Body / Query | Response |
|---|---|---|---|
| GET | `/api/inventory/stock-counts` | `?establishmentId=&status=` | `StockCount[]` |
| GET | `/api/inventory/stock-counts/:id` | — | `StockCount` con entries |
| POST | `/api/inventory/stock-counts` | `{establishmentId, countDate?}` | `StockCount` (idempotente: si ya existe DRAFT del día, lo retorna) |
| PATCH | `/api/inventory/stock-counts/:id/lots/:lotId` | `{absoluteValue, notes?}` | `LotMovement` |
| POST | `/api/inventory/stock-counts/:id/close` | — | `StockCount` (status CLOSED) |

### Canasta y auditoría

| Método | Ruta | Body / Query | Response |
|---|---|---|---|
| GET | `/api/inventory/canasta` | — | `CanastaCategory[]` con `products[]` |
| PUT 🔒 | `/api/inventory/canasta/:id/products` | `{productIds: number[]}` | `CanastaCategory` |
| POST 🔒 | `/api/inventory/canasta/seed-defaults` | — | `{associated, skipped}` |
| GET | `/api/inventory/audit-export` | `?mode=current\|month&year=&month=&establishmentId=` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (binario) |

## Flujos de usuario

### Recepción del pedido mensual

1. Usuaria abre `/inventory/reception`.
2. Autocomplete por producto (busca en `products.name` y `product_codes.code`).
3. Form: `lotCode` (libre), `expiresAt` (date picker, opcional si `tracksExpiration=false`), `receivedAt` (default hoy), `quantity` (int>0), `notes` (libre).
4. Submit → backend: en transacción crea `lots` + `lot_movements{type=RECEPTION, delta=quantity, performedById=req.user.id}`.
5. Toast "Lote registrado: 50 unidades de Apósito Ringer PHMB". Form se limpia para registrar otro lote.
6. Atajo "Ver lotes recibidos hoy" → lista filtrada.

### Conteo del viernes

1. Usuaria abre `/inventory/count`.
2. `POST /api/inventory/stock-counts` (idempotente con `countDate=hoy`) → retorna DRAFT.
3. Tabla muestra todos los lotes activos del establecimiento, agrupados por producto:

```
[Producto: Apósito Ringer PHMB]
  - Lote L23B07 (vence 2026-08-15)   stock derivado: 12   [input cantidad observada: __]
  - Lote L23C01 (vence 2026-12-30)   stock derivado: 8    [input: __]
```

4. Cada cambio de input (debounced 500ms) → `PATCH /api/inventory/stock-counts/:id/lots/:lotId` con `absoluteValue`. Backend crea/actualiza el `lot_movements{type=COUNT, absoluteValue, stockCountId}`.
5. Header con `[Cerrar conteo]`. Al click: confirmación "Vas a cerrar el conteo del 2026-04-27. Después no podrás editar movimientos. Continuar?". Si confirma → `POST /close` → `status=CLOSED`, `closedAt=now()`.
6. Mientras esté DRAFT, otro usuario puede entrar y ver/editar (no hay lock por usuario).

### Alertas de vencimiento

1. Hook `useExpiringLots()` se llama desde `Layout.tsx` al montar.
2. `GET /api/inventory/expiring?days=30` retorna `{lots, total}`.
3. Si `total > 0`, se renderiza banner amarillo arriba: "5 lotes vencen en los próximos 30 días — Ver".
4. Click → navega a `/inventory?expiringFilter=30`.
5. En `InventoryListPage`:
   - Lote con `expiresAt < today + 30d AND ≥ today` → fila con `bg-red-50`, badge "Vence en X días".
   - Lote con `expiresAt < today` → badge `VENCIDO` (rojo intenso). Stock NO cuenta para auditoría (regla en `audit-export.service`).

### Exportación auditable

1. Usuaria abre `/inventory/audit-export`.
2. Toggle: "Al día actual" / "Mes específico". Si "mes": selector año/mes.
3. Click "Descargar" → `GET /api/inventory/audit-export?mode=current` (o `?mode=month&year=...&month=...`).
4. Backend:
   - Resuelve `snapshotDate`: hoy (current) o último día del mes (month).
   - Carga categorías (11 INSUMOS + 3 AYUDAS_TECNICAS, ordered).
   - Para cada categoría INSUMOS: `hasStock = ∃ lote con product en category.products AND expiresAt > snapshotDate AND currentStock(lotId, snapshotDate) > 0`.
   - Para AYUDAS_TECNICAS: deja columnas SI/NO en blanco con nota "Gestión externa por kinesiología" en Observaciones.
   - Genera `.xlsx` con formato exacto del original (`CURACIONES.xlsx`):
     - Header fila 0: "ANEXO 5. INSUMOS PARA CURACIÓN AVANZADA DE ÚLCERA DE PIE DIABÉTICO 2025" + fecha de snapshot.
     - Header fila 1: títulos de columnas A-F.
     - Filas 2..12: 11 categorías INSUMOS.
     - Fila vacía separadora.
     - Header AYUDAS_TECNICAS.
     - Filas 15..17: 3 categorías AYUDAS_TECNICAS.
   - Stream binario al cliente con `Content-Disposition: attachment; filename="canasta-curacion-avanzada-YYYY-MM-DD.xlsx"`.
5. `xlsx` importado **lazy** (`const XLSX = await import('xlsx')`) en el método del service para no inflar el bundle de inicio (alineado con la mitigación de OOM existente).

## Permisos

Roles del `User` actual (`user`/`admin`). Nuevo `RolesGuard` + decorator `@Roles('admin')`.

| Acción | user | admin |
|---|---|---|
| Ver catálogo, lotes, stock | ✅ | ✅ |
| Recepción, conteo, exportar | ✅ | ✅ |
| Bulk import / editar producto / códigos | ❌ | ✅ |
| Editar mapeo canasta | ❌ | ✅ |

`RolesGuard` chequea `req.user.role` (puesto por `JwtStrategy` ya existente). 403 si no calza.

## Migrations y seeding

### Migración nueva: `1714240000000-InventoryFoundation.ts`

Crea las 8 tablas con índices, FKs, CHECK constraints y seeds mínimos:
- `establishments`: 1 fila (CESFAM Pompeya / Quilpué).
- `canasta_categories`: 14 filas (11 INSUMOS + 3 AYUDAS_TECNICAS) con `displayOrder` y `notes`.

NO seedea `products` ni `canasta_category_products` — eso es trabajo posterior por endpoints admin.

### Bootstrap secuencia (primera vez en cada entorno)

1. `npm run migration:run` (o automático en deploy de Render): crea tablas + categorías canasta + establishment.
2. Admin abre UI Catálogo → sube `PRODUCTOS AVIS.xlsx` → backend hace upsert (`POST /api/inventory/products/import`).
3. Admin click en "Aplicar mapeo Canasta sugerido" (`POST /api/inventory/canasta/seed-defaults`).
4. Admin revisa y ajusta mapeo en UI Canasta (a productos específicos por categoría).

### Excel parser para bulk import

`backend/src/inventory/products/excel-import.service.ts`:
- Lee `PRODUCTOS AVIS` sheet (configurable por nombre).
- Columnas esperadas: `TIPO`, `CÓMO PEDIR`, `CODIGO AVIS`, `ARTICULO`.
- Por cada fila válida:
  - Buscar producto por `(codeSystem='AVIS_QUILPUE', code=CODIGO_AVIS)`.
  - Si existe: actualizar `name`, `type`, `packaging` si cambian.
  - Si no existe: crear `products` + `product_codes(AVIS_QUILPUE, CODIGO_AVIS)`.
- Errores por fila se acumulan en respuesta sin abortar (no-strict). Reporte: `{created, updated, skipped, errors: [{row, reason}]}`.

## Testing

| Suite | Cobertura crítica |
|---|---|
| `products.service.spec.ts` | Upsert por (codeSystem, code) idempotente; parser Excel con buffer mock; manejo de filas inválidas |
| `lots.service.spec.ts` | Crear lote con/sin expiración; query `getCurrentStock` con 0/1/N movimientos en distintas fechas; query `getStockSnapshot` |
| `movements.service.spec.ts` | RECEPTION suma; COUNT establece absoluto; ADJUSTMENT suma; rechazo de movimiento en stock_count CLOSED |
| `stock-counts.service.spec.ts` | Idempotencia DRAFT del día; transición CLOSED no permite edits; UNIQUE(establishment, date) |
| `audit-export.service.spec.ts` | SI/NO con lote vencido (debe ser NO); modo current vs. month; estructura del .xlsx generado (parseando el output) |
| `canasta.service.spec.ts` | Reemplazo M:N atómico; seed-defaults idempotente |
| `inventory.e2e-spec.ts` | Happy path: import catálogo → recepción → conteo → export Excel; verificar binario válido |
| Frontend `pages/inventory/__tests__/` | Render `InventoryListPage` con datos mockeados; banner expiring; debounce de PATCH en `StockCountPage` |

Cobertura objetivo: cálculo de stock y generación de Excel auditable son las áreas críticas — tests exhaustivos ahí.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `xlsx` infla bundle backend | Lazy import en service (igual que `pdfkit`). Verificar memoria post-deploy en Render starter (512MB) |
| Bulk import (660 filas) timeouts | Síncrono pero batched INSERT; sube `body-parser` limit a 5MB para multipart; reportar progreso en respuesta final |
| Concurrencia en conteo del viernes (dos usuarias) | Sin lock por usuario en Fase 1. PATCH es idempotente (último gana). Documentar limitación |
| App actual no tiene selector de establishment | Frontend hardcodea `establishmentId=1`. Backend ya lo recibe. Refactor cuando llegue 2do establecimiento |
| Mapeo canasta inicial puede ser incompleto/errado | UI admin permite corregir sin redeploy. Spec deja claro que es "sugerido" |
| Lotes huérfanos (sin movements) | No deberían existir: recepción crea ambos en transacción. Tests cubren |

## Deuda técnica documentada (Fase 2)

Las siguientes piezas quedan fuera del scope de esta fase y deben implementarse después:

1. **Solicitudes de restock mensuales** (módulo nuevo): registrar pedidos del mes con `quantity`, `consumoPromedio`, `cantidadSolicitada`. Generar Excel formato `CURACIONES AVANZADAS` (hoja del archivo `NUEVO FORMATO SOLICITUD UNIDADES`). Necesario para llenar columnas E/F del Excel auditable.
2. **Llenado automático de columnas E/F del Excel auditable** (`Stock mes anterior`, `Stock solicitado mes actual`): depende de (1).
3. **Notificaciones push (PWA)** y/o email para vencimientos: usar `vite-plugin-pwa` ya instalado + backend de envío con VAPID keys (web-push) o SendGrid.
4. **Decremento automático de stock por curación**: link entre `curaciones` y `lot_movements{type=ADJUSTMENT, delta=-N}`. Decisión clínica pendiente.
5. **Integración de código RAYEN**: agregar `codeSystem='RAYEN_<comuna>'` cuando llegue la primera comuna que lo use; UI de import compatible con su formato.
6. **Códigos del Servicio de Salud para auditorías**: agregar `codeSystem='SERVICIO_SALUD'` si pide reportes con sus códigos.
7. **Multi-establishment activo en UI**: selector visible cuando el usuario pertenece a >1; hoy hardcoded a `1`.
8. **Roles de auditor (read-only)**: hoy solo `user`/`admin`. Si llega un perfil de auditor externo, agregar `role=auditor` con permisos de solo lectura.

## Glosario

- **AVIS**: sistema de codificación interno de la Comuna de Quilpué para insumos médicos.
- **RAYEN**: sistema de gestión clínica usado por otras comunas (con su propia codificación).
- **Canasta CAPD**: conjunto mínimo de insumos requeridos para curación avanzada de pie diabético, según ANEXO 5 del decreto GES 2022-2025.
- **CESFAM**: Centro de Salud Familiar (atención primaria).
- **Lote**: unidad de stock proveniente de una recepción específica, con código del fabricante y fecha de vencimiento.
- **Conteo**: sesión de inventario físico (semanal, viernes), agrupa movimientos `COUNT` sobre lotes activos.
