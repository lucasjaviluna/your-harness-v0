# Fase 10 — Sistema mínimo de capabilities

## Objetivo

Evitar que futuras integraciones se acumulen en la extensión y en la lógica de workflows. El harness conserva el control de rutas, estado y decisiones humanas; cada capability encapsula una operación contextual concreta.

Pi sigue siendo el runtime del agente. Este registro interno no es un plugin loader ni una alternativa a las tools de Pi.

## Contrato revisado tras cuatro verticales

`Capability<Request, Result, Context>` declara:

- `id` estable y único dentro del registro;
- `description` breve, visible para inspección y diagnósticos futuros;
- `isAvailable(context)` para indicar si puede utilizarse en ese contexto;
- `execute(request, context)` para realizar una operación de dominio con tipos explícitos.

El contexto común solo requiere `cwd`; cada capability puede declarar un contexto tipado más específico sin obligar a las demás a depender de él. La disponibilidad usa booleanos; los errores y datos detallados pertenecen al resultado de la operación concreta y a los reportes actuales.

`CapabilityRegistry` ofrece registro explícito, `get`, `list` y evaluación de disponibilidad. Rechaza IDs duplicados para evitar que una integración reemplace silenciosamente a otra. No persiste configuración ni descubre paquetes automáticamente.

## Primer vertical: OpenSpec

`OpenSpecCapability` envuelve la detección ya existente: recibe `cwd`, consulta configuración local y comandos/skills de Pi, y devuelve el mismo `OpenSpecDetection` que consumen los workflows actuales. La extensión pide esta operación al registro. La creación de prompts delegados, los pasos `propose/apply/verify/sync/archive` y sus gates HIL conservan su lógica y contratos actuales.

Esto es una migración del punto de entrada, no una reimplementación de OpenSpec ni un cambio de comportamiento.

## Segundo vertical: verificación local

`RepositoryVerificationCapability` encapsula la comparación determinista entre los archivos cambiados y los declarados por el agente. La captura de `git status --short` queda en `GitCapability`; la extensión combina ambas operaciones en el workflow simple.

La capability **no ejecuta** los comandos de test, lint o build del repositorio. Esos comandos siguen siendo seleccionados según el contexto y ejecutados por Pi, fuera de este adaptador. Así se evita otorgar a la registry una vía de ejecución arbitraria o duplicar las decisiones HIL.

La verificación compara datos ya capturados y no depende de que el directorio sea un repositorio Git. Si falta Git, la capability Git lo refleja en el snapshot; el intake del repositorio conserva warnings y puede seguir siendo útil.

## Catálogo de capabilities locales de Fase 10

- `repository`: recopila el contexto de intake (instrucciones, raíz Git si existe, archivos principales y comandos sugeridos). Conserva operación útil en directorios sin Git.
- `git`: captura `git status --short` y entrega el baseline que utiliza la ruta simple y `/harness-changes`.
- `verification`: compara el baseline, el snapshot actual y el reporte del agente para identificar archivos nuevos no reportados. No ejecuta comandos.
- `openspec`: detecta si OpenSpec está configurado y los comandos/skills Pi disponibles.

El catálogo inicial permite identificar cada responsabilidad sin mezclar captura Git con evaluación de cambios. Los contextos específicos de cada clase se mantienen tipados y comparten solo `cwd` como base.

## Límites del primer incremento

- No incluir Memory, RAG, MCP, Azure DevOps, GitHub, navegador ni APIs externas.
- No añadir carga dinámica, dependencias de terceros ni configuración de plugins.
- No introducir todavía un Context Engine, middleware de políticas o subagentes.
- No mover reglas de routing, planes, gates o transiciones de tareas dentro de capabilities.
- No declarar cerrada la Fase 9: la decisión del usuario es posponer sus pruebas manuales hasta que el sistema esté más maduro.

## Criterios de aceptación

- La extensión detecta OpenSpec mediante el registro, no importando directamente su detector.
- El ingreso de tareas y `/harness-doctor` obtienen contexto mediante `RepositoryCapability`.
- Los snapshots del workflow simple y `/harness-changes` pasan por `GitCapability`.
- La respuesta de detección y los workflows OpenSpec existentes permanecen compatibles.
- El workflow simple obtiene snapshots y revisión de archivos mediante `RepositoryVerificationCapability`.
- La capability de verificación no ejecuta comandos arbitrarios del repositorio.
- El registro conserva orden de inserción y rechaza identificadores duplicados.
- La disponibilidad de las capabilities se evalúa por proyecto; Git/OpenSpec inspeccionan recursos locales, sin contactar servicios externos ni ejecutar builds/tests.
- Las pruebas automatizadas cubren registro, disponibilidad, ejecución e integración de las cuatro capabilities locales.

## Próximo incremento

Fase 10 local completada. La siguiente etapa del roadmap es diseñar el Context Engine para componer fuentes progresivamente; sus adaptadores de memoria histórica, RAG, MCP y Azure permanecen en fases posteriores y fuera de este registro inicial.
