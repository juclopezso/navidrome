# Mantenibilidad — Navidrome

**Curso:** Software Quality 2026-I
**Sistema seleccionado:** Navidrome
**Fork analizado:** `https://github.com/juclopezso/navidrome.git`
**Rama de trabajo:** `feature/lab4-mantenibilidad`
**Base de analisis:** `origin/master` (`c3f314e4`)
**Alcance:** Parte de mantenibilidad del Extended Laboratory 4. No incluye analisis de seguridad, SAST/DAST, Trivy ni ZAP.

---

## 1. Proposito del analisis

Este reporte consolida la evidencia de mantenibilidad de Navidrome para el Lab 4. Incluye el analisis estatico con `golangci-lint`, el modelo esperado de arquitectura, la tabla de conformidad, las brechas de testabilidad y la mejora aplicada a la suite E2E de favoritos para reducir duplicacion.

Navidrome es una base de codigo grande, activa y modular. La evaluacion no muestra una ruptura general de arquitectura; los riesgos principales se concentran en funciones complejas, inicializacion con efectos colaterales, factories centralizadas, partes del scanner dificiles de aislar y duplicacion en pruebas de sistema.

---

## 2. Analisis estatico de calidad

Para el analisis de mantenibilidad se utilizo **golangci-lint**, ya que Navidrome esta desarrollado principalmente en Go. La configuracion reproducible esta en:

```text
reports/.golangci-analysis.yml
```

La configuracion activa linters orientados a mantenibilidad:

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
  settings:
    cyclop:
      max-complexity: 10
    funlen:
      lines: 30
      statements: 25
    gocognit:
      min-complexity: 10
```

Comando recomendado para regenerar la evidencia:

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

La evidencia base reportada por la rama de mantenibilidad previa (`origin/feature/lab3-equipo1`) detecto **207 issues**:

| Linter / metrica | Resultado | Interpretacion |
|---|---:|---|
| Issues totales | 207 | Hay puntos claros de deuda mantenible, aunque la arquitectura global es razonable |
| `cyclop` | 7 | Funciones con complejidad ciclomática mayor al umbral |
| `funlen` | 50 | Funciones largas o con demasiadas sentencias |
| `gocognit` | 50 | Funciones con alta carga mental para entender el flujo |
| `staticcheck` | 48 | Smells, simplificaciones y problemas idiomaticos |
| `errcheck` | 50 | Riesgos por errores no revisados |
| `govet` | 2 | Hallazgos del analizador estándar de Go |

### Hallazgos principales

| Hallazgo | Archivo | Impacto de mantenibilidad |
|---|---|---|
| `inferCodecFromSuffix` tiene complejidad ciclomática alta | `model/mediafile.go` | Agregar formatos de audio nuevos aumenta el riesgo de regresion |
| `unmarshalExpression` concentra demasiadas ramas de parsing | `model/criteria/json.go` | Smart playlists son mas dificiles de extender y diagnosticar |
| `Resource()` usa `type switch` centralizado | `persistence/persistence.go` | Viola Open/Closed Principle: cada entidad nueva obliga a tocar el switch |
| El mock replica el `type switch` de produccion | `tests/mock_data_store.go` | Duplica el costo de mantenimiento entre produccion y pruebas |
| `setViperDefaults` concentra demasiada configuracion | `conf/configuration.go` | Dificulta revisar defaults por dominio funcional |
| `server.New()` tiene efectos colaterales | `server/server.go` | Complica pruebas aisladas por inicializacion global y checks externos |
| Rutas Subsonic mezclan declaracion con feature flags | `server/subsonic/api.go` | El router hace demasiadas decisiones de comportamiento |

Estos hallazgos indican que Navidrome no requiere una reescritura arquitectonica, sino refactorizaciones focalizadas sobre puntos de alta complejidad y baja testabilidad.

---

## 3. Modelo de arquitectura esperada

Antes de evaluar la implementacion, se define el siguiente modelo esperado de arquitectura:

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

Responsabilidades esperadas:

| Componente | Responsabilidad |
|---|---|
| `ui/` | Permitir interaccion del usuario y consumir APIs del backend |
| `server/` | Exponer HTTP, montar rutas, autenticar y aplicar middlewares |
| `server/subsonic/` | Implementar compatibilidad Subsonic/OpenSubsonic |
| `server/nativeapi/` | Proveer API REST para la UI propia |
| `core/` | Contener servicios de dominio y orquestacion de negocio |
| `model/` | Definir entidades e interfaces entre capas |
| `persistence/` | Encapsular acceso a SQLite mediante repositorios |
| `db/` | Administrar migraciones y conexion |
| `scanner/` | Indexar biblioteca musical y coordinar lectura de metadatos |
| `core/storage/` | Abstraer acceso al filesystem o backends equivalentes |
| `plugins/` | Extender capacidades sin modificar el nucleo |
| `conf/` | Proveer configuracion sin dependencias globales ocultas |

---

## 4. Conformidad arquitectonica

| Restriccion esperada | Estado | Evidencia / lectura |
|---|---|---|
| La UI debe consumir APIs y no acceder a SQLite directamente | Cumple | `ui/` interactua con backend; persistencia esta en `persistence/` |
| `server/` y `core/` deben depender de interfaces del dominio | Cumple | `server/subsonic/api.go` trabaja con `model.DataStore` |
| `persistence/` no debe importar `server/` | Cumple | La direccion de dependencia se mantiene hacia `model` |
| El scanner debe acceder a archivos mediante abstracciones | Cumple | El flujo usa `core/storage` para desacoplar filesystem |
| Las rutas protegidas deben pasar por autenticacion centralizada | Cumple | Las APIs internas usan middlewares de autenticacion |
| Los plugins deben extender sin modificar el nucleo | Cumple | `plugins/` usa un modelo WASM/Extism separado |
| La inicializacion del servidor debe ser modular y testeable | Parcial | `server.New()` concentra inicializacion, auth global y checks externos |
| Las operaciones de persistencia deben probarse por interfaces | Parcial | `persistence.GC()` usa type assertions hacia repositorios concretos |
| La logica del scanner debe evitar acoplamiento con procesos reales | Parcial | El scanner externo usa ejecucion de procesos dificil de mockear |
| Las estructuras de decision grandes deben dividirse | No cumple | `Resource()` y otros `type switch` concentran extension points |
| La declaracion de rutas debe evitar mezclar feature flags | No cumple | `server/subsonic/api.go` decide handlers 501 segun configuracion |

La conformidad general es buena: las capas principales existen y las dependencias estan mayormente orientadas hacia el dominio. Las desviaciones son localizadas y atacables con refactorizaciones pequeñas o medianas.

---

## 5. Evaluacion de testabilidad

| Brecha | Problema | Propuesta de mejora |
|---|---|---|
| `server.New()` concentra demasiada inicializacion | Crea usuario inicial, inicializa auth global y hace checks de binarios externos | Separar constructor puro `New()` de un `Initialize(ctx)` explicito |
| Scanner externo no es facil de aislar | Usa `exec.CommandContext` directamente | Introducir una interfaz `CommandRunner` mockeable |
| Tests del scanner dependen de SQLite en disco | Requieren archivos temporales y limpieza extra | Evaluar DSN `file::memory:?cache=shared&_foreign_keys=on` donde aplique |
| `persistence.GC()` depende de implementaciones concretas | Usa type assertions internas | Extraer un servicio de GC o ampliar interfaces con operaciones necesarias |
| E2E de favoritos tenian helpers duplicados | Login, auth Subsonic, busqueda y star/unstar se repetian | Extraer helpers compartidos en `tests/e2e/helpers.ts` |
| Algunos selectores E2E son fragiles | Dependencia en clases Material UI o estructura DOM | Agregar `data-testid` estables en filtros, filas y LoveButton |

---

## 6. Mejora aplicada a la suite E2E

Como parte del trabajo de mantenibilidad se aplico una mejora concreta sobre las pruebas de sistema de favoritos. No cambia la funcionalidad probada ni los requisitos FR-07, FR-08, FR-09 y FR-10; reduce duplicacion y mejora el costo de mantenimiento.

| Cambio | Archivos | Beneficio |
|---|---|---|
| Extraccion de helpers comunes | `tests/e2e/helpers.ts` | Centraliza `BASE_URL`, credenciales, auth Subsonic y operaciones de star/unstar |
| Reuso de login | `07-08.spec.ts`, `09.spec.ts`, `10.spec.ts` | Un cambio en el flujo de login se actualiza en un solo punto |
| Reuso de `getSongId`, `starSong`, `unstarSong` | `09.spec.ts`, `10.spec.ts`, `helpers.ts` | Evita duplicar llamadas Subsonic en cada spec |
| Reuso de `expectSongStarred` | Todos los specs de favoritos | Homogeneiza la verificacion contra `getStarred2` |
| Limpieza de ruido | `07-08.spec.ts` | Se elimina `console.log` y se corrige indentacion |

Validacion rapida realizada:

```bash
cd tests/e2e
npx playwright test --list
```

Resultado:

```text
Total: 9 tests in 3 files
```

Esta verificacion confirma que Playwright descubre correctamente los specs despues del refactor. La ejecucion completa requiere Navidrome corriendo con los datos de prueba indicados en el README.

---

## 7. Oportunidades de mejora priorizadas

| Prioridad | Oportunidad | Razon |
|---|---|---|
| Alta | Consolidar suites E2E en una sola ubicacion (`tests/e2e`) | Hay ramas historicas con pruebas en `ui/e2e`, `ui/tests/playwright` y `playlist-tests` |
| Alta | Agregar `data-testid` estables | Reduce fragilidad frente a cambios visuales o de Material UI |
| Alta | Separar `server.New()` de inicializacion runtime | Habilita pruebas unitarias del servidor sin BD ni dependencias externas |
| Media | Refactorizar `persistence.Resource()` hacia registro/factory | Reduce violacion OCP y sincronizacion manual con mocks |
| Media | Modularizar defaults de configuracion | Reduce longitud y complejidad de `setViperDefaults` |
| Media | Inyectar `CommandRunner` en scanner externo | Permite probar errores, cancelacion y salida sin proceso real |
| Baja | Revisar funciones largas en clientes externos | Mejora legibilidad, aunque tiene menor impacto que server/scanner/persistence |

---

## 8. Comandos de verificacion

Analisis estatico:

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

Suite E2E de favoritos:

```bash
cd tests/e2e
npm install
npx playwright test
```

Validacion sin levantar el servidor:

```bash
cd tests/e2e
npx playwright test --list
```

---

## 9. Conclusiones

Navidrome tiene una base arquitectonica saludable para un sistema open-source grande: separa UI, servidor HTTP, dominio, modelo, persistencia, scanner, storage y plugins. La deuda de mantenibilidad no se concentra en una falla estructural global, sino en puntos especificos que elevan el costo de cambio.

Los principales riesgos son la complejidad de funciones puntuales, la inicializacion con efectos colaterales, los `type switch` centralizados, el scanner externo poco inyectable y la duplicacion historica de pruebas E2E. La mejora aplicada a los tests de favoritos demuestra una ruta concreta: centralizar helpers y reducir duplicacion sin alterar el comportamiento cubierto.

La recomendacion para continuar es atacar primero las mejoras de alto impacto y bajo riesgo: estabilizar selectores E2E, consolidar suites de pruebas, separar inicializacion del servidor y hacer mas inyectable el scanner externo. Con eso, el sistema gana facilidad de cambio, diagnostico y extension sin comprometer su arquitectura actual.
