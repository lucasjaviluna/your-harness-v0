# Fase 0 — Contrato de producto

Estado: completada como contrato inicial; se actualizará cuando la implementación revele nuevas decisiones.

## 1. Objetivo de la fase

Definir el comportamiento observable de `pi-harness` antes de implementar la extensión y las skills. El contrato debe permitir que otra persona entienda qué ocurre con una solicitud simple, una tarea ligera, una tarea SDD y una solicitud ambigua.

## 2. Entrada pública inicial

El punto de entrada será el comando explícito `/harness-work`.

```text
/harness-work Corregir el texto del mensaje de error de login
/harness-work Implementar reintentos para llamadas HTTP fallidas
/harness-work Agregar permisos por rol
/harness-work --mode simple Renombrar una variable local
/harness-work --mode task Actualizar el flujo de autenticación
/harness-work --mode sdd Diseñar una migración de sesiones
/harness-work --analyze-only Evaluar la migración de sesiones
```

Reglas de entrada:

- El texto del prompt se conserva literalmente.
- `auto` es el modo predeterminado.
- `--mode simple`, `--mode task` y `--mode sdd` permiten una preferencia explícita del usuario.
- La preferencia no elimina preguntas necesarias ni autorizaciones obligatorias.
- `--analyze-only` no puede modificar archivos.
- Un prompt vacío o una opción desconocida produce ayuda y no crea una tarea.

## 3. Rutas y criterios

### Ruta `simple`

Se usa cuando el cambio tiene alcance local, requisitos claros, bajo riesgo y verificación acotada.

```text
intake → assessing → implementing → verifying → awaiting-review → done
```

El perfil `balanced` permite implementar directamente. Se detiene si aparece una acción destructiva, un cambio de alcance, un riesgo arquitectónico o una verificación fallida relevante.

### Ruta `task`

Se usa cuando el cambio necesita continuidad y varias decisiones, pero no una especificación SDD completa.

```text
intake → assessing → awaiting-approval → planning
  → implementing → verifying → awaiting-review → done
```

La aprobación inicial cubre el objetivo, el alcance y el plan. El estado se persiste en `.harness/tasks/<task-name>.md`.

### Ruta `sdd`

Se recomienda para contratos, migraciones, seguridad, arquitectura, compatibilidad o cambios difíciles de verificar.

```text
intake → assessing → awaiting-approval
  → planning/OpenSpec → awaiting-review
  → awaiting-approval/apply → implementing
  → verifying → awaiting-review → done
```

La persona debe autorizar la ruta SDD, revisar los artefactos y autorizar `apply` antes de implementar.

### Ruta `clarify`

Se usa cuando falta información decisiva. La tarea queda detenida hasta recibir respuestas suficientes.

```text
intake → assessing → clarifying → assessing
```

## 4. Definición de terminado

Una tarea solo puede declararse `done` cuando:

- el cambio está dentro del alcance autorizado;
- el diff fue revisado según el perfil HIL;
- se ejecutaron las verificaciones proporcionales disponibles;
- cada verificación tiene estado y evidencia;
- las verificaciones omitidas están explicitadas;
- los riesgos y decisiones pendientes aparecen en el resumen;
- los checkpoints humanos bloqueantes tienen una decisión registrada.

En `--analyze-only`, terminado significa mostrar la evaluación y no modificar archivos.

## 5. Human-in-the-Middle

### Perfiles

| Perfil | Uso inicial |
| --- | --- |
| `conservative` | Aprobación antes de planificar, editar y cerrar. |
| `balanced` | Predeterminado: autonomía para acciones mecánicas y aprobación para decisiones relevantes. |
| `autonomous` | Futuro: solo se detiene ante bloqueos, acciones destructivas o cambios de alcance. |

### Gates

| Gate | Pregunta que debe responder la persona |
| --- | --- |
| `clarify` | ¿Qué requisito o contexto falta? |
| `authorize` | ¿Se aprueba esta ruta, este plan o este cambio de alcance? |
| `review` | ¿El resultado, diff o artefacto es aceptable? |
| `recover` | ¿Cómo debe continuar una tarea interrumpida o fallida? |

Siempre requieren autorización:

- acciones destructivas o difícilmente reversibles;
- efectos externos o publicación;
- cambios de contratos, esquemas, permisos o arquitectura;
- ampliaciones de alcance;
- `apply` y archivo de un change SDD;
- cierre de una tarea compleja con verificaciones pendientes.

## 6. Estados iniciales

```ts
type Phase =
  | "intake"
  | "assessing"
  | "clarifying"
  | "awaiting-approval"
  | "planning"
  | "implementing"
  | "verifying"
  | "awaiting-review"
  | "blocked"
  | "done"
  | "cancelled"
  | "failed";

type Route = "simple" | "task" | "sdd" | "clarify";

type HumanGate = {
  id: string;
  kind: "clarify" | "authorize" | "review" | "recover";
  question: string;
  evidence: string[];
  blocksProgress: boolean;
  decision?: "approve" | "reject" | "revise" | "cancel" | "answer";
  note?: string;
};
```

Una tarea en `awaiting-approval`, `awaiting-review` o `blocked` nunca continúa silenciosamente.

## 7. Resultado común

Todas las rutas terminan con una salida compatible:

```ts
type WorkResult = {
  status: "completed" | "blocked" | "needs-input" | "failed";
  summary: string;
  artifacts: string[];
  checks: Array<{
    command?: string;
    status: "passed" | "failed" | "skipped";
    evidence: string;
  }>;
  nextStep?: string;
  risks: string[];
};
```

## 8. Ejemplos de comportamiento

### Simple: cambio local

Prompt: `Renombrar una variable local en el parser.`

Resultado esperado: recomendar `simple`, editar el archivo, ejecutar la verificación disponible, mostrar el diff y resumir. No crear artefactos SDD.

### Task: cambio con continuidad

Prompt: `Actualizar el flujo de autenticación para soportar refresh tokens.`

Resultado esperado: recomendar `task`, explicar el alcance, crear una tarea ligera, pedir aprobación del plan y persistir progreso y evidencia.

### SDD: impacto arquitectónico

Prompt: `Agregar permisos por rol a toda la aplicación.`

Resultado esperado: recomendar `sdd`, mostrar razones, esperar autorización, generar o delegar la propuesta OpenSpec, pedir revisión antes de `apply` y mantener el estado recuperable.

### Ambigua: falta una decisión esencial

Prompt: `Mejorar el sistema de sesiones.`

Resultado esperado: producir preguntas concretas sobre alcance, comportamiento esperado y restricciones; no editar archivos ni seleccionar una ruta definitiva hasta recibir respuestas.

## 9. Criterio de cierre de la Fase 0

La Fase 0 se considera cerrada porque:

- existen ejemplos para las cuatro rutas;
- están definidos los criterios de terminado;
- la política HIL y sus gates están documentados;
- están definidas las transiciones principales;
- existe un contrato común de resultado;
- la interfaz pública inicial está fijada.

La implementación puede comenzar sin inventar el comportamiento durante la Fase 1.
