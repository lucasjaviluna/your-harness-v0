# Changelog

Todos los cambios relevantes de `pi-harness` se documentan en este archivo.

## [Unreleased]

### Añadido

- Plan aprobado para la integración nativa de Pi con `your-team-knowledge` mediante SQLite; todavía no activa ningún backend.
- Primer slice de integración: configuración de memoria, loader opcional del provider y tools nativas de búsqueda/escritura con aprobación.
- Rutas `simple`, `task`, `sdd` y `clarify` con clasificación visible y decisión humana.
- Planes versionados, gates HIL y persistencia de tareas ligeras en `.harness/tasks`.
- Escritura atómica, migración de esquema y reconciliación explícita entre sesión y artefacto.
- Recuperación segura ante reinicio, artefacto corrupto, cancelación y cambio de alcance.
- Integraciones opcionales con OpenSpec, MCP y proveedores de memoria mediante contratos aislados.
- Validación desde consumidores instalados y empaquetado reproducible mediante `npm pack`.

### Compatibilidad

- Node.js `>=22.19.0`.
- `@earendil-works/pi-coding-agent` `^0.85.1`, fijado por `package-lock.json` durante la instalación reproducible.
- OpenSpec y MCP son opcionales.

### Validación

- `npm test`: 96 aprobadas, 0 fallos y 2 omitidas en Ubuntu.
- `npm run test:e2e:required`: 2 aprobadas, 0 fallos y 1 omitida por ser específica de Git Bash/Windows.
- `npm run pack:check`: correcto.
- El smoke de consumidor usa `npm --prefix` para instalar el tarball de forma reproducible en npm/Windows; el caso Git Bash se omite cuando el entorno no puede iniciar `/bin/bash`.

La versión candidata recomendada es `0.1.0`. La publicación npm requiere autorización explícita; las instrucciones de instalación, actualización y rollback están en `docs/RELEASE_CANDIDATE.md`.
