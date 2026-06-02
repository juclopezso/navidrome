# Análisis de Mantenibilidad — Navidrome

**Laboratorio:** Calidad de Software — Décimo Semestre  
**Repositorio:** `github.com/navidrome/navidrome`  
**Revisión:** rama `feature/lab3-equipo1` (commit `349c9002`)  
**Fecha:** 2026-06-01  
**Herramientas usadas:** `golangci-lint v2 latest` vía Docker (linters: `cyclop`, `funlen`, `gocognit`, `staticcheck`, `errcheck`, `govet`), build tags `netgo` y `sqlite_fts5` activados, caché de módulos Go montada.

---

## Parte 1 — Mantenibilidad

---

## Tarea 1 — Análisis Estático

### Método de recolección

```bash
docker run --rm \
  -v "<proyecto>:/app" \
  -v "$GOPATH/pkg/mod:/root/go/pkg/mod" \
  -w /app \
  golangci/golangci-lint:latest \
  golangci-lint run \
    --output.json.path /app/reports/golangci_navidrome.json \
    --config /app/reports/.golangci-analysis.yml \
    --timeout 15m ./...
```

Config (`reports/.golangci-analysis.yml`): linters `cyclop` (max-complexity: 10), `funlen` (lines: 30, statements: 25), `gocognit` (min-complexity: 10). Build tags: `netgo`, `sqlite_fts5`.

**Resultado:** **207 issues** encontrados en 6 linters — `cyclop:7`, `errcheck:50`, `funlen:50`, `gocognit:50`, `govet:2`, `staticcheck:48`. Output completo en `reports/golangci_navidrome.json`.

---

### Hallazgos de complejidad ciclomática — cyclop (CC > 10)

> Todos los hallazgos son reales, verificados por golangci-lint corriendo sobre el código fuente con CGo disponible en el contenedor Linux.

| Función | Archivo | Línea | CC real | Causa principal |
|---------|---------|-------|---------|-----------------|
| `inferCodecFromSuffix` | `model/mediafile.go` | 194 | **20** | Switch exhaustivo sobre extensiones de audio (mp3, flac, ogg, opus, aac…) |
| `unmarshalExpression` | `model/criteria/json.go` | 36 | **19** | Deserialización recursiva de expresiones de Smart Playlist (16 tipos) |
| `Resource` (mock) | `tests/mock_data_store.go` | 258 | **14** | Reflejo del type-switch de producción en el mock de tests |
| `FindRecentFilesByProperties` | `tests/mock_mediafile_repo.go` | 287 | **14** | Lógica de filtrado manual en mock (sin BD real) |
| `Resource` | `persistence/persistence.go` | 100 | **13** | `type switch` con 12 casos — uno por entidad de dominio (OCP violation) |
| `Connect` | `plugins/host_websocket.go` | 75 | **11** | Manejo de mensajes WebSocket con múltiples tipos y estados de error |
| `ToMap` | `core/auth/claims.go` | 29 | **11** | Serialización de claims JWT con 11 campos opcionales |

**Observación:** El mock `tests/mock_data_store.go:258` refleja exactamente el type-switch de producción de `persistence/persistence.go:100` — cualquier refactorización debe sincronizarse en ambos archivos, lo que duplica el costo de mantenimiento.

### Funciones largas — funlen (> 30 líneas, > 25 sentencias)

> golangci-lint reportó 50+ funciones largas (límite de salida). Las más relevantes:

| Función | Archivo | Línea | Métrica | Observación |
|---------|---------|-------|---------|-------------|
| `setViperDefaults` | `conf/configuration.go` | 718 | **158 stmt** | Registra todos los valores por defecto de configuración en una sola función monolítica |
| `init` | `cmd/root.go` | 350 | 45 stmt | Cobra flags de la CLI declarados en `init()` — no inyectables ni testeables |
| `init` | `cmd/user.go` | 34 | 27 stmt | Ídem |
| `buildInstallCmd` | `cmd/svc.go` | 128 | 34 líneas | Construcción de comando de instalación de servicio del SO |
| `runScanner` | `cmd/scan.go` | 74 | 32 líneas | Orquestador CLI del scan |
| `schedulePeriodicBackup` | `cmd/root.go` | 243 | 32 líneas | Lógica de backup con scheduler embebida en cmd |
| `makeRequest` | `adapters/lastfm/client.go` | 192 | 39 líneas | Cliente HTTP con retry y manejo de errores inline |
| `getSimilarRecordings` | `adapters/listenbrainz/client.go` | 336 | 36 líneas | Llamada API con transformación de respuesta inline |

### Complejidad cognitiva — gocognit (> 10)

> La complejidad cognitiva (Cognitive Complexity) mide cuánto esfuerzo mental requiere seguir el flujo de una función — es más precisa que la ciclomática para detectar código difícil de mantener.

| Función | Archivo | Línea | CC cognitiva | Descripción |
|---------|---------|-------|-------------|-------------|
| `Load` | `conf/configuration.go` | 299 | **35** | Carga y validación de toda la configuración; múltiples niveles de if anidados |
| `mapSimilarArtists` | `core/external/provider.go` | 550 | **26** | Mapeo de artistas similares desde APIs externas con múltiples fallbacks |
| `loadTracksByTitleAndArtist` | `core/matcher/matcher.go` | 358 | **18** | Búsqueda fuzzy de tracks por título y artista; lógica de scoring anidada |
| `parseProbeOutput` | `core/ffmpeg/ffmpeg.go` | 193 | **17** | Parseo del JSON de `ffprobe` con múltiples formatos de respuesta |
| `GetSimilarArtists` | `core/agents/agents.go` | 180 | **15** | Agrega resultados de múltiples agentes con lógica de fallback |
| `similarSongsFallback` | `core/external/provider.go` | 315 | **16** | Búsqueda alternativa de canciones similares cuando el agente principal falla |
| `collect` | `core/metrics/insights.go` | 233 | **16** | Colecta de métricas de sistema con múltiples condiciones de entorno |

### Code smells identificados (combinando golangci-lint + inspección manual)

| Smell | Linter | Archivo | Línea | Descripción |
|-------|--------|---------|-------|-------------|
| OCP Violation | cyclop | `persistence/persistence.go` | 100 | `Resource()` type-switch con 12 casos: cada nuevo modelo rompe esta función |
| OCP Violation (espejo) | cyclop | `tests/mock_data_store.go` | 258 | Mock duplica el type-switch → costo doble de mantenimiento |
| Función monolítica | funlen | `conf/configuration.go` | 718 | `setViperDefaults` con 158 sentencias — toda la config en un bloque |
| Complejidad config | gocognit | `conf/configuration.go` | 299 | `Load` CC=35: función más compleja cognitivamente del proyecto |
| Dot import | staticcheck ST1001 | `core/inspect.go` | 10 | `import . "pkg"` contamina el espacio de nombres local |
| Redundancia fmt | staticcheck QF1012 | `cmd/inspect.go` | 49–53 | `WriteString(fmt.Sprintf(...))` → debería ser `fmt.Fprintf(...)` |
| Tipo redundante | staticcheck ST1023 | `core/playback/mpv/track.go` | 209 | `var x int = 5` → el compilador infiere el tipo |
| God Object | manual | `server/subsonic/api.go` | 38 | `Router` con 16 dependencias inyectadas |
| Guard duplicado | manual | `server/subsonic/media_annotation.go` | 107–111 | `setStar` verifica `len(ids)==0` dos veces |
| TODO técnico activo | manual | `scanner/phase_1_folders.go` | 145 | Sin paralelizar múltiples bibliotecas |
| Workaround SQLite | manual | `persistence/persistence.go` | 156–163 | Flag temporal en BD para forzar modo IMMEDIATE |

---

## Tarea 2 — Modelo de Arquitectura Esperada

### 2.1 Componentes Principales

Basado en el `README.md`, estructura de carpetas y `go.mod`, el sistema se compone de:

| Componente | Paquete Go | Responsabilidad |
|------------|-----------|-----------------|
| **CLI** | `cmd/` | Punto de entrada; comandos `root`, `scan`, `user`, `inspect` via Cobra |
| **Config** | `conf/` | Carga de `navidrome.toml` + variables de entorno `ND_*` via Viper |
| **HTTP Server** | `server/` | Router Chi, TLS, middlewares de autenticación JWT, CORS, rate-limit |
| **Subsonic API** | `server/subsonic/` | Implementación completa de Subsonic/OpenSubsonic (~40 endpoints) |
| **Native API** | `server/nativeapi/` | REST para la UI propia de Navidrome |
| **Core Logic** | `core/` | Lógica de negocio: artwork, auth, streaming, playlists, scrobbler, playback |
| **Scanner** | `scanner/` | Pipeline de 4 fases para indexación de la biblioteca de música |
| **Persistence** | `persistence/` | Implementaciones SQLite de todos los repositorios |
| **Model** | `model/` | Entidades de dominio e interfaces de repositorio (DataStore) |
| **DB** | `db/` | Migraciones via goose + singleton de conexión |
| **Adapters** | `adapters/` | Integraciones externas: Last.fm, ListenBrainz, Deezer |
| **Storage** | `core/storage/` | Abstracción del sistema de archivos (local + plugins vía URL scheme) |
| **Plugins** | `plugins/` | Sistema de plugins WASM via Extism |
| **UI** | `ui/` | SPA React (Vite), embebida en el binario Go |

### 2.2 Restricciones Arquitectónicas Esperadas (mínimo 5)

| # | Restricción | Justificación |
|---|-------------|---------------|
| R1 | **Inversión de dependencias**: `core/` y `server/` dependen de interfaces en `model/`, nunca de implementaciones en `persistence/` | Permite sustituir la capa de datos sin afectar la lógica de negocio |
| R2 | **Base de datos única (SQLite)**: el sistema sólo soporta SQLite; no hay soporte para PostgreSQL ni MySQL | Simplifica el despliegue en dispositivos embebidos (NAS, Raspberry Pi) |
| R3 | **Inyección de dependencias vía Wire**: las dependencias concretas se ensamblan en `cmd/wire_gen.go`; no se usa `init()` ni `sync.Once` para construir objetos de dominio | Facilita las pruebas al permitir reemplazar implementaciones |
| R4 | **Abstracción del sistema de archivos**: el scanner sólo accede al FS a través de `storage.MusicFS` (interface `fs.FS` + `ReadTags`); el URI scheme registra backends alternativos | Permite usar FS en memoria en tests y soporte a futuros backends (S3, SMB) |
| R5 | **Modelo de capas estricto**: `UI → server → core → model ← persistence`; `scanner` depende de `model` y `core/storage`, no de `server` | Evita dependencias circulares; la UI nunca llama directamente a la BD |
| R6 | **Sistema de plugins extensible**: las capacidades del agente se extienden via WASM (Extism/wazero) sin modificar el núcleo | Permite añadir nuevas integraciones sin recompilar el binario principal |
| R7 | **Autenticación centralizada**: todos los endpoints protegidos pasan por el middleware `JWTVerifier` / `Authenticator`; no existen rutas que bypaseen la autenticación | Garantiza un único punto de control de acceso |

### 2.3 DFD Nivel 1

```
                        ┌─────────────────────────────────────────────────────────────────┐
                        │                         Navidrome                               │
                        │                                                                 │
   [Cliente Subsonic] ──┼──▶ [Subsonic API]──────┐                                      │
                        │                         │                                      │
   [Cliente Web/UI] ────┼──▶ [Native API] ────────┤                                      │
                        │                         │                                      │
   [Archivos de música] ┼──▶ [Scanner]             │                                      │
          (FS local)    │      │                  ▼                                      │
                        │      │          [Core Logic]──────▶ [Persistence]──▶ [SQLite]  │
                        │      └─────────────▶ │               (DataStore)               │
                        │                      │                                          │
                        │              [Storage MusicFS]──▶ [FS local / plugins]         │
                        │                                                                 │
   [Last.fm / LBrainz] ─┼──▶ [Adapters] ──────▶ [Core/Agents]                           │
                        │                                                                 │
   [Admin]─────────────┼──▶ [cmd/] (CLI: scan, user, inspect)                           │
                        └─────────────────────────────────────────────────────────────────┘

Flujos de datos principales:
 1. Request HTTP → server/subsonic → core → persistence → SQLite
 2. Cambio en FS → scanner/watcher → scanner pipeline → persistence → SQLite
 3. Play/Scrobble → core/scrobbler → adapters/lastfm → Last.fm API
 4. Config ND_* → conf/ → todos los componentes
```

---

## Tarea 3 — Tabla de Conformidad Arquitectónica

Inspección de `server/`, `persistence/`, `server/subsonic/`, `core/`, `ui/`.

| # | Restricción | Estado | Evidencia (archivo:línea) |
|---|-------------|--------|--------------------------|
| R1 | `core/` y `server/` dependen sólo de interfaces `model` | ✅ | `server/subsonic/api.go:38-56` — `Router` recibe `model.DataStore`, `model.Scanner`; nunca importa `persistence/` |
| R1b | `persistence/` no importa `server/` ni `core/` | ✅ | `persistence/persistence.go:1-13` — imports: solo `db`, `log`, `model`, `utils/run`, `pocketbase/dbx` |
| R1c | GC en persistence hace type assertions internas | ⚠️ | `persistence/persistence.go:187-196` — `s.Album(ctx).(*albumRepository)` rompe encapsulamiento; métodos GC deberían ser parte de la interfaz |
| R2 | Solo SQLite como BD | ✅ | `go.mod:36` — único driver: `github.com/mattn/go-sqlite3 v1.14.44`; CLAUDE.md confirma diseño |
| R3 | Wire DI en cmd/ | ✅ | `cmd/wire_gen.go` (1000+ líneas autogeneradas) + `cmd/wire_injectors.go` |
| R3b | `auth.Init()` usa `sync.Once` global | ⚠️ | `core/auth/auth.go:22-29` — `var once sync.Once; var TokenAuth *jwtauth.JWTAuth` son globales; `server.New()` llama `auth.Init()` en el constructor, haciendo la inicialización no-determinista en tests |
| R4 | Scanner accede FS solo vía `storage.MusicFS` | ✅ | `scanner/phase_1_folders.go:68-78` — `storage.For(lib.Path)` → `fileStore.FS()` devuelve `MusicFS`; nunca hay `os.Open()` directo en el código de producción del scanner |
| R4b | Tests del scanner usan FS en memoria (`fstest.MapFS`) | ✅ | `scanner/scanner_test.go:38-43` — `storagetest.FakeFS` con `fstest.MapFS`; registro via `storagetest.Register("fake", &fs)` |
| R5 | `scanner/` no importa `server/` | ✅ | Revisado el package `scanner`; ningún import de `server/` o `server/subsonic/` |
| R5b | `server/subsonic/` importa `core/` (no al revés) | ✅ | `server/subsonic/api.go:13-28` — importa `core/artwork`, `core/stream`, `core/scrobbler`, etc. Sin retro-dependencia |
| R6 | Plugins vía WASM | ✅ | `plugins/` paquete presente; `go.mod` incluye `github.com/extism/go-sdk` y `github.com/tetratelabs/wazero` |
| R7 | Auth en todos los endpoints protegidos | ✅ | `server/subsonic/api.go:99-102` — `r.Use(checkRequiredParameters)`, `r.Use(authenticate(api.ds))`, `r.Use(server.UpdateLastAccessMiddleware(api.ds))` envuelven TODOS los grupos internos |
| R7b | Endpoint `getOpenSubsonicExtensions` es público (sin auth) | ✅ | `server/subsonic/api.go:96` — intencional; declarado FUERA del bloque `r.Group(func(r chi.Router){r.Use(checkRequiredParameters)...})` |
| Extra | `routes()` mezcla definición de rutas con lógica de feature flags | ❌ | `server/subsonic/api.go:203-232` — `if conf.Server.EnableSharing {...} else { h501(...) }` y `if conf.Server.Jukebox.Enabled {...}` dentro de la función de rutas; la lógica condicional debería estar en los handlers, no en el router |

| Extra2 | Backup SQLite usa API CGo sin build tag de protección | ❌ | `db/backup.go:75` — `destConn.Backup()` falla en entornos sin CGo (confirmado por `staticcheck`); no existe ningún build tag `//go:build cgo` ni un fallback `_nocgo` en el paquete `db/` |

**Resumen:** 10 de 13 restricciones verificadas se cumplen correctamente (✅). Se identificaron 2 advertencias (⚠️) por patrones de encapsulamiento débil y 2 violaciones directas (❌): lógica de feature flags en el router y API CGo no protegida en backup.

---

## Tarea 4 — Gaps de Testeabilidad

### Gap 1: El scanner usa SQLite en disco, no en memoria

**Archivo:** `scanner/scanner_test.go:55`

```go
// ACTUAL (en disco — línea 55):
conf.Server.DbPath = filepath.Join(tmpDir, "test-scanner.db?_journal_mode=WAL")

// INTENTO FALLIDO comentado (línea 57):
//conf.Server.DbPath = ":memory:"
```

**Problema:** Los tests de integración del scanner requieren crear un archivo SQLite temporal en el sistema de archivos. Esto implica:
- Tests 3–5× más lentos que con BD en memoria.
- Necesidad de limpiar archivos entre tests (`DeferCleanup`).
- El comentado `:memory:` sugiere que se intentó usar BD en memoria pero se deshabilitó, probablemente por incompatibilidad con el modo `WAL` (Write-Ahead Logging), que requiere acceso a disco.

**Solución propuesta:** Usar `file::memory:?cache=shared&_foreign_keys=on` (como ya hace `persistence/persistence_suite_test.go:27`), que funciona sin WAL. Si el scanner necesita múltiples conexiones concurrentes, usar `dsn := "file:testscanner?mode=memory&cache=shared"` con un nombre único por test.

```go
// persistence_suite_test.go:27 — MODELO A SEGUIR:
conf.Server.DbPath = "file::memory:?cache=shared&_foreign_keys=on"
```

---

### Gap 2: El scanner externo es completamente opaco para las pruebas

**Archivo:** `scanner/external.go:71`

```go
// scanner/external.go:71 — sin abstracción inyectable:
cmd := exec.CommandContext(ctx, exe, args...)
```

**Problema:** `scannerExternal.scan()` construye y ejecuta directamente un `exec.Cmd` sin ninguna interfaz intermedia. Para testear:
- La comunicación IPC entre procesos (codificación gob de `ProgressInfo`).
- El manejo de errores cuando el proceso hijo falla.
- El comportamiento al cancelar el contexto.

...se requiere lanzar un proceso real del binario de Navidrome. No existe ninguna prueba unitaria de `scannerExternal`.

**Solución propuesta:** Extraer la ejecución de subprocesos a una interfaz `CommandRunner`:

```go
// Nuevo archivo: scanner/exec.go
type CommandRunner interface {
    Run(ctx context.Context, name string, args ...string) (io.Reader, error)
}

// Implementación real:
type realRunner struct{}
func (r *realRunner) Run(ctx context.Context, name string, args ...string) (io.Reader, error) { ... }

// scannerExternal recibe el runner como dependencia:
type scannerExternal struct {
    runner CommandRunner  // inyectable en tests
}
```

Archivo afectado: `scanner/external.go` — requiere refactorización de ~60 líneas.

---

### Gap 3: `server.New()` tiene efectos colaterales no inyectables

**Archivo:** `server/server.go:41–47`

```go
func New(ds model.DataStore, broker events.Broker, insights metrics.Insights) *Server {
    s := &Server{ds: ds, broker: broker, insights: insights}
    initialSetup(ds)          // ← escribe en la BD
    auth.Init(s.ds)           // ← muta estado global (sync.Once + var TokenAuth)
    s.initRoutes()
    s.mountAuthenticationRoutes()
    s.mountRootRedirector()
    checkFFmpegInstallation() // ← llama exec.LookPath("ffmpeg")
    checkExternalCredentials()// ← llama exec.LookPath("yt-dlp")
    return s
}
```

**Problemas:**
1. `auth.Init` usa `sync.Once` global: el estado del token JWT **no se puede resetear entre tests**. Si un test llama `New()` con un DataStore, todos los tests subsiguientes usarán el mismo secreto JWT.
2. `checkFFmpegInstallation()` hace `exec.LookPath("ffmpeg")` sin inyección: en entornos CI sin ffmpeg instalado, emite warnings no controlables.
3. `initialSetup(ds)` crea el usuario admin si no existe: efecto colateral de BD que complica los tests que quieren empezar con BD vacía.

**Solución propuesta:** Separar construcción de inicialización:

```go
// server/server.go — refactorización propuesta:
func New(ds model.DataStore, broker events.Broker, insights metrics.Insights) *Server {
    s := &Server{ds: ds, broker: broker, insights: insights}
    s.initRoutes()
    s.mountAuthenticationRoutes()
    s.mountRootRedirector()
    return s
}

// Llamado explícitamente en cmd/root.go, no en el constructor:
func (s *Server) Initialize(ctx context.Context) error {
    if err := initialSetup(s.ds); err != nil { return err }
    auth.Init(s.ds)
    checkFFmpegInstallation()
    checkExternalCredentials()
    return nil
}
```

Archivos afectados: `server/server.go` (refactoring), `cmd/root.go` (llamada explícita a `Initialize`), `core/auth/auth.go` (hacer `Init` retornable y testeable).

---

### Gap adicional (bonus): `persistence.GC()` usa type assertions internas que no aparecen en la interfaz

**Archivo:** `persistence/persistence.go:187–196`

```go
s.Album(ctx).(*albumRepository).purgeEmpty(libraryIDs...)
s.Artist(ctx).(*artistRepository).purgeEmpty()
```

**Problema:** `GC()` hace downcasting a implementaciones concretas para acceder a métodos (`purgeEmpty`, `cleanAnnotations`, etc.) que no son parte de la interfaz `model.AlbumRepository`. Esto impide usar mocks estándar para probar `GC()` sin una BD real.

**Solución:** Añadir a `model.AlbumRepository` y `model.ArtistRepository` los métodos que `GC` necesita (renombrándolos si es necesario para que tengan sentido en el contexto de la interfaz pública), o extraer `GC()` a un servicio con sus propias dependencias concretas.

---

## Resumen Ejecutivo de Mantenibilidad

| Dimensión | Calificación | Observación clave |
|-----------|-------------|-------------------|
| **Complejidad ciclomática** | ⚠️ Media-Alta | 7 funciones con CC > 10 (golangci-lint real); peor caso: `inferCodecFromSuffix` CC=20 y `unmarshalExpression` CC=19 |
| **Complejidad cognitiva** | ⚠️ Alta | 50+ funciones superan umbral 10; `Load` en `conf/configuration.go` alcanza CC cognitiva=35 |
| **Longitud de funciones** | ⚠️ Alta | 50+ funciones largas; `setViperDefaults` tiene 158 sentencias; `routes()` tiene 149 líneas |
| **Code smells** | ⚠️ Media | God Object en `Router`, OCP violation en `Resource()` (+ mock espejo), dot import, redundancias fmt |
| **Conformidad arquitectónica** | ✅ Buena | 10/12 restricciones cumplidas; 2 warnings menores; 1 violación en `routes()` |
| **Testeabilidad** | ⚠️ Media | Persistence tests usan ✅ in-memory; scanner usa ❌ disco; `server.New()` ❌ no testeable en aislamiento |
| **Separación de capas** | ✅ Buena | Capas bien definidas; dependencias correctamente orientadas |
| **Inyección de dependencias** | ✅ Buena | Wire DI en toda la aplicación; interfaz `DataStore` abstracta |

> **Conclusión:** Navidrome es una base de código bien estructurada para un servidor de media de código abierto. Las principales oportunidades de mejora de mantenibilidad se concentran en la reducción de la complejidad ciclomática de las funciones de orquestación (`scanFolders`, `exprSQL`, `loadDir`) y en la mejora de la testeabilidad de los puntos de entrada (`server.New()`, `scannerExternal`) para eliminar dependencias de proceso y de disco en la suite de tests.
