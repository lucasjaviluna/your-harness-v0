# Fase 15 — Actividad y recuperación MCP

## Objetivo

Hacer visible qué ocurrió en las llamadas MCP controladas por yh-pi, de modo que una persona pueda auditar la aprobación aplicada y actuar con cuidado frente a un fallo ambiguo.

## Experiencia

- `/harness-mcp` conserva el estado de configuración y servidores, e incorpora un resumen de la actividad reciente.
- `/harness-mcp-history` muestra hasta las últimas 20 operaciones de la sesión.
- El historial en memoria conserva como máximo 50 operaciones y se limpia al iniciar una nueva sesión.

Cada registro contiene solamente:

- fecha y hora;
- servidor y tool;
- aprobación `human`, `automatic` o `none`;
- resultado;
- duración, cuando la llamada llegó al adapter.

No se conservan ni presentan argumentos, contenido de respuesta, credenciales ni detalles internos del error.

## Resultados y recuperación

| Resultado | Significado | Acción sugerida |
| --- | --- | --- |
| `blocked` | yh-pi impidió iniciar la llamada por allowlist o falta de UI. | Ajustar configuración o usar la TUI. |
| `declined` | La persona rechazó la aprobación. | Solicitar otra vez solo si corresponde. |
| `cancelled` | La operación se canceló antes de iniciarse. | Se puede solicitar de nuevo. |
| `succeeded` | El adapter confirmó la respuesta. | No requiere recuperación. |
| `unknown` | El adapter no confirmó un resultado. La operación podría haber alcanzado al servidor. | Comprobar el efecto remoto antes de reintentar. |

yh-pi nunca reintenta una operación `unknown` de forma automática.

## Auditoría

Cada registro también se añade al historial de sesión de Pi como `harness-mcp-audit`. Esto conserva el mismo conjunto mínimo de metadatos. La vista interactiva es deliberadamente local a la sesión actual; no agrega telemetría ni envía datos fuera del repositorio.
