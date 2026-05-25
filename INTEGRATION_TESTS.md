# Pruebas de Integración — Flujo Unfavorite (Quitar Favorito)

## Resumen rápido

Se crearon **2 pruebas de integración** para el proyecto Navidrome, un servidor de música open source hecho en Go + React.

### El problema que prueban

Cuando un usuario le quita la estrella ❤️ a una canción (unfavorite/unstar), hay dos cosas que deben funcionar correctamente:

1. El backend debe **aceptar** la petición del frontend
2. El cambio debe **guardarse** en la base de datos y no reaparecer si el usuario recarga la página

### Lo que se creó

Un solo archivo nuevo: `server/e2e/unfavorite_integration_test.go`, con dos pruebas:

**Prueba Level 2 — Frontend ↔ Backend**
> Verifica que cuando el frontend llama al endpoint `/rest/unstar`, el servidor responde con éxito. Simula el click del usuario en el botón de corazón.

**Prueba Level 3 — Frontend ↔ Backend ↔ Base de datos**
> Verifica que después de quitar el favorito, si el usuario recarga la página y el frontend vuelve a pedir la lista de favoritos (`getStarred`), la canción ya **no aparece**. Confirma que el cambio se guardó realmente en SQLite.

### Cómo funcionan técnicamente

- No hay mocks ni simulaciones — todo pasa por el código real de la aplicación
- Usan una base de datos SQLite real (en memoria, limpia antes de cada test)
- Simulan peticiones HTTP reales al router de la API Subsonic
- Están escritas con el framework **Ginkgo v2** (estilo BDD: Given/When/Then)

### Cómo se corren

**Ambas pruebas juntas:**
```bash
docker compose -f docker-compose.dev.yml exec backend go test -tags netgo,sqlite_fts5 ./server/e2e/... -v --ginkgo.focus="Unfavorite"
```

**Solo Level 2 (Frontend ↔ Backend):**
```bash
docker compose -f docker-compose.dev.yml exec backend go test -tags netgo,sqlite_fts5 ./server/e2e/... -v --ginkgo.focus="Level 2"
```

**Solo Level 3 (Frontend ↔ Backend ↔ Database):**
```bash
docker compose -f docker-compose.dev.yml exec backend go test -tags netgo,sqlite_fts5 ./server/e2e/... -v --ginkgo.focus="Level 3"
```

---

## Tabla de contenido

1. [Contexto y objetivo](#1-contexto-y-objetivo)
2. [Archivo creado](#2-archivo-creado)
3. [Infraestructura técnica](#3-infraestructura-técnica)
4. [Setup compartido (líneas 18–28)](#4-setup-compartido-líneas-18-28)
5. [Level 2 — Frontend ↔ Backend (líneas 34–53)](#5-level-2--frontend--backend-líneas-34-53)
6. [Level 3 — Frontend ↔ Backend ↔ Database (líneas 59–89)](#6-level-3--frontend--backend--database-líneas-59-89)
7. [Cómo correr las pruebas](#7-cómo-correr-las-pruebas)
8. [Qué demuestran en conjunto](#8-qué-demuestran-en-conjunto)

---

## 1. Contexto y objetivo

Navidrome permite a los usuarios marcar canciones como **favoritas** (estrella/corazón).
Estas pruebas verifican el flujo **inverso**: quitar una canción de favoritos (*unstar / unfavorite*).

El flujo real en la aplicación es:

```
Usuario hace click en el corazón
        │
        ▼
Frontend (React) llama a la API Subsonic
        │   POST /rest/unstar?id=<songID>
        ▼
Backend (Go handler) procesa la petición
        │   UPDATE annotation SET starred = false
        ▼
Base de datos SQLite persiste el cambio
        │
        ▼
Frontend recarga la lista de favoritos
(la canción ya no debe aparecer)
```

Las pruebas validan **dos puntos de corte** de ese flujo:

| Nivel | Capas probadas              | Pregunta que responde                                      |
|-------|-----------------------------|------------------------------------------------------------|
| 2     | Frontend ↔ Backend          | ¿El backend acepta la petición y avisa al frontend?        |
| 3     | Frontend ↔ Backend ↔ DB     | ¿El cambio persiste en la BD tras un reload de página?     |

---

## 2. Archivo creado

```
server/e2e/unfavorite_integration_test.go
```

Es el **único archivo nuevo** en este proyecto. No se modificó ningún archivo existente.

Vive dentro del paquete `e2e` junto con:

- `server/e2e/e2e_suite_test.go` — infraestructura compartida (DB, router, helpers)
- `server/e2e/subsonic_media_annotation_test.go` — otros tests de anotación ya existentes

---

## 3. Infraestructura técnica

### Framework: Ginkgo v2 + Gomega

| Elemento       | Para qué sirve                                                                 |
|----------------|--------------------------------------------------------------------------------|
| `Describe`     | Agrupa tests relacionados bajo un nombre descriptivo                           |
| `Ordered`      | Indica que los bloques internos corren en secuencia, no en paralelo            |
| `BeforeAll`    | Se ejecuta **una sola vez** antes de todos los `It` del bloque                 |
| `AfterAll`     | Se ejecuta **una sola vez** después de todos los `It` del bloque               |
| `It`           | Define un caso de prueba individual                                            |
| `Expect`       | Realiza una aserción; si falla, el test falla con mensaje descriptivo          |

### Helpers reutilizados del suite existente

Todos definidos en `server/e2e/e2e_suite_test.go`:

#### `setupTestDB()` (línea 466 del suite)
Hace tres cosas antes de cada grupo de tests:
1. **Restaura** la base de datos SQLite al estado inicial limpio (snapshot dorado)
2. **Construye** el `subsonic.Router` con todas las dependencias reales (sin mocks)
3. Deja disponibles las variables globales `ds` (DataStore), `router` y `ctx`

#### `doReq(endpoint, params...)` (línea 205 del suite)
Simula una petición HTTP completa **sin levantar un servidor real**:

```
doReq("unstar", "id", "abc123")
    │
    ├─ construye GET /unstar?u=admin&p=password&id=abc123&f=json
    ├─ lo pasa directamente al router (httptest.NewRecorder)
    ├─ el router ejecuta el handler real
    ├─ el handler llama al persistence layer real
    ├─ el persistence layer ejecuta SQL real en SQLite
    └─ retorna la respuesta JSON parseada como *responses.Subsonic
```

No hay mocks ni stubs en este camino. Es el mismo código que ejecuta la app en producción.

#### `ds.MediaFile(ctx).GetAll(...)` (línea 24 del test)
Consulta directamente el repositorio de canciones para obtener un ID válido de la base de datos de test.

---

## 4. Setup compartido (líneas 18–28)

```go
// línea 18
var _ = Describe("Unfavorite Integration Tests", Ordered, func() {
    var songID string   // línea 19 — ID de la canción que usarán AMBOS niveles

    BeforeAll(func() { // línea 21 — corre UNA sola vez antes de Level 2 y Level 3
        setupTestDB()  // línea 22 — restaura DB limpia + construye router real

        // línea 24 — obtiene la primera canción del filesystem falso ya escaneado
        songs, err := ds.MediaFile(ctx).GetAll(model.QueryOptions{Max: 1, Sort: "title"})
        Expect(err).ToNot(HaveOccurred()) // línea 25 — la consulta no debe fallar
        Expect(songs).ToNot(BeEmpty())    // línea 26 — debe existir al menos una canción
        songID = songs[0].ID             // línea 27 — guarda el ID para los dos tests
    })
```

**Qué hace exactamente:**

- `setupTestDB()` restaura la BD a un snapshot limpio, evitando que datos de otros tests contaminen estos.
- La consulta obtiene una canción real de la BD (cargada desde el filesystem falso en memoria que tiene canciones como "Come Together" de The Beatles).
- El `songID` se comparte entre Level 2 y Level 3 para que ambos trabajen sobre la misma canción.

---

## 5. Level 2 — Frontend ↔ Backend (líneas 34–53)

### Ubicación exacta en el archivo

| Sección     | Líneas   | Contenido                                             |
|-------------|----------|-------------------------------------------------------|
| `Describe`  | 34       | Apertura del bloque Level 2                           |
| `BeforeAll` | 35–39    | Pre-condición: marcar la canción como favorita        |
| `AfterAll`  | 41–44    | Limpieza: quitar favorito al terminar                 |
| `It`        | 46–52    | El test propiamente dicho                             |
| Cierre      | 53       | `})` — cierre del Describe Level 2                    |

### Código anotado línea por línea

```go
// línea 34
Describe("Level 2: UI removes song from favorites through real backend", Ordered, func() {

    // línea 35–39: PRE-CONDICIÓN
    BeforeAll(func() {
        resp := doReq("star", "id", songID)  // marca la canción como favorita
        Expect(resp.Status).To(Equal(responses.StatusOK))  // confirma que el star funcionó
    })

    // línea 41–44: LIMPIEZA (corre aunque el test falle)
    AfterAll(func() {
        doReq("unstar", "id", songID)  // deja la DB limpia para los tests siguientes
    })

    // línea 46–52: EL TEST
    It("returns a success response when unstarring a previously starred song", func() {

        // ACCIÓN (línea 48): simula el click del usuario en el botón de corazón
        resp := doReq("unstar", "id", songID)

        // VERIFICACIÓN (línea 51): el backend respondió con éxito
        Expect(resp.Status).To(Equal(responses.StatusOK))
    })
})
```

### Qué prueba

**Pregunta:** ¿Cuando el frontend llama `/rest/unstar`, el backend lo acepta y responde con éxito?

**Flujo probado:**

```
doReq("unstar", "id", songID)
        │
        ▼
router.ServeHTTP(w, r)              ← handler HTTP real
        │
        ▼
media_annotation.go → Unstar()     ← lógica de negocio real
        │
        ▼
sql_annotations.go → SetStar(false)← escritura real en SQLite
        │
        ▼
respuesta JSON con status="ok"
        │
        ▼
Expect(resp.Status).To(Equal(responses.StatusOK))  ✓
```

### Por qué es válido

El endpoint `/rest/unstar` es **exactamente la API que llama el frontend**. El hook `useToggleLove` en `ui/src/common/useToggleLove.jsx` llama `subsonic.unstar(id)` cuando el usuario hace click. Si el backend retorna `StatusOK`, el frontend sabe que puede actualizar el ícono del corazón inmediatamente sin recargar la página.

### Qué demuestra

- El handler HTTP recibe y parsea correctamente los parámetros de la petición
- La lógica de negocio ejecuta el unstar sin errores
- El backend comunica éxito al cliente con el formato correcto del protocolo Subsonic
- **No se verifica si el cambio persiste en BD** — eso es responsabilidad del Level 3

---

## 6. Level 3 — Frontend ↔ Backend ↔ Database (líneas 59–89)

### Ubicación exacta en el archivo

| Sección     | Líneas   | Contenido                                                  |
|-------------|----------|------------------------------------------------------------|
| `Describe`  | 59       | Apertura del bloque Level 3                                |
| `BeforeAll` | 60–64    | Pre-condición: marcar la canción como favorita             |
| `AfterAll`  | 66–69    | Limpieza: quitar favorito al terminar                      |
| `It`        | 71–88    | El test propiamente dicho                                  |
| Cierre      | 89–90    | `})` — cierre del Describe Level 3 y del Describe raíz     |

### Código anotado línea por línea

```go
// línea 59
Describe("Level 3: Unfavorite state persists after reload", Ordered, func() {

    // línea 60–64: PRE-CONDICIÓN
    BeforeAll(func() {
        resp := doReq("star", "id", songID)  // marca la canción como favorita
        Expect(resp.Status).To(Equal(responses.StatusOK))
    })

    // línea 66–69: LIMPIEZA
    AfterAll(func() {
        doReq("unstar", "id", songID)
    })

    // línea 71–88: EL TEST
    It("song remains not favorite and does not appear in favorites after re-fetching", func() {

        // ACCIÓN 1 (línea 73): el usuario quita el favorito
        resp := doReq("unstar", "id", songID)
        Expect(resp.Status).To(Equal(responses.StatusOK))  // línea 74

        // ACCIÓN 2 (línea 78): simula un RELOAD de página — nueva petición independiente
        resp = doReq("getStarred")

        // VERIFICACIONES (líneas 81–87)
        Expect(resp.Status).To(Equal(responses.StatusOK))  // línea 81 — la petición fue exitosa
        Expect(resp.Starred).ToNot(BeNil())                // línea 82 — la respuesta tiene datos

        // líneas 83–86: extrae los IDs de todas las canciones favoritas devueltas
        starredIDs := make([]string, 0, len(resp.Starred.Song))
        for _, s := range resp.Starred.Song {
            starredIDs = append(starredIDs, s.Id)
        }

        // línea 87: la canción desmarcada NO debe estar en la lista
        Expect(starredIDs).ToNot(ContainElement(songID))
    })
})
```

### Qué prueba

**Pregunta:** ¿Después de quitar un favorito, si el usuario recarga la página, la canción sigue sin aparecer en favoritos?

**Flujo probado:**

```
── PETICIÓN 1: quitar favorito ──────────────────────────
doReq("unstar", "id", songID)
        │
        ▼
SetStar(false, songID) → UPDATE annotation SET starred=0
        │
        ▼
SQLite escribe el cambio en disco
        │
── PETICIÓN 2: simula reload de página ──────────────────
doReq("getStarred")   ← petición completamente nueva
        │
        ▼
GetAll(starred=true)  → SELECT * FROM media_file
                          JOIN annotation ON starred=1
        │
        ▼
Lista de favoritos devuelta por la BD
        │
        ▼
Expect(starredIDs).ToNot(ContainElement(songID))  ✓
```

### La clave: dos peticiones independientes

La segunda llamada `doReq("getStarred")` es una **petición HTTP completamente nueva**. No hay ninguna variable en memoria compartida entre las dos llamadas. Esto es lo que simula un reload de página:

- El frontend cierra la pestaña y la vuelve a abrir → hace una nueva petición `getStarred`
- Si la canción apareciera en esa respuesta, significaría que el unstar **no se guardó en la BD**

### Por qué es válido

La función `getStarred` lee directamente de la tabla `annotation` en SQLite con el filtro `starred = true`. Si el `SetStar(false)` del paso anterior no escribió correctamente en la BD, la canción reaparecería. No hay caché, no hay estado en memoria — es lectura directa de disco.

### Qué demuestra

- El cambio de `SetStar(false, songID)` se escribió correctamente en la tabla `annotation` de SQLite
- El campo `starred` quedó en `false` y `starred_at` quedó en `NULL`
- El repositorio `GetAll` con filtro `starred=true` excluye correctamente la canción desmarcada
- El estado es **durable**: sobrevive a cualquier cantidad de recargas de página

---

## 7. Cómo correr las pruebas

### Requisito previo: tener Docker corriendo

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

> La primera vez tarda unos minutos en construir la imagen y descargar dependencias.
> Las siguientes veces usa `up -d` sin `--build`.

---

### Opción A — Solo los tests de unfavorite (Level 2 y Level 3)

```bash
docker compose -f docker-compose.dev.yml exec backend \
  go test -tags netgo,sqlite_fts5 ./server/e2e/... -v \
  --ginkgo.focus="Unfavorite"
```

Salida esperada:
```
Running Suite: Subsonic API E2E Suite
======================================
[BeforeSuite] ...
  Unfavorite Integration Tests
    Level 2: UI removes song from favorites through real backend
      ✓ returns a success response when unstarring a previously starred song
    Level 3: Unfavorite state persists after reload
      ✓ song remains not favorite and does not appear in favorites after re-fetching

Ran 2 of N specs in X seconds
SUCCESS!
```

---

### Opción B — Solo el Level 2

```bash
docker compose -f docker-compose.dev.yml exec backend \
  go test -tags netgo,sqlite_fts5 ./server/e2e/... -v \
  --ginkgo.focus="Level 2"
```

---

### Opción C — Solo el Level 3

```bash
docker compose -f docker-compose.dev.yml exec backend \
  go test -tags netgo,sqlite_fts5 ./server/e2e/... -v \
  --ginkgo.focus="Level 3"
```

---

### Opción D — Todos los tests e2e del proyecto

```bash
docker compose -f docker-compose.dev.yml exec backend \
  go test -tags netgo,sqlite_fts5 ./server/e2e/... -v
```

---

### Opción E — Generar reporte XML (JUnit)

Útil para entregar evidencia o integrar con herramientas de CI/CD:

```bash
docker compose -f docker-compose.dev.yml exec backend \
  go test -tags netgo,sqlite_fts5 ./server/e2e/... -v \
  --ginkgo.focus="Unfavorite" \
  --ginkgo.junit-report=/workspace/reporte_unfavorite.xml
```

El archivo `reporte_unfavorite.xml` quedará en la raíz del proyecto en tu máquina.

---

### Bajar los contenedores al terminar

```bash
docker compose -f docker-compose.dev.yml down
```

---

## 8. Qué demuestran en conjunto

Los dos tests juntos forman una **cadena de confianza** sobre el flujo completo:

```
Level 2 ──► El backend recibe y procesa la petición de unstar correctamente
Level 3 ──► El cambio persiste en la BD y es visible en consultas posteriores
```

Si el Level 2 falla: hay un problema en el handler HTTP o en la lógica de negocio.
Si el Level 3 falla: hay un problema en la escritura a SQLite o en la consulta de favoritos.
Si ambos pasan: el flujo completo de "quitar favorito" funciona de extremo a extremo.

### Archivos del proyecto involucrados en la ejecución

| Archivo | Rol en la prueba |
|---------|-----------------|
| `server/e2e/unfavorite_integration_test.go` | Los tests nuevos (Level 2 y Level 3) |
| `server/e2e/e2e_suite_test.go` | Infraestructura: `setupTestDB()`, `doReq()`, DB snapshot |
| `server/subsonic/media_annotation.go` | Handler HTTP de `/rest/star` y `/rest/unstar` |
| `persistence/sql_annotations.go` | `SetStar()` — escribe en la tabla `annotation` de SQLite |
| `persistence/sql_media_files.go` | `GetAll()` — lee canciones con filtro `starred=true` |
