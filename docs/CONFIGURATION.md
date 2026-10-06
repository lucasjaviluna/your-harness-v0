# Configuración de pi-harness

La configuración del proyecto es opcional y vive en:

```text
.harness/config.json
```

La precedencia es:

```text
defaults internos < configuración del proyecto < overrides de la sesión `yh-pi`
```

Los valores inválidos no detienen Pi: se ignoran, se conserva el default y `/harness-doctor` muestra una advertencia.

## Ejemplo

```json
{
  "defaultMode": "auto",
  "profile": "developer",
  "captureInput": false,
  "hil": {
    "requireApproval": true,
    "requireReview": true,
    "recoverInterrupted": true
  },
  "routing": {
    "allowManualOverride": true,
    "allowRerouteToSdd": true
  },
  "mcp": {
    "enabled": false,
    "defaultApproval": "always",
    "allowlist": []
  }
}
```

`captureInput` habilita que los mensajes normales de la TUI entren automáticamente al router de pi-harness. Es `false` por default cuando se carga la extensión directamente en Pi; `yh-pi` lo activa solo para esa sesión. `--profile` y `--mode` también son overrides temporales y no modifican este archivo.

`requireApproval: false` solo puede omitir la aprobación inicial de una tarea `task`; nunca elimina las autorizaciones de SDD ni los gates de cambios de alcance. `requireReview: false` permite cerrar automáticamente la ruta simple, por lo que debe reservarse para repositorios o perfiles con una política explícita de confianza.

## MCP optativo

La integración MCP de yh-pi usa el paquete comunitario [pi-mcp-adapter](https://www.npmjs.com/package/pi-mcp-adapter), que debes instalar por separado en Pi (`pi install npm:pi-mcp-adapter`) y configurar con `/mcp-adapter setup`. En `.harness/config.json`, activa `mcp.enabled` y declara una allowlist exacta de nombres de servidor y tools. Sin allowlist, el modelo no recibe `harness_mcp`. Los servidores y secretos quedan en la configuración/gestión de credenciales del adapter, nunca en `.harness/config.json`.

```json
"mcp": {
  "enabled": true,
  "defaultApproval": "always",
  "allowlist": [
    { "server": "github", "tools": ["search_issues", "get_issue"], "approval": "automatic" },
    { "server": "github", "tools": ["create_issue"], "approval": "always" }
  ]
}
```

`defaultApproval` admite `"always"` y `"automatic"`; el default es `"always"`. Cada entrada de la allowlist puede declarar `approval` para reemplazarlo. `always` muestra una confirmación HIL por llamada y falla si no hay UI. `automatic` delega sin confirmación de yh-pi, incluso en modo sin UI, pero `pi-mcp-adapter` conserva su propia política de trust y aprobación. Configura `automatic` solo para pares servidor/tool que el usuario considere seguros.

Usa `/harness-mcp` para consultar el estado del adapter, cada servidor detectado, su estado de conexión, cantidad de tools detectadas y las tools habilitadas por yh-pi en la allowlist. El adapter publica esos datos sin conectar servidores lazy ni exponer credenciales. Cuando la integración esté habilitada, yh-pi bloquea las llamadas MCP directas que evitarían la allowlist y la política configurada.

### Editar desde la TUI

Usa `/harness-mcp-settings` para cambiar MCP sin editar JSON: permite activar o desactivar MCP, elegir la política default, añadir, editar o eliminar entradas allowlisted y guardar el resultado. Cada entrada muestra servidor, tools y política efectiva; se puede renombrar el servidor, cambiar sus tools o su política. El comando preserva los demás settings de `.harness/config.json`, aplica el cambio en la sesión actual y bloquea la activación si no hay tools permitidas.

## Diagnóstico

```text
/harness-doctor
/harness-changes
```

`/harness-doctor` muestra la configuración efectiva, compatibilidad de Pi, Git, instrucciones del repositorio y OpenSpec. `/harness-changes` muestra archivos Git modificados y changes OpenSpec activos.
