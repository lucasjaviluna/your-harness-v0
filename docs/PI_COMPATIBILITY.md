# Pi compatibility baseline

Estado: gate inicial de workspace/delegación completado parcialmente, revisado el 2026-10-13.

## Versión objetivo

El package declara `@earendil-works/pi-coding-agent ^0.85.1`. La matriz local usa exactamente `0.85.1`, instalada desde `node_modules` y validada mediante `npm test` y `npm run pack:check`.

## APIs confirmadas

- `ExtensionAPI.on()` expone eventos de sesión, agente, turnos, mensajes y ejecución de tools.
- `ExtensionAPI.registerCommand()` y `registerTool()` están disponibles para comandos y herramientas explícitas.
- El estado propio de la extensión puede reconstruirse desde `sessionManager.getBranch()` y entradas custom, que es el mecanismo usado por las tareas de pi-harness.
- El ejemplo oficial `examples/extensions/subagent` implementa delegación lanzando procesos `pi` separados mediante `child_process.spawn`; no se observó una API nativa de child tasks en el contrato público de `ExtensionAPI`.

## Decisiones para el siguiente gate

- No se habilita delegación real en esta versión.
- Los contratos internos deben tratar `lost` como estado terminal distinto de `succeeded` y no reintentar automáticamente.
- El workspace read-only puede mostrar resúmenes de hijos, pero no prompts, credenciales ni salida completa.
- Cualquier futura implementación de delegación debe encapsular el lanzamiento de procesos, cancelación, timeout y reconciliación detrás de un adaptador versionado.
