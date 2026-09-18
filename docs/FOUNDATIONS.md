# Pi Harness — Documentación fundacional

Estado: documento vivo de arquitectura y producto. Se actualizará junto con las decisiones del proyecto.

## 1. Propósito

`pi-harness` será un package instalable de Pi para conducir tareas de desarrollo de software a partir de un prompt del usuario.

El harness inspeccionará el repositorio, recomendará una estrategia proporcional a la complejidad, coordinará la implementación y exigirá evidencia verificable antes de declarar una tarea terminada.

La integración con Azure DevOps, tickets y otros sistemas externos queda deliberadamente fuera del alcance inicial.

## 2. Problema que resuelve

Una solicitud de desarrollo puede ser trivial, requerir continuidad o implicar decisiones arquitectónicas. Usar siempre el mismo proceso produce dos problemas:

- demasiada burocracia para cambios pequeños;
- poca trazabilidad y control para cambios complejos.

Pi Harness adapta el proceso al riesgo sin perder continuidad, verificabilidad ni control humano.

## 3. Principios de diseño

- El prompt original se conserva sin modificar.
- La evaluación debe explicar sus razones y basarse en evidencia del repositorio.
- Las instrucciones del repositorio tienen prioridad sobre las convenciones generales del package.
- La complejidad determina la cantidad de planificación y persistencia necesaria.
- Human-in-the-Middle controla decisiones relevantes, no cada acción mecánica.
- Toda finalización debe incluir evidencia de verificación y limitaciones conocidas.
- Las integraciones externas deben ser adaptadores o packages compañeros.
- El harness debe coexistir con otros packages de Pi sin apropiarse de sus comandos o artefactos.

## 4. Rutas de trabajo

### 4.1 `simple`

Para cambios locales, claros, reversibles y fáciles de verificar.

```text
entender → inspeccionar → editar → verificar → revisar diff → resumir
```

No requiere un documento persistente completo.

### 4.2 `task`

Para cambios medianos que necesitan continuidad, pero no una especificación SDD completa.

Su artefacto principal será `.harness/tasks/<task-name>.md`, con objetivo, alcance, restricciones, tareas, progreso, evidencia y próximo paso.

### 4.3 `sdd`

Para cambios con impacto arquitectónico, contratos, migraciones, seguridad, compatibilidad o múltiples decisiones relevantes.

OpenSpec mantiene la propiedad de sus propuestas, especificaciones, diseño, tareas y comandos. Pi Harness coordina la ruta y el estado humano.

### 4.4 `clarify`

Para solicitudes en las que falta información decisiva. El harness debe hacer preguntas concretas antes de elegir una estrategia.

## 5. Human-in-the-Middle

Human-in-the-Middle es una política transversal del sistema. El agente puede trabajar autónomamente dentro de un alcance autorizado, pero debe detenerse ante decisiones que cambien el riesgo o el objetivo.

### 5.1 Tipos de checkpoint

- `clarify`: solicita información faltante.
- `authorize`: pide permiso para iniciar un plan, aplicar un cambio o ampliar el alcance.
- `review`: presenta resultados, diffs, artefactos y verificaciones para revisión.
- `recover`: solicita una decisión después de una interrupción, error o estado inconsistente.

### 5.2 Niveles de autonomía

| Perfil | Comportamiento |
| --- | --- |
| `conservative` | Requiere aprobación antes de planificar, editar y cerrar. |
| `balanced` | Permite cambios simples y bloquea decisiones de riesgo. Es el perfil MVP. |
| `autonomous` | Continúa mientras no haya bloqueo, acción destructiva o cambio de alcance. |

### 5.3 Acciones que siempre requieren autorización

- borrar o sobrescribir datos de forma difícilmente reversible;
- ejecutar efectos externos o publicar información;
- cambiar contratos, esquemas, permisos o arquitectura;
- ampliar el alcance original;
- ejecutar `apply` o archivar un change SDD;
- cerrar una tarea compleja con verificaciones pendientes.

### 5.4 Regla de interacción

El usuario no debe aprobar cada edición mecánica. Debe aprobar decisiones de alcance, arquitectura, riesgo, efectos externos y cierre. Cada decisión se persiste con su pregunta, evidencia, respuesta, nota y timestamp.

## 6. Flujo general

```text
prompt
  ↓
contexto del repositorio
  ↓
evaluación explicada
  ↓
recomendación de ruta
  ↓
checkpoint humano si corresponde
  ↓
planificación e implementación
  ↓
verificación basada en evidencia
  ↓
revisión humana según riesgo
  ↓
resultado: done | blocked | needs-input | failed | cancelled
```

Una tarea puede volver a evaluación si durante la implementación aparece un impacto mayor al previsto.

## 7. Máquina de estados

Estados mínimos:

```text
intake
  → assessing
  → clarifying
  → awaiting-approval
  → planning
  → implementing
  → verifying
  → awaiting-review
  → done
```

Estados alternativos:

- `blocked`: no puede avanzar sin una condición externa o decisión.
- `cancelled`: el usuario pidió detener la tarea.
- `failed`: falló una operación y no hay recuperación automática segura.

Una tarea en `awaiting-approval` o `awaiting-review` no debe continuar silenciosamente.

## 8. Contratos conceptuales

### Task

Identidad de la tarea, prompt original, directorio, ruta, fase, evaluación, artefactos y checkpoints humanos.

### Assessment

Ruta recomendada, confianza, razones, áreas afectadas, incógnitas y evidencia consultada.

### HumanGate

Checkpoint con tipo, motivo, pregunta, opciones, evidencia, si bloquea el progreso y decisión persistida.

### WorkResult

Resultado común con estado, resumen, artefactos, verificaciones, riesgos y siguiente paso.

## 9. Arquitectura prevista

```text
pi-harness/
├── package.json
├── extensions/harness.ts
├── src/
│   ├── task.ts
│   ├── intake.ts
│   ├── assessment.ts
│   ├── config.ts
│   ├── human-gates.ts
│   ├── result.ts
│   └── openspec.ts
├── skills/
│   ├── harness-assess/SKILL.md
│   ├── harness-simple/SKILL.md
│   ├── harness-task/SKILL.md
│   └── harness-sdd/SKILL.md
├── tests/
└── docs/
```

## 10. Persistencia y recuperación

La primera versión no necesita una base de datos adicional. El estado puede reconstruirse desde:

- el estado de la sesión de Pi;
- `.harness/tasks/` para tareas ligeras;
- los artefactos propios de OpenSpec para tareas SDD;
- las decisiones Human-in-the-Middle asociadas a la tarea.

El objetivo es poder continuar después de reiniciar Pi, cancelar una operación o volver a una tarea días después.

## 11. Alcance del MVP

Incluye:

- entrada mediante `/harness-work`;
- rutas `simple`, `task`, `sdd` y `clarify`;
- evaluación explicada;
- perfil HIL `balanced`;
- gates de autorización, revisión, aclaración y recuperación;
- persistencia de tareas ligeras;
- verificación y resumen con evidencia;
- recuperación básica de estado.

No incluye:

- Azure DevOps o sistemas de tickets;
- ramas, commits, PRs o releases automáticos;
- subagentes y coordinación distribuida;
- memoria externa;
- dashboards o UI propia;
- telemetría y APIs externas;
- autonomía completa sin confirmación en tareas de riesgo.

## 12. Decisiones abiertas

- Nombre final del package y ámbito npm.
- Ubicación y formato de configuración.
- Nombre final de la ruta intermedia: `task`, `odd` o `work-item`.
- Versiones mínimas compatibles de Pi y OpenSpec.
- Cuánto del flujo SDD se automatizará después de la primera versión.
- Si se admitirá capturar prompts normales de Pi además de `/harness-work`.

## 13. Estado actual

- El repositorio contiene el plan por fases en `docs/PLAN_IMPLEMENTACION.md`.
- La documentación fundacional está definida en este archivo.
- La Fase 0 está completada como contrato inicial del producto.
- La Fase 1 está en progreso: manifest y extensión inicial creados; faltan pruebas de instalación y compatibilidad.
- Las fases 2 a 8 permanecen pendientes.
- La próxima unidad de trabajo recomendada es completar la Fase 1: pruebas de instalación, compatibilidad y carga desde otro repositorio.

## 14. Fuentes

- Pi: https://pi.dev
- OpenSpec: https://github.com/Fission-AI/OpenSpec
