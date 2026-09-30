# Fase 10 — Sistema mínimo de capabilities

## Objetivo

Evitar que futuras integraciones se acumulen en la extensión y en la lógica de workflows. El harness conserva el control de rutas, estado y decisiones humanas; cada capability encapsula una operación contextual concreta.

Pi sigue siendo el runtime del agente. Este registro interno no es un plugin loader ni una alternativa a las tools de Pi.

## Contrato inicial

`Capability<Request, Result, Context>` declara:

- `id` estable y único dentro del registro;
- `description` breve, visible para inspección y diagnósticos futuros;
- `isAvailable(context)` para indicar si puede utilizarse en ese contexto;
- `execute(request, context)` para realizar una operación de dominio con tipos explícitos.

El contexto común inicial solo requiere `cwd`. La disponibilidad usa booleanos; los errores y datos detallados pertenecen al resultado de la operación concreta y a los reportes actuales.

`CapabilityRegistry` ofrece registro explícito, `get`, `list` y evaluación de disponibilidad. Rechaza IDs duplicados para evitar que una integración reemplace silenciosamente a otra. No persiste configuración ni descubre paquetes automáticamente.

## Primer vertical: OpenSpec

`OpenSpecCapability` envuelve la detección ya existente: recibe `cwd`, consulta configuración local y comandos/skills de Pi, y devuelve el mismo `OpenSpecDetection` que consumen los workflows actuales. La extensión pide esta operación al registro. La creación de prompts delegados, los pasos `propose/apply/verify/sync/archive` y sus gates HIL conservan su lógica y contratos actuales.

Esto es una migración del punto de entrada, no una reimplementación de OpenSpec ni un cambio de comportamiento.

## Segundo vertical: verificación local

`RepositoryVerificationCapability` encapsula dos operaciones deterministas existentes: capturar `git status --short` como baseline/snapshot y comparar los archivos cambiados con los declarados por el agente. La extensión usa estas operaciones en el workflow simple y en el diagnóstico de cambios.

La capability **no ejecuta** los comandos de test, lint o build del repositorio. Esos comandos siguen siendo seleccionados según el contexto y ejecutados por Pi, fuera de este adaptador. Así se evita otorgar a la registry una vía de ejecución arbitraria o duplicar las decisiones HIL.

Su disponibilidad es local al repo: informa `true` si puede obtener un snapshot Git; en un directorio sin Git informa `false` y mantiene el resultado de snapshot con el error observable.

## Límites del primer incremento

- No incluir Memory, RAG, MCP, Azure DevOps, GitHub, navegador ni APIs externas.
- No añadir carga dinámica, dependencias de terceros ni configuración de plugins.
- No introducir todavía un Context Engine, middleware de políticas o subagentes.
- No mover reglas de routing, planes, gates o transiciones de tareas dentro de capabilities.
- No declarar cerrada la Fase 9: la decisión del usuario es posponer sus pruebas manuales hasta que el sistema esté más maduro.

## Criterios de aceptación

- La extensión detecta OpenSpec mediante el registro, no importando directamente su detector.
- La respuesta de detección y los workflows OpenSpec existentes permanecen compatibles.
- El workflow simple obtiene snapshots y revisión de archivos mediante `RepositoryVerificationCapability`.
- La capability de verificación no ejecuta comandos arbitrarios del repositorio.
- El registro conserva orden de inserción y rechaza identificadores duplicados.
- La disponibilidad de ambas capabilities se evalúa por proyecto; el diagnóstico no contacta servicios externos ni ejecuta builds/tests.
- Las pruebas automatizadas cubren registro, disponibilidad y ejecución de los dos verticales.

## Próximo incremento

Revisar el contrato con la experiencia de ambos verticales. Decidir si hace falta enriquecer el contexto común o mantener contextos especializados; antes de migrar un tercer caso, evitar extrapolar interfaces más allá de necesidades reales. No adelantar Memory/MCP.
