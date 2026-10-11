# Plan de paridad

Estado: Etapa 3 cerrada, Etapa 4 validada y Etapa 5 en expansión selectiva. El smoke e2e del baseline `5feafb2` pasa con consumidor instalado y GitHub Actions está verde en la matriz Ubuntu `22.19.0`/`22.x`. El primer slice de Your-Team-Knowledge está implementado, pero la integración SQLite real queda separada del release hasta disponer de un módulo compilado consumible. Este plan usa gentle-shell como referencia de usabilidad y madurez operativa; no exige copiar todas sus funciones.

## Objetivo

Lograr que `yh-pi` sea un producto estable y usable: instalable en un repositorio limpio, compatible con las versiones de Node y Pi declaradas, capaz de completar y recuperar los recorridos principales, y distribuible mediante un proceso repetible.

## Diagnóstico de partida

- El núcleo ya implementa rutas `simple`, `task`, `sdd` y `clarify`, clasificación asistida con salvaguardas, gates humanos, planes versionados y persistencia de tareas ligeras.
- OpenSpec y MCP están integrados de forma opcional; el provider de Your-Team-Knowledge existe como integración opt-in y sigue desactivado por defecto.
- `npm test` pasó con 96 pruebas, 94 aprobadas, 0 fallos y 2 omitidas en Windows/consumidores temporales.
- `npm run pack:check` pasó. El smoke obligatorio de un consumidor instalado pasó en Ubuntu WSL y en GitHub Actions después de corregir la resolución ESM del binario de Pi y el cierre de `stdin` en modo `--print`.
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

Progreso: `simple` y el enrutamiento `sdd` ya pasan en el smoke de consumidor. Las regresiones RPC instaladas, validadas en Ubuntu WSL el 2026-10-08, cubren recuperación de tarea tras reinicio, OpenSpec ausente sin efectos en el proyecto, artefacto corrupto sin sobrescritura, fallback del modelo, cancelación terminal y cambio de alcance persistido. El recorrido SDD con OpenSpec configurado y el caso MCP ambiguo también pasan desde el package instalado en Windows; este último usa una respuesta simulada del adapter y verifica `unknown`, historial y ausencia de reintento automático. El único fallo restante de la suite obligatoria local es el caso Git Bash, porque `bash.exe` resuelve a un WSL sin `/bin/bash`.

La validación manual de carga diferida se completó en Ubuntu WSL; la Etapa 2 queda cerrada con los recorridos críticos validados desde el package instalado.

**Criterio de salida:** ningún recorrido crítico depende sólo de pruebas unitarias o de validación manual histórica.

## Etapa 3 — Arquitectura y recuperación

Estado: completada el 2026-10-11. El primer corte incorpora escritura atómica y un esquema versionado compatible para artefactos de tarea. El segundo corte extrae la reconciliación de estado a un módulo dedicado y exige elegir explícitamente entre sesión y artefacto cuando divergen. El tercer corte centraliza sincronización, recuperación y bloqueo de conflictos en `src/task-state.ts`, eliminando esas responsabilidades y su duplicación de la extensión principal. La validación final en Ubuntu completó `npm test` (94 aprobadas, 2 omitidas), el smoke obligatorio de dos consumidores instalados (2 aprobadas, 1 omitida de Git Bash fuera de Windows) y `npm run pack:check`, sin fallos.

Extraer incrementalmente de `extensions/harness.ts` los módulos de entrada, evaluación, estado, gates, persistencia y adaptadores. Mantener contratos y recorridos instalados verdes tras cada corte. Incorporar escritura atómica y migración de esquema para artefactos de tarea, además de reconciliación explícita entre sesión y archivo.

**Criterio de salida:** reiniciar, actualizar o encontrar un artefacto dañado produce una recuperación visible y segura, sin avance silencioso ni pérdida de decisiones.

## Etapa 4 — Release candidato

Estado: gates técnicos en verde en `d94e3b6`. La suite local, el smoke e2e de dos consumidores, la vista unificada instalada y el empaquetado pasan; GitHub Actions confirmó el candidato. La ficha de compatibilidad, evidencia, gates de publicación y rollback está en `docs/RELEASE_CANDIDATE.md`.

Usar yh-pi en varios repositorios consumidores, registrar fallos de instalación, finalización y recuperación, y corregir bloqueos. Publicar un candidato sólo después de que la matriz de compatibilidad y los recorridos críticos pasen. Repetir la medición de arranque desde un consumidor instalado antes de decidir si distribuir JavaScript compilado.

**Criterio de salida:** versión instalable con compatibilidad declarada, CI verde, recorridos completos verificados, diagnósticos y procedimiento de rollback.

## Etapa 5 — Expansión selectiva

Estado: completada en el alcance acordado. `/harness-overview` ofrece una vista read-only que combina tarea activa, próximo paso, gate humano pendiente, cambios Git y changes OpenSpec. La matriz instalada valida tarea ausente/activa, recuperación, MCP deshabilitado e historial vacío, además de la carga diferida de diagnósticos. La integración SQLite con `your-team-knowledge` queda pausada hasta alcanzar la madurez acordada.

Decisión de alcance: no se incorpora delegación a subagentes en esta etapa. El plan de implementación la mantiene fuera del MVP; retomarla requerirá un contrato separado para propiedad de tarea, aislamiento de artefactos, cancelación y recuperación, con gates propios.

## Decisión de producto y riesgo de reimplementación

La primera meta es paridad de **usabilidad y estabilidad del flujo base**, no paridad de todas las funciones de gentle-shell. Antes de reescribir la TUI o adoptar un lanzador/home propios, crear un prototipo aislado de vista de cambios y estado de tareas sobre las APIs de Pi de la matriz soportada. Decidir con ese prototipo y con necesidades observadas si basta el package actual o si hace falta una capa de presentación propia. Evitar concentrar nuevas funciones en `harness.ts`; cada extracción debe conservar un smoke instalado verde.

## Hito cerrado: smoke obligatorio

- Archivo de prueba: `tests/e2e.test.ts`.
- Wrapper obligatorio: `scripts/run-e2e-required.mjs`.
- Job: `.github/workflows/validate.yml`, paso `Require clean-consumer smoke test`.
- Comando equivalente al job en Linux: `PI_HARNESS_E2E_NPM_CACHE="$(npm config get cache)" npm run test:e2e:required`.
- Éxito: prueba de dos consumidores aprobada; aparecen las rutas `simple` y `sdd`; código de salida cero; el caso Git Bash sólo se ejecuta en Windows; job verde en CI.
- Si falla: conservar salida completa y código de salida, identificar la primera operación fallida y corregirla antes de ampliar el roadmap.

## Evidencia

El 2026-10-08, la reproducción en Ubuntu WSL terminó con la instalación del tarball en dos consumidores aprobada y sin fallos. La prueba de Git Bash se omitió porque es exclusiva de Windows. Más tarde ese día, la regresión instalada de tarea ligera creó su artefacto, cerró el proceso y lo recuperó desde un segundo proceso RPC en Ubuntu WSL. El 2026-10-11, GitHub Actions terminó verde con la matriz configurada; se corrigió la expectativa del manifest para incluir `CHANGELOG.md`.
