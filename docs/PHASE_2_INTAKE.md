# Fase 2 — Ingreso de tarea y contexto mínimo

Estado: completada; recuperación interactiva validada.

## Objetivo

Convertir el prompt recibido por `/harness-work` en una tarea estructurada y recoger únicamente el contexto necesario para que la evaluación posterior sea reproducible.

## Tarea creada

Cada solicitud genera:

- `id` estable dentro de la sesión;
- prompt sin las opciones de control;
- `cwd` de Pi;
- modo solicitado;
- indicador `analyzeOnly`;
- fase inicial `intake`;
- timestamp;
- contexto del repositorio.

## Contexto recogido

- raíz del repositorio mediante `git rev-parse --show-toplevel`;
- estado y rama mediante `git status --short --branch`;
- instrucciones `AGENTS.md` y `CLAUDE.md` desde el directorio actual hacia la raíz;
- archivos principales del nivel superior, excluyendo `.git`, `node_modules` y `.pi`;
- scripts de `package.json` relevantes: `test`, `check`, `lint`, `typecheck` y `build`;
- advertencias de contexto incompleto o Git no disponible.

La lectura de instrucciones está limitada a 8.000 caracteres y los archivos principales a 50 entradas para evitar una exploración inicial desproporcionada.

## Persistencia

La extensión guarda la tarea mediante una entrada custom de Pi con tipo `pi-harness.task`. En `session_start`, recorre la rama activa y reconstruye la última tarea válida.

Este mecanismo funciona en sesiones normales de Pi y no incorpora el estado al contexto del modelo. Las ejecuciones puramente `--print` que solo interceptan comandos pueden no crear un archivo de sesión; la prueba de recuperación tras reinicio debe hacerse en una sesión interactiva o mediante una prueba de integración de sesión.

## Comandos disponibles

```text
/harness-work [--mode auto|simple|task|sdd] [--analyze-only] <prompt>
/harness-status
```

`/harness-status` muestra ID, fase, modo, CWD, estado Git, instrucciones encontradas, comandos de verificación y prompt.

## Archivos de implementación

- `src/task.ts`: contratos, creación, validación y presentación de tareas.
- `src/intake.ts`: descubrimiento del repositorio y contexto mínimo.
- `extensions/harness.ts`: comandos Pi, persistencia y restauración.

## Criterio de cierre

Una sesión normal de Pi fue iniciada con un directorio de sesiones temporal, recibió una tarea, se cerró y se reabrió con el mismo identificador. `/harness-status` recuperó la misma tarea, incluyendo ID, prompt, modo, CWD y contexto, sin duplicarla.
