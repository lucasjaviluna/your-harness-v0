# Fase 7 — Configuración, convivencia y recuperación

Esta fase endurece el package para sesiones reales y repositorios que usan otros packages de Pi.

## Capacidades

- Configuración opcional en `.harness/config.json`.
- Precedencia explícita: defaults internos y luego configuración del proyecto.
- Validación tolerante: valores inválidos producen warnings y no rompen el harness.
- Perfil `developer` y modo `auto` como defaults.
- Recuperación HIL cuando una sesión se interrumpe durante `implementing` o `verifying`.
- Evita duplicar una tarea activa si se envía el mismo prompt y modo.
- `/harness-doctor` para capacidades, warnings, OpenSpec y configuración efectiva.
- `/harness-changes` para cambios Git y changes OpenSpec.
- Prefijo `harness-` para convivencia con comandos de otros packages.
- La revisión simple y las autorizaciones SDD permanecen separadas y configurables según política.

## Recuperación

Al reabrir una sesión con una tarea interrumpida, el estado pasa a `awaiting-approval` con un gate `recover`. La persona puede aprobar la vuelta a `planning` o cancelar; el harness no reanuda silenciosamente una edición incompleta.

## Comandos operativos

```text
/harness-status
/harness-doctor
/harness-changes
/harness-scope <nuevo alcance>
```

Los comandos usan nombres propios y no reemplazan comandos nativos de Pi ni los comandos generados por OpenSpec.
