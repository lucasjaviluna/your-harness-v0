# Rendimiento de arranque

Estado: recorte de carga completado el 2026-10-07. Esta mejora es posterior a la Fase 16 y no altera los workflows, gates HIL ni la configuración pública.

## Objetivo

`yh-pi` debe mostrar la experiencia de Pi y su estado inicial sin cargar integraciones o workflows que todavía no fueron solicitados. Las dependencias diferidas se cargan al usar el comando o workflow que las requiere.

## Carga inicial

Al registrar la extensión, yh-pi conserva únicamente los contratos, la evaluación, la configuración, el estado de sesión y `RepositoryCapability`.

No se cargan en el inicio normal:

- el SDK MCP ni `mcp-adapter-integration`;
- Git, OpenSpec ni la capability de verificación;
- el workflow `simple`;
- el motor de contexto, la persistencia de tareas y el render detallado de planes.

## Activación bajo demanda

| Componente | Cuándo se carga |
| --- | --- |
| Integración MCP | Al iniciar una sesión con `mcp.enabled`, o al ejecutar `/harness-mcp`, `/harness-mcp-history` o `/harness-mcp-settings`. |
| Git, OpenSpec y verificación | Al iniciar o cerrar un workflow simple, ejecutar SDD, consultar `/harness-doctor` o `/harness-changes`. |
| Workflow simple | Al iniciar una tarea `simple` o procesar su resultado. |
| Helpers de OpenSpec | Al delegar o procesar una tarea `sdd`. |
| `ContextEngine` y artefactos de tareas | Al preparar, revisar, persistir, recuperar o borrar una tarea. |
| Render detallado del plan | Al abrir el plan completo o escribir un artefacto Markdown. |

Los comandos MCP permanecen registrados desde el inicio. Si se ejecuta uno con MCP deshabilitado, yh-pi carga la integración para mostrar o editar su estado; no activa ninguna tool ni conexión por ese solo hecho.

## Límites y siguiente medición

El proceso sigue transformando TypeScript en tiempo de ejecución, por lo que existe un coste base independiente de los módulos diferidos. Antes de añadir un build distribuido, se debe medir el arranque de `yh-pi` en condiciones reales y comparar una compilación JavaScript con el runtime actual.

## Validación

- Pruebas de inicio, MCP, capabilities, workflow, planes y artefactos.
- `npm test`.
- `npm run pack:check`.
- `git diff --check`.

El pendiente de CI del smoke test `tests/e2e.test.ts` continúa registrado en el plan de implementación y no forma parte de este recorte.
