# Fase 8 — Validación y distribución

La Fase 8 valida el package como artefacto instalable, sin publicar automáticamente en npm.

## Comandos

```text
npm test
npm run test:e2e
npm run pack:check
```

`npm test` ejecuta pruebas unitarias y de integración. `npm run test:e2e` crea un tarball, lo instala en dos consumidores temporales y comprueba el manifest, las rutas runtime y la carga de Pi cuando el entorno lo permite. `npm run pack:check` muestra el contenido que se distribuiría.

Los comandos de empaquetado usan un cache npm temporal para no depender de permisos sobre el cache global del usuario.

## Contenido distribuido

El campo `files` de `package.json` incluye únicamente:

- `extensions/`
- `src/`
- `skills/`
- `docs/`
- `README.md`
- `package.json`

No se distribuyen `tests/`, `node_modules/` ni archivos temporales.

## Git Bash y Windows

La prueba de Git Bash es condicional porque Pi puede estar instalado en un PATH visible para PowerShell pero no para Git Bash. Cuando el comando está disponible se ejecuta:

```bash
MSYS_NO_PATHCONV=1 pi --version
```

En ese caso, para probar la extensión desde Git Bash:

```bash
MSYS_NO_PATHCONV=1 pi -e /c/ruta/pi-harness/extensions/harness.ts --approve
```

## Publicación

La publicación npm no forma parte de la ejecución automática de la fase. Antes de publicar hay que decidir nombre definitivo, ámbito, versión, compatibilidad mínima de Pi y notas de cambio. El artefacto se puede inspeccionar con `npm pack --dry-run`.
