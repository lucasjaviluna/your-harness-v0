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

## Medición de distribución compilada

Medición realizada el 2026-10-08 en Windows, ejecutando el CLI de Pi con el mismo flujo de captura de `yh-pi` (`--no-tools --approve --no-session --print OK`, sin red). Se comparó la extensión fuente `extensions/harness.ts` con un prototipo ESM compilado mediante esbuild, conservando los módulos diferidos como chunks.

| Variante | Muestras | Mediana | Media | p95 |
| --- | ---: | ---: | ---: | ---: |
| TypeScript en runtime | 17 | 1.825 s | 1.896 s | 4.104 s |
| JavaScript compilado | 16 | 1.594 s | 1.624 s | 2.131 s |

La variante compilada redujo la mediana en 231 ms (12,7 %). Ambas produjeron la misma captura, clasificación determinista y gate de decisión. Las muestras tuvieron variabilidad propia del host Windows, por lo que el p95 no se toma como un compromiso de rendimiento de producto.

**Decisión: no distribuir JavaScript compilado por ahora.** La mejora observada no justifica todavía agregar un build, artefactos versionados y una ruta adicional de empaquetado. Se revisará al preparar una publicación npm o si una medición de consumidor instalado muestra una mejora de al menos 15 % de mediana de forma reproducible.

## Validación

- Pruebas de inicio, MCP, capabilities, workflow, planes y artefactos.
- `npm test`.
- `npm run pack:check`.
- `git diff --check`.

El pendiente de CI del smoke test `tests/e2e.test.ts` continúa registrado en el plan de implementación y no forma parte de este recorte.

## Validación manual de carga bajo demanda

Esta verificación está disponible para ejecutar en una sesión fría de `yh-pi`; su resultado todavía debe registrarse para considerar la validación manual cerrada.

1. Ejecutar `/harness-mcp`, `/harness-mcp-history` y `/harness-mcp-settings` con MCP deshabilitado. Los comandos deben responder sin activar tools ni conexiones.
2. Ejecutar `/harness-doctor` y `/harness-changes`. Deben cargar las capabilities de Git, OpenSpec y verificación y conservar sus diagnósticos normales.
3. Crear una tarea `simple`, aceptar su ruta y comprobar que comienza el workflow. Crear una tarea `task`, aprobarla y recuperar el artefacto con `/harness-task-resume` tras reiniciar.
4. Crear una tarea `sdd`, resolver sus gates y ejecutar `/harness-sdd` en un repositorio con OpenSpec configurado.

La primera invocación de cada grupo puede tener una demora única de carga; las siguientes deben reutilizar el módulo en la misma sesión.
