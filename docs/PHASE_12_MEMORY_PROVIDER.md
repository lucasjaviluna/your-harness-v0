# Fase 12 — Contrato opcional de memoria

## Objetivo de la fase

Preparar un punto de integración estable para que una solución local o RAG pueda conectarse al Context Engine en el futuro. Esta fase implementa el contrato y la ruta opcional de consulta; **no** elige, instala ni activa un backend.

## Contrato

`src/memory/provider.ts` define:

- `MemoryProvider`: `id`, disponibilidad contextual, `search` y `store`.
- `MemoryProviderContext`: `projectId` explícito y área opcional. El Context Engine no pasa `cwd` ni rutas locales al proveedor.
- `MemoryQuery`: texto, área, máximo de resultados y presupuesto de caracteres.
- `MemoryEntry`: identidad, `projectId`, título, contenido, fuente, tags y score opcional.
- `MemoryWriteRequest`/`MemoryWriteResult`: contrato de escritura futura con `idempotencyKey` opcional y resultado explícito.

Un backend debe filtrar la búsqueda usando el `projectId` del contexto. Además, el harness descarta cualquier resultado cuyo `projectId` no coincida exactamente con el ámbito solicitado.

## Comportamiento hoy

- `ContextEngine()` no instala ni invoca un proveedor de memoria: el nivel 4 permanece desactivado.
- La integración se activa únicamente si el host inyecta un `MemoryProviderBinding` en `prepareHarnessTask`.
- Con una binding explícita, el Context Engine consulta el nivel 4, con hasta 5 resultados y 4.000 caracteres.
- Sin un `projectId` no vacío, no consulta memoria. Si el provider no está disponible o falla, la tarea sigue sin contexto histórico y conserva un aviso diagnóstico acotado.
- `store` es parte del contrato, pero **no se invoca en ningún flujo**. No hay escritura automática ni decisión de qué eventos guardar.
- Los resultados incluyen ID de registro y fuente en el snapshot, que se conserva en la tarea para inspección.
- Cuando se conecte un provider real, sus resultados formarán parte del artefacto local de la tarea; antes de desplegar esa conexión habrá que decidir redacción y retención.

Por lo tanto, instalar esta versión no produce llamadas a red, no requiere credenciales, no guarda recuerdos ni modifica el comportamiento del proyecto. Las pruebas usan proveedores falsos en memoria.

## No incluido

No se implementa proveedor local, RAG/vector store, embedding, chunking, reranking, configuración de credenciales, administración/limpieza de recuerdos ni política de escritura. Tampoco se integra el servicio team-memory usado por el agente de desarrollo: es independiente del runtime del package.

La futura conexión concreta deberá elegir backend y configuración, implementar el contrato, decidir qué contenido puede salir del repositorio, definir retención y deduplicación, y autorizar explícitamente la política de escritura.

## Criterios de aceptación

- [x] Contrato neutral tipado para búsqueda, escritura y resultados.
- [x] Identidad de proyecto explícita; defensa adicional contra resultados fuera del proyecto.
- [x] Adaptador opcional del Context Engine en el nivel 4, respetando límites de cantidad y caracteres.
- [x] Ausencia de provider completamente inactiva y compatible con el comportamiento actual.
- [x] Fallos/no disponibilidad no bloquean el flujo y no exponen detalles internos del backend.
- [x] Ningún workflow llama `store` automáticamente.
- [x] Pruebas con providers falsos y documentación de integración futura.
