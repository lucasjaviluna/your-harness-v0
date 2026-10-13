# Release candidate

Estado: gates técnicos históricos en verde al 2026-10-11 en el baseline `5feafb2`; validación local actualizada el 2026-10-13 sobre `5c7f4c6`. El package todavía no se publica ni se cambia su versión.

## Compatibilidad declarada

| Componente | Mínimo declarado | Validado en esta etapa |
| --- | --- | --- |
| Node.js | `>=22.19.0` | Ubuntu CI con `22.19.0` y `22.x` |
| Pi coding agent | `0.85.1` como dependencia instalada | `0.85.1` desde dos consumidores temporales |
| OpenSpec | Opcional | Ausente y configurado en recorridos instalados |
| MCP | Opcional | Adapter y resultado ambiguo cubiertos por regresiones |

La dependencia de Pi permanece acotada en `package.json` como `^0.85.1`; la versión exacta reproducible del smoke queda fijada por `package-lock.json`.

## Evidencia disponible

- `npm test`: 123 pruebas, 121 aprobadas, 0 fallos y 2 omitidas en el entorno Windows actual.
- `npm run test:e2e:required`: 2 pruebas aprobadas, 0 fallos y 1 omitida por ser específica de Git Bash/Windows.
- `npm run pack:check`: correcto; el tarball contiene el runtime distribuible.
- GitHub Actions: verde históricamente para `5feafb2`, con matriz Ubuntu `22.19.0` y `22.x`; falta repetir el job para `5c7f4c6`.
- La expectativa del manifest fue actualizada para reflejar la distribución de `CHANGELOG.md`; el test de manifest y `pack:check` vuelven a pasar.
- Primer slice de Your-Team-Knowledge validado localmente: configuración, loader opt-in y tools nativas; el backend externo permanece desactivado por defecto.
- Smoke e2e del commit `5feafb2`: consumidor instalado aprobado; Git Bash omitido porque este entorno no puede iniciar `/bin/bash`.
- El consumidor instalado cubre instalación, rutas `simple`/`sdd`, recuperación, reconciliación explícita, artefacto corrupto, cancelación, cambio de alcance, fallback del modelo y MCP ambiguo.
- La Etapa 5 incluye ahora `/harness-overview` y `/harness-delegation` read-only, con registro persistente de delegación; la ejecución de subagentes permanece deshabilitada.

## Acciones externas pendientes antes de publicar

- Conservar el enlace/salida del job Ubuntu para `22.19.0` y `22.x` como evidencia del segundo entorno Linux.
- Registrar, al publicar, la versión efectiva de Pi, sistema operativo, shell y commit del consumidor.
- Conservar el enlace/salida de GitHub Actions del candidato `5feafb2`.
- Autorizar explícitamente la publicación npm.

La medición de arranque disponible es suficiente para mantener TypeScript en runtime en `0.1.0`; una medición adicional compilada queda como optimización posterior y no bloquea este candidato.

## Verificación de un candidato local

```bash
npm ci
npm test
PI_HARNESS_E2E_NPM_CACHE="$(npm config get cache)" npm run test:e2e:required
npm run pack:check
```

El smoke requerido debe terminar con `fail 0`. El skip de Git Bash sólo es aceptable en Linux; en Windows debe ejecutarse el caso correspondiente.

## Notas operativas del candidato `0.1.0`

### Instalación

Desde un repositorio consumidor con Node.js `>=22.19.0` y Pi disponible:

```bash
npm install pi-harness@0.1.0
```

Para probar un tarball sin publicarlo:

```bash
npm install /ruta/pi-harness-0.1.0.tgz --ignore-scripts --no-audit --no-fund
```

Verificar la instalación con:

```bash
npx yh-pi --version
npx yh-pi -- --no-tools --approve --print OK
```

### Actualización

1. Conservar el lockfile y el tarball/versión actualmente funcional.
2. Ejecutar `npm install pi-harness@0.1.0` en el consumidor.
3. Ejecutar `/harness-doctor` y revisar `/harness-overview` antes de iniciar trabajo nuevo.
4. Ejecutar la suite del consumidor y conservar el commit de la actualización.

La actualización no debe borrar `.harness/tasks`, cambios OpenSpec ni la configuración del consumidor.

### Rollback

Si el consumidor falla después de actualizar:

```bash
npm install pi-harness@<version-anterior>
npm ls pi-harness @earendil-works/pi-coding-agent
npx yh-pi --version
```

Después, ejecutar `/harness-doctor`, conservar el artefacto de tarea y registrar el fallo con el commit, Node, Pi, sistema operativo y shell utilizados. No reintentar automáticamente una llamada MCP con resultado `unknown`; confirmar primero el efecto remoto.

## Rollback operativo

Antes de publicar, conservar el tarball y el commit utilizados para cada candidato. Si un consumidor falla:

1. detener la actualización del package;
2. reinstalar la versión o tarball anterior conocido como estable;
3. conservar la salida de `yh-pi --version`, `npm ls pi-harness @earendil-works/pi-coding-agent` y el diagnóstico de `/harness-doctor`;
4. registrar el fallo como regresión antes de preparar otro candidato.

No se publica automáticamente desde este documento ni desde la suite de validación.
