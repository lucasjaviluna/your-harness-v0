# Workspace and Delegation Parity

Estado revisado el 2026-10-13: Fase 0 parcial, Fase 1 parcial y Fase 2 implementada en contratos/persistencia; la ejecución real de delegación continúa deshabilitada.

## Objetivo

Acercar `pi-harness` a la experiencia operativa de Gentle Shell en dos áreas que todavía están fuera del alcance actual:

1. una vista de workspace que haga visible el estado de la tarea y los cambios relevantes;
2. delegación controlada a subagentes con propiedad, aislamiento, cancelación y recuperación explícitos.

El objetivo no es copiar Gentle Shell completo ni reemplazar Pi. `pi-harness` debe conservar su enfoque de workflow guiado, gates humanos, artefactos persistentes y distribución como package.

## Dependencias y decisiones previas

- Definir una matriz de compatibilidad de Pi antes de usar APIs nuevas. El baseline actual de `pi-harness` depende de `@earendil-works/pi-coding-agent ^0.85.1`; Gentle Shell actual requiere Pi `>=0.99.1`.
- Mantener la delegación deshabilitada por defecto hasta cerrar los contratos de seguridad.
- Mantener Your-Team-Knowledge como integración opt-in y separada de este incremento.
- No introducir un launcher/home propio en esta etapa; primero validar que las APIs de Pi permiten una experiencia suficiente dentro de la sesión actual.

## Fase 0 — Compatibilidad y contrato

### Trabajo

- Ejecutar una matriz mínima contra las versiones de Pi soportadas y documentar APIs disponibles.
- Identificar qué eventos permiten observar tareas hijo, cambios, cancelación y finalización.
- Definir contratos internos para `WorkspaceSnapshot`, `DelegatedTask`, `DelegationEvent` y `DelegationResult`.
- Definir límites: profundidad de delegación, cantidad máxima de hijos, timeout, presupuesto y permisos.

### Avance actual

- `docs/PI_COMPATIBILITY.md` documenta el baseline Pi `0.85.1`, las APIs confirmadas y la ausencia de una API pública nativa de child tasks.
- `src/workspace.ts` y `/harness-overview` implementan el snapshot read-only, incluyendo resúmenes de delegación.
- `src/delegation.ts` y `src/delegation-store.ts` implementan estados, eventos, límites, ownership de scope, validación de registros, persistencia atómica y reconciliación tras reinicio.
- `src/delegation-executor.ts` define el contrato del adaptador futuro y rechaza planes con rutas, aislamiento, ownership, timeout o presupuesto inseguros; todavía no lanza procesos.
- `src/delegation-executor.ts` también genera planes declarativos de worktree y comandos Git explícitos, sin ejecutar Git ni modificar el filesystem.
- El manager de worktrees usa un runner Git inyectable: propaga errores, devuelve un handle solo tras crear correctamente y mantiene la remoción explícita; aún no está conectado al launcher.
- El registro de delegación conserva metadata opcional del worktree y, tras reinicio, marca un worktree creado como `unknown` con revisión humana requerida; nunca lo elimina automáticamente.
- `/harness-delegation` muestra el estado/ruta del worktree y el aviso de revisión; al iniciar sesión, el harness emite una advertencia si hay worktrees inciertos y bloquea cualquier continuación automática.
- `/harness-delegation-review <task-id> <keep|remove>` verifica el worktree con argv Git sin shell: `keep` exige que exista y `remove` exige que Git confirme su desaparición antes de persistir el resultado.
- `runDelegationProcess` aplica abort/cancelación, timeout y presupuesto sobre un runner inyectable; solo conserva estado resumido y clasifica fallos de recuperación como `lost`.
- `createDelegationProcessRunner` adapta un proceso real con `spawn`, argv explícito, `shell: false` y stdio ignorado; permanece sin conexión al launcher.
- `/harness-delegation` muestra el registro de forma read-only.
- No existe todavía launcher, proceso hijo, worktree físico, cancelación, timeout operativo, presupuesto ni integración automática; el registro ya rechaza ownership concurrente sobre el mismo scope de escritura.

### Gate de salida

- Existe una matriz reproducible de Pi y una versión objetivo declarada.
- Los contratos no dependen de detalles no disponibles en la versión objetivo.
- No se habilita ninguna delegación real antes de este gate.

## Fase 1 — Workspace read-only

### Trabajo

- Crear un modelo de snapshot que combine:
  - tarea activa y fase;
  - próximo paso y gate humano pendiente;
  - estado del repositorio y cambios observados;
  - cambios OpenSpec cuando existan;
  - tareas delegadas y su estado, si las hubiera.
- Extender `/harness-overview` con navegación o secciones suficientemente claras.
- Agregar cambios bajo demanda sin ejecutar mutaciones ni afirmar que un repositorio está limpio cuando no fue inspeccionado.
- Mantener carga diferida para no penalizar el arranque.

### Gate de salida

- El snapshot funciona sin tarea, con tarea activa, con artefacto recuperado y con cambios Git.
- La vista es read-only y no modifica artefactos ni configuración.
- Hay pruebas instaladas desde tarball para los estados principales.

## Fase 2 — Modelo de delegación

### Trabajo

- Introducir un registro persistente de tareas hijo con relación padre-hijo.
- Definir estados terminales y no terminales: `queued`, `running`, `awaiting-input`, `succeeded`, `failed`, `cancelled`, `lost`.
- Registrar eventos mínimos: creación, inicio, progreso resumido, solicitud de input, finalización, cancelación y pérdida de proceso.
- Evitar guardar prompts, credenciales o salida completa cuando no sea necesario.
- Hacer idempotente la reconciliación después de reinicio.

### Gate de salida

- Una tarea padre puede reconstruir el estado de sus hijos después de reiniciar Pi.
- Un hijo perdido no se presenta como exitoso ni se reintenta automáticamente.
- La evidencia permite distinguir finalización, cancelación y pérdida.

## Fase 3 — Aislamiento y worktrees

### Trabajo

- Definir si cada hijo trabaja en el checkout principal, en un worktree o en un modo estrictamente read-only.
- Implementar ownership explícito de tarea, ruta y artefactos.
- Impedir que dos hijos escriban simultáneamente sobre el mismo objetivo sin una decisión explícita.
- Asociar cambios producidos con el hijo que los generó.
- Diseñar cleanup y recuperación sin borrar cambios no revisados.

### Gate de salida

- Un hijo no puede escribir fuera de su scope autorizado.
- Un conflicto de ownership bloquea la operación y requiere intervención humana.
- Los cambios de un hijo pueden revisarse antes de integrarse.
- El cleanup es reversible o conserva evidencia suficiente para recuperar el estado.

## Fase 4 — Orquestación controlada

### Trabajo

- Agregar una operación explícita para crear una tarea hijo desde una tarea padre.
- Aplicar límites de profundidad, concurrencia, timeout y presupuesto.
- Definir modos `task` y `background`, con reglas distintas para preguntas interactivas.
- Propagar cancelación del padre a los hijos cuando corresponda.
- Exigir revisión humana antes de integrar cambios producidos por hijos.
- Mantener delegación opt-in en configuración y deshabilitada por defecto.

### Gate de salida

- Se cubren creación, éxito, fallo, cancelación, timeout y pérdida de hijo.
- Ningún hijo puede cerrar silenciosamente una tarea padre.
- Los cambios delegados no se incorporan sin un gate de revisión.
- El sistema mantiene comportamiento seguro cuando la delegación está deshabilitada.

## Fase 5 — UX y operación

### Trabajo

- Integrar tareas padre/hijo en `/harness-overview`.
- Agregar comandos de diagnóstico y estado sin exponer datos sensibles.
- Documentar configuración, límites, recuperación, rollback y troubleshooting.
- Medir impacto de arranque y uso de memoria.
- Validar la experiencia en un repositorio consumidor real.

### Gate de salida

- La vista explica qué está haciendo cada tarea y qué requiere del usuario.
- Un operador puede diagnosticar una delegación incompleta sin inspeccionar archivos internos.
- La documentación incluye ejemplos de activación, desactivación y recuperación.
- CI y el smoke de consumidores permanecen verdes.

## Fase 6 — Evaluación de paridad

Comparar el resultado con Gentle Shell en estas dimensiones:

- visibilidad del workspace;
- cambios y diffs;
- persistencia de tareas;
- ownership y worktrees;
- subagentes y estados;
- cancelación y recuperación;
- revisión humana;
- compatibilidad de Pi;
- coste de mantenimiento.

La fase debe terminar con una decisión explícita: continuar hacia un workspace más completo, mantener `pi-harness` como harness enfocado o separar la funcionalidad en un package adicional.

## Fuera de alcance

- Reimplementar todo el launcher `gentle-shell`.
- Gestionar homes, credenciales o perfiles globales de Pi.
- Incorporar memoria persistente como requisito del workflow.
- Ejecutar publicación npm automáticamente.
- Permitir modo autónomo sin gates humanos.

## Próximo incremento

1. Repetir la matriz de compatibilidad y el smoke instalado sobre el commit actual.
2. Ejecutar en CI la prueba de consumidor instalada para overview/delegation y esquemas corruptos o incompatibles.
3. Probar propagación de cancelación y recuperación sobre procesos reales antes de conectar el runner a la delegación de sesión.
4. Mantener la delegación real apagada hasta cerrar el gate de aislamiento y recuperación.

## Criterio global de éxito

`pi-harness` debe poder mostrar y recuperar un workspace con tareas propias y delegadas, mantener ownership y límites verificables, exigir revisión antes de integrar cambios y conservar todos los gates actuales de seguridad, empaquetado y recuperación.
