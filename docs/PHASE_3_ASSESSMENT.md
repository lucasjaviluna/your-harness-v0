# Fase 3 — Evaluación y selección de ruta

Estado: completada.

## Objetivo

Convertir una tarea de `intake` en una recomendación visible y persistible: `simple`, `task`, `sdd` o `clarify`. La evaluación es determinista, explicable y no modifica archivos del proyecto consumidor.

## Política de enrutamiento

La evaluación utiliza señales explícitas del prompt, aclaraciones posteriores y contexto mínimo del repositorio.

| Señal dominante | Ruta | Tratamiento |
| --- | --- | --- |
| Contratos, datos, migraciones, seguridad, permisos, arquitectura, compatibilidad o alcance transversal | `sdd` | Crea un gate de autorización antes de cualquier artefacto OpenSpec. |
| Reintentos, refresh tokens, flujos, integraciones o varios pasos acotados | `task` | Deja la tarea en `planning` para la Fase 4. |
| Cambio textual, typo, renombre local o archivo explícitamente acotado | `simple` | Deja la tarea en `planning` para la Fase 5. |
| Objetivo o alcance decisivo ausente | `clarify` | Crea un gate bloqueante con una pregunta concreta. |

La prioridad es: riesgo SDD → ambigüedad decisiva → tarea intermedia → cambio simple. Así, un prompt corto sobre migración o permisos no se simplifica por su longitud, y un prompt largo pero limitado a un archivo puede seguir siendo `simple`.

## Contrato implementado

`src/task.ts` amplía la tarea con `route`, `assessment`, `intent`, `humanGates` y `clarifications`, además del perfil default `developer`. Los contratos no exigen repositorio ni código como condición universal.

`src/assessment.ts` contiene la política, la evaluación, el gate inicial y el registro de decisiones. La salida incluye ruta recomendada, ruta final, fuente de la ruta, confianza, razones, áreas afectadas, incógnitas y evidencia consultada.

## Override manual

`--mode simple|task|sdd` conserva la intención de la persona como `routeSource: manual` y la muestra en la evaluación. No puede omitir una aclaración decisiva: en ese caso la tarea permanece en `clarify`.

En `--analyze-only`, la evaluación finaliza sin abrir gates de implementación ni crear artefactos.

## Human-in-the-Middle

La extensión incorpora:

```text
/harness-decide <approve|reject|revise|cancel|answer> [nota]
```

- Una recomendación `sdd` queda en `awaiting-approval`. `approve` la lleva a `planning`, pero todavía no crea artefactos OpenSpec; esa integración pertenece a la Fase 6.
- Una solicitud `clarify` queda en `clarifying`. `answer <nota>` registra la respuesta como contexto suplementario y reevalúa sin cambiar el prompt original.
- Rechazar, revisar o cancelar queda persistido en el gate y evita una continuación silenciosa.

Cada actualización se guarda como una entrada custom `pi-harness.task`, por lo que la última tarea y sus decisiones se recuperan al reabrir una sesión.

## Validación

`npm test` cubre once escenarios: las cuatro rutas, casos frontera de longitud e impacto, override manual, autorización SDD, aclaración con reevaluación, `--analyze-only` y evaluación de un perfil no técnico sin repositorio.

También se validó la extensión mediante Pi: una solicitud de permisos por rol produjo la recomendación `sdd`, evidencia contextual y la instrucción de autorizar explícitamente antes de continuar. Tras aprobarla, se reinició la sesión y `/harness-status` recuperó la misma tarea en `planning`, sin un gate pendiente.
