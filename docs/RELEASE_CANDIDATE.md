# Release candidate

Estado: preparación iniciada el 2026-10-11. Este documento reúne los gates de la Etapa 4 sin publicar el package ni cambiar su versión.

## Compatibilidad declarada

| Componente | Mínimo declarado | Validado en esta etapa |
| --- | --- | --- |
| Node.js | `>=22.19.0` | `22.19.0` en CI y Ubuntu |
| Pi coding agent | `0.85.1` como dependencia instalada | `0.85.1` desde dos consumidores temporales |
| OpenSpec | Opcional | Ausente y configurado en recorridos instalados |
| MCP | Opcional | Adapter y resultado ambiguo cubiertos por regresiones |

La dependencia de Pi permanece acotada en `package.json` como `^0.85.1`; la versión exacta reproducible del smoke queda fijada por `package-lock.json`.

## Evidencia disponible

- `npm test`: 96 pruebas, 94 aprobadas, 0 fallos y 2 omitidas en Ubuntu.
- `npm run test:e2e:required`: 2 pruebas aprobadas, 0 fallos y 1 omitida por ser específica de Git Bash/Windows.
- `npm run pack:check`: correcto; el tarball contiene el runtime distribuible.
- El consumidor instalado cubre instalación, rutas `simple`/`sdd`, recuperación, reconciliación explícita, artefacto corrupto, cancelación, cambio de alcance, fallback del modelo y MCP ambiguo.

## Gates pendientes antes de un candidato publicable

- Repetir la matriz mínima en un segundo entorno Linux o repositorio consumidor real.
- Registrar la versión de Node, la versión efectiva de Pi, sistema operativo, shell y commit del consumidor.
- Preparar changelog y notas de instalación, actualización y rollback.
- Decidir si `0.1.0` se conserva para el candidato o se incrementa según el alcance del release.
- Confirmar CI verde para el commit exacto que se quiera distribuir.
- Repetir la medición de arranque desde un consumidor instalado.

## Verificación de un candidato local

```bash
npm ci
npm test
PI_HARNESS_E2E_NPM_CACHE="$(npm config get cache)" npm run test:e2e:required
npm run pack:check
```

El smoke requerido debe terminar con `fail 0`. El skip de Git Bash sólo es aceptable en Linux; en Windows debe ejecutarse el caso correspondiente.

## Rollback operativo

Antes de publicar, conservar el tarball y el commit utilizados para cada candidato. Si un consumidor falla:

1. detener la actualización del package;
2. reinstalar la versión o tarball anterior conocido como estable;
3. conservar la salida de `yh-pi --version`, `npm ls pi-harness @earendil-works/pi-coding-agent` y el diagnóstico de `/harness-doctor`;
4. registrar el fallo como regresión antes de preparar otro candidato.

No se publica automáticamente desde este documento ni desde la suite de validación.
