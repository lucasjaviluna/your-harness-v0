# Fase 4 — Ruta de tarea ligera

Estado: completada.

## Objetivo

Dar continuidad a cambios medianos sin exigir todavía la estructura completa de OpenSpec. La ruta `task` conserva un artefacto Markdown legible por personas y un estado estructurado recuperable por pi-harness.

## Artefacto

Cada tarea `task` crea:

```text
.harness/tasks/<task-id>.md
```

El archivo contiene:

- objetivo y prompt original;
- alcance actual;
- restricciones;
- checklist de tareas;
- decisiones HIL;
- evidencia del intake y la evaluación;
- fase y progreso;
- próximo paso;
- un bloque de estado serializado para recuperación exacta.

Las secciones `Tasks`, `Decisions` y `Evidence` se conservan cuando el archivo se actualiza. Esto permite que una persona edite o complete el checklist sin perderlo en cada actualización automática.

## Flujo

```text
/harness-work <prompt>
        ↓
assessment: task
        ↓
crear .harness/tasks/<task-id>.md
        ↓
awaiting-approval
        ↓
/harness-decide approve  (aprueba objetivo y plan)
        ↓
awaiting-approval       (autorizar inicio)
        ↓
/harness-decide approve
        ↓
planning
        ↓
implementing → verifying → awaiting-review
        ↓
/harness-task-close <resumen>
        ↓
done
```

La primera aprobación cubre objetivo y plan. La segunda autoriza iniciar la implementación. Un cambio de alcance se registra con:

```text
/harness-task-scope <nuevo alcance>
/harness-decide approve
```

El cambio crea un nuevo gate bloqueante. No se continúa silenciosamente con un alcance diferente.

## Comandos

```text
/harness-task-resume [task-id]
/harness-task-status
/harness-task-delete
/harness-task-scope <nuevo alcance>
/harness-task-close <resumen>
```

`/harness-task-resume` lee el artefacto desde `.harness/tasks`, reconstruye el estado y lo vuelve a asociar a la sesión de Pi. Si no se pasa un identificador, recupera el último archivo disponible.

Al cancelar, la tarea queda en estado terminal `cancelled`: el Markdown registra la fecha y la decisión humana, y no propone pasos siguientes. El archivo se conserva por defecto como evidencia; para retomar la solicitud se crea otra tarea, no se reactiva la cancelada. La TUI ofrece conservarlo o eliminarlo tras cancelar. Más adelante, `/harness-task-delete` permite eliminar únicamente el archivo de la última tarea ligera cancelada, mostrando su ruta exacta y solicitando confirmación. Esta acción no borra el historial de la sesión de Pi.

Si la persona envía otro prompt después de cancelar, yh-pi compara la intención con la última tarea cancelada. Una repetición literal se reconoce localmente; para otras formulaciones consulta brevemente al modelo configurado en Pi. La TUI muestra el pedido anterior y el nuevo, y ofrece únicamente crear una tarea nueva en yh-pi o no continuar, tanto si la equivalencia es clara como si la comparación es incierta. Si el modelo no está disponible, la comparación queda como incierta y se solicita la revisión humana. Un comando explícito `/harness-work ...` inicia una tarea nueva mediante el flujo habitual de yh-pi.

`/harness-task-close` solo funciona desde `awaiting-review`. El resultado común registra estado, resumen, artefactos, verificaciones y riesgos; la implementación real y las verificaciones concretas se completarán en la Fase 5.

## Validación

La ruta se probó desde Pi en el repositorio consumidor fixture. Se verificó que:

- se crea el Markdown bajo `.harness/tasks`;
- la tarea queda en `awaiting-approval`;
- el prompt y contexto quedan persistidos;
- el repositorio no recibe modificaciones de código.

Las pruebas unitarias cubren creación, recuperación, preservación de secciones y rechazo de artefactos corruptos.
