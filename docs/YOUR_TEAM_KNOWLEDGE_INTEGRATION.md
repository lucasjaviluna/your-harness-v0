# Your-Team-Knowledge Integration

Estado: primer slice implementado el 2026-10-11; en pausa controlada mientras se cierran los gates del release. El backend sigue desactivado por defecto y la integración SQLite requiere configurar el módulo compilado de `your-team-knowledge`.

## Objetivo

Implementar una extensión nativa de Pi para consumir el sistema de memoria compartida de agentes de [your-team-knowledge](https://github.com/lucasjaviluna/your-team-knowledge), basado en SQLite, reutilizando el contrato provider-neutral de `pi-harness`.

## Progreso implementado

- `HarnessMemoryConfig` agrega configuración segura y defaults desactivados.
- `src/memory/team-knowledge.ts` carga el provider exportado por `your-team-knowledge` sin importar directamente sus tablas SQLite.
- `extensions/team-knowledge.ts` registra `team_knowledge_search` y `team_knowledge_store` cuando Pi ofrece `registerTool`.
- `session_start` prepara el runtime opcional y los workflows usan recall sólo cuando `memory.autoRecall` está habilitado.
- Las escrituras requieren `memory.allowWrites` y aprobación humana por defecto.
- La ausencia del módulo, de la base o del proyecto produce diagnóstico y no bloquea Pi.

La integración se validó localmente dentro de una suite que actualmente tiene 136 pruebas, 134 aprobadas y 2 omitidas; `npm run pack:check` también pasa. Aún no debe considerarse validada en CI ni como parte del candidato publicable hasta repetir esos gates sobre el commit exacto y validar el módulo SQLite distribuible.

## Alcance del plan

### 1. Relevamiento del sistema externo

Antes de escribir código se debe confirmar el esquema SQLite, migraciones, índices, operaciones de búsqueda/escritura, formato de proyecto/área/tags, configuración, concurrencia, dependencias nativas, licencia y si requiere FTS5, embeddings, sqlite-vec u otra extensión.

### 2. Adaptador provider-neutral

Crear `src/memory/team-knowledge-provider.ts` implementando `MemoryProvider` con disponibilidad, búsqueda y escritura. El adaptador debe validar `projectId`, limitar resultados y caracteres, aplicar timeouts y traducir errores a warnings o razones explícitas.

### 3. Extensión nativa de Pi

Crear `extensions/team-knowledge.ts` con carga diferida y dos superficies controladas:

- herramienta de Pi para consultar memoria;
- herramienta de Pi para guardar memoria con aprobación humana.

Comandos iniciales propuestos: `/team-memory`, `/team-memory-search <consulta>` y `/team-memory-save <contenido>`.

### 4. Configuración segura

Agregar una sección `memory` a `.harness/config.json` con provider, ruta de base, `projectId`, área por defecto, activación de recall, permisos de escritura y requerimiento de aprobación.

Reglas iniciales: memoria deshabilitada por defecto, ámbito de proyecto explícito, lecturas acotadas, escrituras con gate humano y prohibición de guardar secretos o prompts completos sin autorización.

### 5. Ciclo de sesión

Si se habilita, `session_start` debe comprobar disponibilidad y cargar un resumen acotado sin bloquear el arranque. La ausencia, corrupción o bloqueo de SQLite debe degradar a un diagnóstico y no romper los workflows `simple`, `task` o `sdd`.

### 6. Recuperación y diagnósticos

Cubrir base inexistente, schema incompatible, migración pendiente, database locked, permisos insuficientes, provider no disponible, resultados vacíos y corrupción de SQLite. Incluir backup, migración y rollback en la documentación operativa.

### 7. Validación

Agregar tests unitarios del provider, aislamiento por proyecto/área, límites de contexto, idempotencia, errores de SQLite, autorización de escritura, carga de la extensión, consumidor instalado y empaquetado del tarball. La compatibilidad SQLite será un gate propio de CI.

### 8. Documentación y release

Actualizar la documentación del provider, configuración, plan de paridad, README, changelog y release candidate con instalación, ubicación de la DB, migraciones, backup, rollback y modo degradado.

## Orden de implementación

1. ~~Relevar el repositorio externo y fijar el contrato.~~
2. ~~Implementar el adaptador provider-neutral.~~
3. ~~Agregar configuración y diagnósticos básicos.~~
4. ~~Integrar recall manual en la extensión Pi.~~
5. Integrar escritura con aprobación humana.
6. Evaluar recall automático acotado en `session_start`.
7. Validar desde tarball y CI.
8. Cerrar documentación y release.

## Decisiones pendientes

- Confirmar si la primera versión tendrá recall manual o automático al iniciar sesión.
- Confirmar si la escritura estará disponible desde la primera versión o inicialmente sólo lectura.
- Elegir la estrategia de acceso SQLite compatible con Node.js `>=22.19.0` y los consumidores soportados.
- Confirmar el conjunto exacto de funciones del repositorio externo que se expondrá a Pi.
- Publicar o distribuir un build consumible de `@corporate-knowledge/platform`; el repositorio externo es actualmente `private` y el loader usa un módulo compilado local o un package instalado.

## Criterio de aceptación

Un consumidor instalado puede consultar memoria del proyecto con límites y aislamiento correctos, guardar una entrada sólo después de aprobación humana, continuar funcionando sin SQLite disponible y pasar la suite local, el smoke e2e y la validación de empaquetado en CI.
