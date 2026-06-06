# Lab 4 — Reporte de Mantenibilidad de Navidrome

**Curso:** Software Quality 2026-I  
**Sistema bajo analisis:** Navidrome  
**Fork:** `https://github.com/juclopezso/navidrome.git`  
**Rama de trabajo:** `feature/lab4-mantenibilidad`  
**Base:** `origin/master` (`c3f314e4`)  
**Alcance:** Parte 1 del Extended Laboratory 4: mantenibilidad en tiempo de diseno. No incluye SAST/DAST de seguridad.

---

## 1. Objetivo

El objetivo de esta rama es dejar la parte de mantenibilidad del Lab 4 lista para entrega: reporte, comandos reproducibles, modelo de arquitectura esperado, tabla de conformidad, gaps de testabilidad y una mejora concreta de mantenibilidad en la suite E2E.

Esta rama no mezcla funcionalidades nuevas como avatar, tema Light Blue o OpenSpec. Es intencional: el laboratorio pide evidencias separadas por atributo de calidad.

---

## 2. Evidencia de Analisis Estatico

La evidencia base proviene de la rama `origin/feature/lab3-equipo1`, donde se ejecuto `golangci-lint` con linters orientados a mantenibilidad.

### 2.1 Configuracion reproducible

El archivo `reports/.golangci-analysis.yml` deja la configuracion usada para regenerar el analisis:

```yaml
version: "2"

run:
  build-tags:
    - netgo
    - sqlite_fts5

linters:
  enable:
    - cyclop
    - funlen
    - gocognit
```

Comando recomendado:

```bash
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  golangci/golangci-lint:latest \
  golangci-lint run \
    --output.json.path /app/reports/golangci_navidrome.json \
    --config /app/reports/.golangci-analysis.yml \
    --timeout 15m ./...
```

### 2.2 Resultado consolidado

| Linter / metrica | Resultado reportado | Interpretacion |
|---|---:|---|
| Issues totales | 207 | La base es mantenible, pero tiene puntos de complejidad claros |
| `cyclop` | 7 | Funciones con complejidad ciclomática mayor a 10 |
| `funlen` | 50 | Funciones largas o con demasiadas sentencias |
| `gocognit` | 50 | Funciones mentalmente costosas de seguir |
| `staticcheck` | 48 | Smells y simplificaciones de codigo |
| `errcheck` | 50 | Riesgos de errores ignorados |
| `govet` | 2 | Hallazgos de analisis Go estándar |

### 2.3 Hallazgos principales

| Hallazgo | Archivo | Impacto de mantenibilidad |
|---|---|---|
| `inferCodecFromSuffix` tiene CC 20 | `model/mediafile.go` | Agregar formatos nuevos aumenta riesgo de regresion |
| `unmarshalExpression` tiene CC 19 | `model/criteria/json.go` | Smart playlists concentran demasiadas ramas de parsing |
| `Resource()` usa `type switch` central | `persistence/persistence.go` | Viola Open/Closed Principle; cada entidad nueva toca el switch |
| Mock replica el `type switch` | `tests/mock_data_store.go` | Duplicacion de cambio entre produccion y pruebas |
| `setViperDefaults` concentra configuracion | `conf/configuration.go` | Dificulta revisar defaults por dominio |
| `server.New()` tiene efectos colaterales | `server/server.go` | Dificulta pruebas aisladas y setup determinista |
| Rutas Subsonic mezclan feature flags | `server/subsonic/api.go` | La declaracion de rutas mezcla configuracion y comportamiento |

---

## 3. Modelo de Arquitectura Esperada

Navidrome se entiende como un sistema de capas con dependencias orientadas hacia el dominio:

```text
Cliente Web / Cliente Subsonic
        |
        v
server/ + server/nativeapi/ + server/subsonic/
        |
        v
core/ servicios de dominio
        |
        v
model/ entidades e interfaces
        ^
        |
persistence/ repositorios SQLite ---- db/ migraciones

scanner/ -> core/storage/ -> filesystem local o backends
plugins/ -> capacidades externas via WASM
ui/ -> SPA React embebida, sin acceso directo a SQLite
```

### Componentes

| Componente | Responsabilidad |
|---|---|
| `cmd/` | CLI, comandos de administracion y wiring de dependencias |
| `conf/` | Carga de configuracion desde archivos y variables `ND_*` |
| `server/` | Servidor HTTP, autenticacion, middlewares y montaje de APIs |
| `server/subsonic/` | Compatibilidad Subsonic/OpenSubsonic |
| `server/nativeapi/` | API REST usada por la UI propia |
| `core/` | Lógica de negocio: streaming, artwork, playlists, auth, scrobbling |
| `model/` | Entidades e interfaces de repositorio |
| `persistence/` | Implementaciones SQLite de repositorios |
| `scanner/` | Indexacion de bibliotecas musicales |
| `plugins/` | Extensiones WASM aisladas |
| `ui/` | Frontend React/Vite |

---

## 4. Conformidad Arquitectonica

| Restriccion esperada | Estado | Evidencia |
|---|---|---|
| UI no accede directamente a SQLite | Cumple | `ui/` consume APIs; la persistencia vive en `persistence/` |
| `server/` y `core/` dependen de `model`, no de repositorios concretos | Cumple | `server/subsonic/api.go` trabaja con `model.DataStore` |
| `persistence/` no importa `server/` | Cumple | La direccion de dependencia no se invierte |
| Scanner usa abstraccion de storage | Cumple | `scanner/phase_1_folders.go` obtiene `storage.For(lib.Path)` |
| Plugins se extienden sin modificar el nucleo | Cumple | `plugins/` usa Extism/Wazero |
| Autenticacion centralizada para rutas protegidas | Cumple | Rutas internas usan middlewares de autenticacion |
| `server.New()` deberia ser constructor puro | Advertencia | Ejecuta setup inicial, auth global y checks externos |
| `persistence.GC()` deberia depender de interfaces | Advertencia | Usa type assertions hacia repositorios concretos |
| Declaracion de rutas no deberia mezclar feature flags | No cumple | `server/subsonic/api.go` decide handlers 501 segun configuracion |

---

## 5. Gaps de Testabilidad

| Gap | Problema | Mejora propuesta |
|---|---|---|
| Constructor de servidor con side effects | `server.New()` inicializa auth, usuario admin y checks de binarios | Separar `New()` de `Initialize(ctx)` |
| Scanner externo no inyectable | Usa `exec.CommandContext` directamente | Introducir `CommandRunner` mockeable |
| Tests de scanner dependen de SQLite en disco | Requieren archivos temporales y cleanup | Usar DSN `file::memory:?cache=shared&_foreign_keys=on` cuando aplique |
| E2E de favoritos tenian helpers duplicados | `login`, auth Subsonic, `getSongId`, `star/unstar` se repetian en specs | Extraido `tests/e2e/helpers.ts` en esta rama |
| Selectores E2E fragiles | Algunos pasos dependen de clases Material UI generadas | Agregar `data-testid` estables en componentes criticos |

---

## 6. Mejora Aplicada en Esta Rama

Para que la rama no sea solo documental, se aplico una mejora concreta de mantenibilidad sobre la suite E2E de Lab 4:

| Cambio | Archivos | Beneficio |
|---|---|---|
| Extraccion de helpers comunes | `tests/e2e/helpers.ts` | Reduce duplicacion entre FR-07/08, FR-09 y FR-10 |
| Reuso de login y auth Subsonic | `tests/e2e/07-08.spec.ts`, `09.spec.ts`, `10.spec.ts` | Un cambio de credenciales/base URL se hace en un solo sitio |
| Reuso de asercion `expectSongStarred` | Misma suite | Homogeneiza expected output de API `getStarred2` |
| Limpieza de ruido | `07-08.spec.ts` | Se elimina `console.log` y se corrige indentacion |

Esta mejora ataca directamente un smell de testabilidad: duplicacion en pruebas de sistema. No cambia los requisitos funcionales cubiertos; solo mejora la capacidad de mantener y extender la suite.

---

## 7. Oportunidades de Mejora Priorizadas

| Prioridad | Oportunidad | Razon |
|---|---|---|
| Alta | Consolidar todas las suites E2E en `tests/e2e` | Hoy hay ramas con `ui/e2e`, `ui/tests/playwright` y `playlist-tests` |
| Alta | Agregar `data-testid` estables para filtros, filas y LoveButton | Reduce fragilidad por cambios de Material UI |
| Alta | Separar `server.New()` de inicializacion runtime | Habilita tests unitarios del servidor sin BD ni binarios externos |
| Media | Refactorizar `persistence.Resource()` hacia registro/factory | Reduce violacion OCP |
| Media | Modularizar defaults de configuracion por dominio | Baja longitud y complejidad de `setViperDefaults` |
| Media | Inyectar `CommandRunner` en scanner externo | Permite probar errores/cancelacion sin proceso real |
| Baja | Revisar `funlen` en clientes externos | Mejora legibilidad, pero menor impacto que server/scanner/persistence |

---

## 8. Comandos de Verificacion

Reporte y analisis:

```bash
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  golangci/golangci-lint:latest \
  golangci-lint run \
    --output.json.path /app/reports/golangci_navidrome.json \
    --config /app/reports/.golangci-analysis.yml \
    --timeout 15m ./...
```

Suite E2E refactorizada:

```bash
cd tests/e2e
npm install
npx playwright test
```

Validacion rapida de TypeScript/Playwright sin levantar Navidrome:

```bash
cd tests/e2e
npx playwright test --list
```

Resultado verificado en esta rama:

```text
Total: 9 tests in 3 files
```

---

## 9. Conclusiones

Navidrome presenta una arquitectura general saludable: separa servidor, dominio, modelo, persistencia, scanner, plugins y UI. El riesgo principal de mantenibilidad no esta en una ruptura de capas, sino en zonas concretas de complejidad: configuracion monolitica, constructors con efectos colaterales, factories centralizadas con `type switch`, scanner externo no inyectable y duplicacion en pruebas.

La rama `feature/lab4-mantenibilidad` deja la evidencia en forma para el Lab 4 porque:

1. Documenta resultados de analisis estatico con configuracion reproducible.
2. Define modelo esperado y restricciones arquitectonicas.
3. Evalua conformidad con evidencia.
4. Enumera gaps de testabilidad y mejoras concretas.
5. Aplica una mejora real al mantenimiento de la suite E2E mediante helpers compartidos.
