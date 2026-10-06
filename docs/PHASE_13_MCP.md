# Fase 13 — Adaptador MCP opt-in

## Objetivo

Implementar una primera conexión MCP concreta para validar que el registro de capabilities puede comunicarse con herramientas externas sin acoplar el core a un proveedor. Everything se usa como servidor de prueba reproducible; no es un servicio de producción ni queda conectado por defecto.

## Implementación

`McpCapability` (`src/capabilities/mcp.ts`) usa el SDK oficial de TypeScript y transporte local `stdio`. El host entrega una lista explícita de servidores y elige un `serverId` para cada solicitud. La operación abre un proceso MCP, ejecuta una sola acción y lo cierra.

Operaciones expuestas:

- `list_tools` y `call_tool`;
- `list_resources` y `read_resource`;
- `list_prompts` y `get_prompt`.

La capability se registra como `mcp`, pero la disponibilidad es `false` si el host no inyecta servidores. No hay auto-descubrimiento, arranque automático, configuración de servidores del proyecto, llamada implícita a tools ni integración de sus resultados en prompts/workflows existentes. El host debe decidir cómo presentar cada operación a una persona o agente.

## Seguridad y límites

- Solo se inicia el proceso expresamente configurado y seleccionado por `serverId`.
- El transporte hereda el entorno filtrado por el SDK; `env` permite añadir valores explícitos. No se incluyen argumentos ni mensajes originales de error del servidor en los errores públicos.
- El servidor MCP ejecuta código y puede acceder a lo permitido por sus credenciales y proceso. Tratar únicamente con servidores de confianza y limitar credenciales/permisos externamente.
- Everything incluye tools demostrativas con efectos o acceso a datos del proceso, como `get-env`; no invocarla en pruebas. Los tests llaman `echo` y leen un recurso dinámico, sin secretos ni llamadas a servicios externos.
- El adaptador no impone políticas de autorización por tool: la aplicación host debe aprobar/permitir operaciones antes de exponerlas al agente.
- En este incremento se soporta `stdio`; no se agregan conexiones HTTP remotas, OAuth, reintentos, pool persistente, tareas MCP largas, sampling, elicitation ni escritura de recursos.

## Validación reproducible

El paquete de prueba `@modelcontextprotocol/server-everything` es una devDependency. `npm run test:mcp` valida la conexión real por `stdio`, catálogo de tools/resources/prompts, ejecución explícita de `echo`, lectura de un recurso, servidor no configurado y errores sin filtración de detalles. `npm test` también ejecuta estos tests.

Las pruebas no requieren cuenta, token ni acceso de red una vez instaladas las dependencias del proyecto. La licencia y los detalles de protocolo dependen de los paquetes oficiales; validar sus licencias antes de redistribuir el package.

## Criterios de aceptación

- [x] Contrato MCP aislado como capability del registro existente.
- [x] Cliente TypeScript oficial y transporte `stdio`.
- [x] Listado e invocación explícita de tools, prompts y resources.
- [x] MCP permanece inactivo sin servidores provistos por el host.
- [x] El proceso seleccionado se cierra al terminar cada operación.
- [x] Fallos no propagan texto crudo del servidor, argumentos ni entorno.
- [x] Prueba de integración real contra Everything, sin credenciales ni llamadas de escritura/efectos secundarios.
- [x] Documentados confianza, riesgos, restricciones y lo que no se activa.

## Continuación posible

La Fase 14 implementa la UX allowlisted y los gates HIL del agente usando el paquete comunitario `pi-mcp-adapter`. La Fase 13 conserva su alcance como capability autocontenida de validación MCP por stdio.
