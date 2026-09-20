# Fase 6 — Ruta compleja con OpenSpec

La ruta SDD delega en OpenSpec la creación y mantenimiento de especificaciones. Pi-harness conserva la evaluación, el estado de la tarea y los checkpoints HIL, pero no duplica la lógica de OpenSpec.

## Detección

`src/openspec.ts` comprueba:

- `openspec/` y sus changes activos.
- Prompts de Pi generados en `.pi/prompts/opsx-*.md`.
- Skills generadas en `.pi/skills/openspec-*`.
- Disponibilidad del CLI `openspec`.

Cuando no existe configuración, el harness muestra la inicialización sugerida (`openspec init --tools pi`) y no modifica el proyecto.

OpenSpec documenta que Pi usa prompts bajo `.pi/prompts/opsx-*.md` y skills bajo `.pi/skills/openspec-*`; por eso el harness no asume una sintaxis universal. [Referencia oficial de herramientas soportadas](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md).

## Ciclo HIL

```text
/harness-work --mode sdd <prompt>
  → autorización inicial
/harness-sdd
  → /opsx-propose <prompt>
  → revisión de proposal/specs/design/tasks
  → autorización para apply
/harness-sdd
  → /opsx-apply
  → revisión humana del diff
  → autorización para verify
/harness-sdd
  → /opsx-verify
  → /opsx-sync
  → autorización para archive
/harness-sdd
  → /opsx-archive
```

El nombre del change, los artefactos esperados, el último paso y el último resultado se guardan en `HarnessTask.openspec` y se persisten como entradas de sesión de Pi.

## Comandos

```text
/harness-work --mode sdd Agregar permisos por rol
/harness-decide approve
/harness-sdd
/harness-status
/harness-scope Cambiar el alcance para incluir auditoría
```

`/harness-scope` abre un nuevo gate de autorización y funciona también para tareas SDD. Si la propuesta queda incompleta, la tarea permanece recuperable en `planning` con un error concreto.
