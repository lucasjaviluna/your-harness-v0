# Fase 14 — Integración MCP mediante pi-mcp-adapter

## Decisión de proveedor

Se adopta `pi-mcp-adapter` como runtime MCP recomendado para Pi, en lugar de mantener un segundo ciclo de vida de conexiones en pi-harness. Al 2026-10-06 el repositorio del proyecto mostraba aproximadamente 1,6 mil estrellas y npm mostraba cientos de miles de descargas semanales; ambas señales son volátiles. El paquete se distribuye bajo MIT y mantiene integración específica con Pi.

- [Repositorio y documentación de pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)
- [Paquete pi-mcp-adapter en npm](https://www.npmjs.com/package/pi-mcp-adapter)

pi-harness consume el API público cross-extension de `pi-mcp-adapter` (`pi-mcp-adapter:runtime-tool-call:v1`), sin importar su implementación privada ni duplicar su conexión MCP, gestión OAuth, credenciales, transporte o ciclo de vida. El adapter se instala por separado en Pi con `pi install npm:pi-mcp-adapter`; no se instala ni activa automáticamente como dependencia de pi-harness.

## Comportamiento

- MCP está apagado por defecto y la allowlist empieza vacía.
- Al activar MCP con una allowlist no vacía, pi-harness registra la tool del agente `harness_mcp`.
- La allowlist limita cada par servidor/tool. Las definiciones de servidor y credenciales permanecen en la configuración de `pi-mcp-adapter`; `.harness/config.json` no acepta secretos ni comandos de servidores.
- La política de aprobación se configura en `.harness/config.json`: `always` muestra servidor, tool y argumentos en una confirmación HIL de una sola llamada y falla si no hay UI; `automatic` delega sin esa confirmación. El default es `always` y cada entrada de allowlist puede reemplazarlo.
- La llamada se delega al API público del adapter, que conserva sus reglas de aprobación, trust, configuración, conexión y validación de salida.
- Mientras la integración de yh-pi está habilitada, se bloquea el proxy MCP directo y las tools del adapter para impedir saltarse la allowlist y el gate de yh-pi.
- Se escribe una entrada de auditoría en la sesión con servidor, tool, decisión y fecha; no se persisten argumentos ni resultados.
- `/harness-mcp` muestra si el adapter fue detectado, cada servidor publicado por el adapter, su estado y cantidad de tools, más la allowlist configurada por yh-pi. `/harness-mcp-settings` edita la política y la allowlist desde la TUI. `/harness-doctor` incluye enabled/disabled y cantidad de tools permitidas.
- `/harness-mcp-history` muestra las últimas llamadas de la sesión: servidor, tool, aprobación humana/automática, resultado y duración cuando se pudo medir. No muestra argumentos ni contenido devuelto. Un resultado `unknown` significa que el adapter no confirmó el resultado; la persona debe comprobar el efecto antes de reintentar.

## Configuración

```json
{
  "mcp": {
    "enabled": true,
    "defaultApproval": "always",
    "allowlist": [
      { "server": "github", "tools": ["search_issues", "get_issue"], "approval": "automatic" },
      { "server": "github", "tools": ["create_issue"], "approval": "always" }
    ]
  }
}
```

`server` coincide con el nombre de servidor configurado en `pi-mcp-adapter`. `tools` es una lista exacta de nombres MCP. `defaultApproval` y `approval` aceptan `always` o `automatic`; el segundo permite omitir el gate de yh-pi para esa entrada. La configuración por sí sola no conecta al servidor: también debe estar cargado y configurado el adapter.

## Límites

- No modifica ni importa automáticamente configuraciones de Cursor, Codex, Claude Code o Pi; ese trabajo queda a `/mcp-adapter setup`.
- No administra servidores, OAuth ni secretos. Esas funciones pertenecen al adapter.
- No permite llamadas a tools fuera de la allowlist desde yh-pi mientras MCP está habilitado.
- Los recursos y prompts MCP siguen disponibles desde el adapter, pero la tool `harness_mcp` solo delega tools.
- La capability MCP de Fase 13 sigue como cliente stdio autocontenido para validar el protocolo; los flujos del agente usan `pi-mcp-adapter`.
- La instalación del adapter y la configuración de servidores son optativas; sin ellas, pi-harness conserva el comportamiento anterior.

## Criterios de aceptación

- La integración del agente delega al adapter comunitario por su API pública, sin construir otro cliente MCP en paralelo.
- MCP no se activa por defecto ni inicia procesos si no está configurado.
- El agente solo puede invocar pares servidor/tool incluidos en la allowlist de yh-pi.
- La política predeterminada exige una aprobación HIL por llamada y falla de forma cerrada sin UI; el usuario puede configurar excepciones `automatic` por entrada allowlisted.
- Las llamadas directas al adapter no pueden evitar el control de yh-pi cuando la integración está activada.
- La auditoría registra la decisión sin conservar argumentos, credenciales o salida del servidor.
- La documentación distingue claramente configuración de yh-pi de configuración/credenciales del adapter.
