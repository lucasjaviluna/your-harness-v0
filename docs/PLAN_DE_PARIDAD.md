# Plan de paridad

Estado: acordado como dirección de trabajo el 2026-10-08. La prioridad inmediata es cerrar el smoke obligatorio del consumidor instalado. Este plan usa gentle-shell como referencia de usabilidad y madurez operativa; no exige copiar todas sus funciones.

## Objetivo

Lograr que `yh-pi` sea un producto estable y usable: instalable en un repositorio limpio, compatible con las versiones de Node y Pi declaradas, capaz de completar y recuperar los recorridos principales, y distribuible mediante un proceso repetible.

## Diagnóstico de partida

- El núcleo ya implementa rutas `simple`, `task`, `sdd` y `clarify`, clasificación asistida con salvaguardas, gates humanos, planes versionados y persistencia de tareas ligeras.
- OpenSpec y MCP están integrados de forma opcional; el proveedor de memoria es un contrato sin backend activo.
- `npm test` pasó con 80 pruebas y 2 omitidas en Windows el 2026-10-08. Las omisiones fueron instalaciones de consumidores temporales que excedieron el timeout del smoke no obligatorio.
- `npm run pack:check` pasó. Sigue pendiente validar en Linux/CI el smoke obligatorio de un consumidor instalado. El último fallo documentado fue una salida vacía frente a la aserción `Ruta seleccionada: simple`.
- La UI actual es una capa sobre Pi; no ofrece todavía un workspace integral como gentle-shell. Esa expansión es posterior a estabilizar el flujo base.

## Etapa 1 — Base de entrega

1. Reproducir el smoke obligatorio en Linux con el mismo comando y caché npm que CI.
2. Determinar si el fallo está en instalación, arranque de Pi, captura de `stdout`/`stderr`, clasificación o aserción. Corregir la causa, no silenciar la prueba.
3. Exigir resultado verde repetible en el job `Require clean-consumer smoke test`.
4. Fijar y probar una matriz mínima de versiones Node/Pi y plataformas anunciadas.
5. Añadir chequeo de tipos y validación del tarball instalado, incluyendo entrada, decisión de ruta y código de salida.
6. Preparar versión, changelog y guías de instalación, actualización y desinstalación.

**Criterio de salida:** una instalación limpia permite iniciar `yh-pi` y completar una tarea simple en cada plataforma anunciada; el smoke obligatorio pasa en CI.

## Etapa 2 — Recorridos reales

Validar desde el package instalado: `simple`; `task` con reinicio y recuperación; `sdd` con y sin OpenSpec; cancelación y cambio de alcance; error del modelo; artefacto corrupto; MCP con resultado incierto. Registrar estado y evidencia final, convertir cada fallo reproducible en una regresión y evitar aserciones basadas en tiempos de UI. Completar la validación manual de carga diferida documentada en `STARTUP_PERFORMANCE.md`.

**Criterio de salida:** ningún recorrido crítico depende sólo de pruebas unitarias o de validación manual histórica.

## Etapa 3 — Arquitectura y recuperación

Extraer incrementalmente de `extensions/harness.ts` los módulos de entrada, evaluación, estado, gates, persistencia y adaptadores. Mantener contratos y recorridos instalados verdes tras cada corte. Incorporar escritura atómica y migración de esquema para artefactos de tarea, además de reconciliación explícita entre sesión y archivo.

**Criterio de salida:** reiniciar, actualizar o encontrar un artefacto dañado produce una recuperación visible y segura, sin avance silencioso ni pérdida de decisiones.

## Etapa 4 — Release candidato

Usar yh-pi en varios repositorios consumidores, registrar fallos de instalación, finalización y recuperación, y corregir bloqueos. Publicar un candidato sólo después de que la matriz de compatibilidad y los recorridos críticos pasen. Repetir la medición de arranque desde un consumidor instalado antes de decidir si distribuir JavaScript compilado.

**Criterio de salida:** versión instalable con compatibilidad declarada, CI verde, recorridos completos verificados, diagnósticos y procedimiento de rollback.

## Etapa 5 — Expansión selectiva

Priorizar, según uso observado, una vista de cambios y tareas; después evaluar delegación con propiedad, aislamiento y cancelación explícitos. Dejar revisión avanzada, métricas, perfiles de modelos y memoria persistente como módulos posteriores con contratos independientes.

## Decisión de producto y riesgo de reimplementación

La primera meta es paridad de **usabilidad y estabilidad del flujo base**, no paridad de todas las funciones de gentle-shell. Antes de reescribir la TUI o adoptar un lanzador/home propios, crear un prototipo aislado de vista de cambios y estado de tareas sobre las APIs de Pi de la matriz soportada. Decidir con ese prototipo y con necesidades observadas si basta el package actual o si hace falta una capa de presentación propia. Evitar concentrar nuevas funciones en `harness.ts`; cada extracción debe conservar un smoke instalado verde.

## Primer hito activo: smoke obligatorio

- Archivo de prueba: `tests/e2e.test.ts`.
- Wrapper obligatorio: `scripts/run-e2e-required.mjs`.
- Job: `.github/workflows/validate.yml`, paso `Require clean-consumer smoke test`.
- Comando equivalente al job en Linux: `PI_HARNESS_E2E_NPM_CACHE="$(npm config get cache)" npm run test:e2e:required`.
- Éxito: prueba de dos consumidores aprobada; aparecen las rutas `simple` y `sdd`; código de salida cero; el caso Git Bash sólo se ejecuta en Windows; job verde en CI.
- Si falla: conservar salida completa y código de salida, identificar la primera operación fallida y corregirla antes de ampliar el roadmap.

## Evidencia local

El 2026-10-08, la reproducción en Ubuntu WSL terminó con la instalación del tarball en dos consumidores aprobada y sin fallos. La prueba de Git Bash se omitió porque es exclusiva de Windows. Queda confirmar el job equivalente de GitHub Actions.
