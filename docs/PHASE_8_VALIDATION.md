# Fase 8 — Validación y distribución

La Fase 8 valida el package como artefacto instalable, sin publicar automáticamente en npm.

## Comandos

```text
npm test
npm run test:e2e
npm run test:e2e:required
npm run pack:check
```

`npm test` ejecuta pruebas unitarias y de integración. `npm run test:e2e` crea un tarball, lo instala en dos consumidores temporales y comprueba el manifest, las rutas runtime y la carga de Pi cuando el entorno lo permite. `npm run pack:check` muestra el contenido que se distribuiría.

`npm run test:e2e:required` es la variante para CI o una validación de release: exige que la instalación y el smoke del consumidor terminen correctamente; un timeout ya no se convierte en `skip`. Puede configurarse con estas variables de entorno:

- `PI_HARNESS_E2E_NPM_CACHE`: cache npm previamente restaurado por CI o preparado por el entorno. Si no se define, la prueba usa un cache temporal aislado.
- `PI_HARNESS_E2E_INSTALL_TIMEOUT_MS`: timeout de instalación en milisegundos. El modo normal usa 30 segundos; el modo requerido, 120 segundos.

El workflow `.github/workflows/validate.yml` restaura el cache npm de GitHub Actions y ejecuta esta variante estricta. Así, una regresión en el paquete distribuido no queda oculta por un `skip` de la validación local.

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

La prueba de Git Bash instala el tarball en un consumidor temporal y ejecuta el wrapper distribuido `node_modules/.bin/yh-pi --version`. No requiere que un comando `pi` global sea visible desde Git Bash: el CLI debe resolver su dependencia local de Pi. La prueba sigue siendo condicional cuando Git Bash o npm no están disponibles, y respeta el mismo modo normal/estricto de la instalación E2E.

## Publicación

La publicación npm no forma parte de la ejecución automática de la fase. Antes de publicar hay que decidir nombre definitivo, ámbito, versión, compatibilidad mínima de Pi y notas de cambio. El artefacto se puede inspeccionar con `npm pack --dry-run`.
