# Lab 3 – System Testing: Playlist Flow (FR-01, FR-02, FR-03)

## Contexto del laboratorio

Este proyecto implementa tests de verificación funcional a nivel de sistema para el laboratorio de Calidad de Software (2026-I). El objetivo es verificar que el sistema bajo prueba cumple con requisitos funcionales formales — **no** evaluar experiencia de usuario.

## Sistema bajo prueba (SUT)

- **Sistema:** Navidrome (servidor de música open-source)
- **URL local:** `http://localhost:4533`
- **Credenciales de prueba:** definidas en el archivo `.env` del proyecto
  - Variable `TEST_USER` → email/usuario de prueba
  - Variable `TEST_PASSWORD` → contraseña de prueba

## Stack tecnológico

- **Lenguaje:** TypeScript
- **Framework de testing:** Playwright
- **Navegador:** Chromium (headless para CI, headed para desarrollo)

## Flujo bajo prueba: Playlists

### FR-01 – Visualización de playlists propias

> **Dado que** el usuario está autenticado,
> **Cuando** navega a la sección de playlists,
> **Entonces** el sistema deberá mostrar únicamente las playlists pertenecientes al usuario autenticado, y ninguna playlist de otros usuarios deberá ser visible.

**Criterio de verificación:** El listado de playlists visible contiene solo playlists del usuario autenticado. Se puede verificar comparando con un segundo usuario que tenga playlists propias.

---

### FR-02 – Creación de playlist

> **Dado que** el usuario está autenticado y se encuentra en la sección de playlists,
> **Cuando** el usuario envía una nueva playlist con un nombre válido,
> **Entonces** el sistema deberá crear la playlist y asociarla al usuario autenticado, y esta deberá aparecer en su listado de playlists.

**Criterio de verificación:** Después de crear la playlist, el nombre aparece en el listado de playlists del usuario.

---

### FR-03 – Creación de playlists con nombre duplicado

> **Dado que** el usuario está autenticado y ya tiene una playlist con un nombre determinado,
> **Cuando** el usuario crea una nueva playlist con el mismo nombre,
> **Entonces** el sistema deberá permitir la creación y ambas playlists deberán coexistir de forma independiente en el listado del usuario.

**Criterio de verificación:** El listado contiene dos entradas con el mismo nombre, y son independientes (tienen IDs distintos o se pueden distinguir por posición).

---

## Estructura esperada del proyecto

```
/playlist-tests
├── CONTEXT.md
├── .env                        # credenciales (no subir a git)
├── package.json
├── playwright.config.ts
└── tests/
    └── playlists.spec.ts       # tests de FR-01, FR-02, FR-03
```

## Convenciones

- Cada test debe tener un comentario indicando el FR que verifica (ej: `// FR-02`)
- Los tests deben ser independientes entre sí (setup y teardown propios)
- Usar `expect` de Playwright para todas las aserciones
- Los selectores deben basarse en atributos estables (roles, labels, data-testid) — evitar selectores por clase CSS o posición

## Notas de análisis de resultados

Para cada falla detectada, clasificar como:
- **Defecto de implementación:** el sistema no cumple el requisito
- **Defecto de requisito:** el requisito estaba mal definido
- **Defecto del test:** el test estaba mal escrito o tiene supuestos incorrectos