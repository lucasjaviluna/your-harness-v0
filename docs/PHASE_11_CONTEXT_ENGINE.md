# Fase 11 — Context Engine local

## Objetivo

Componer contexto de forma incremental y con límites explícitos, en vez de cargar el repositorio completo. Pi continúa siendo el runtime; el Context Engine selecciona y presenta datos locales para los workflows de pi-harness.

## Niveles de divulgación

| Nivel | Fuente | Política de esta fase |
| --- | --- | --- |
| 0 | Solicitud original | Siempre se conserva literalmente. |
| 1 | Metadatos e instrucciones del repositorio | Raíz, Git, archivos principales, contenido de instrucciones `AGENTS.md`/`CLAUDE.md` ya acotado por intake, verificaciones y avisos. |
| 2 | Archivos relevantes y OpenSpec | Se buscan rutas candidatas dentro del repo y specs/cambios OpenSpec, con profundidad y cantidad limitadas; se puntúan por coincidencia del prompt con la ruta. Solo se leen archivos de texto permitidos y seleccionados. |
| 3 | Arquitectura relacionada | README y documentos de arquitectura conocidos; solo cuando la solicitud menciona arquitectura, estructura, diseño, módulos o flujos. |
| 4 | Memoria histórica | Reservado para una fase posterior; no hay búsqueda ni almacenamiento de memoria en esta fase. |

El nivel máximo por workflow se puede reducir; `simple` llega hasta nivel 2 y las rutas que requieren planificación permiten nivel 3. El nivel 3 sigue siendo condicional por relevancia.

## Límites y seguridad

- Presupuesto por defecto de 24.000 caracteres para el snapshot completo.
- Hasta 400 rutas candidatas, profundidad máxima 4 y 8 archivos relevantes seleccionados.
- Solo extensiones de texto conocidas; se excluyen `.git`, `.pi`, `.harness`, `node_modules`, salidas de build, cobertura, vendor y directorios ocultos.
- Se omiten archivos individuales de más de 100 KB y se limitan los extractos.
- Las coincidencias se basan en rutas/nombres, no en una indexación o lectura completa del contenido del repo.
- No se conecta a Memory/RAG, MCP, navegador, Azure DevOps, GitHub ni servicios externos. No se agregan datos al prompt normal de Pi fuera de los workflows de pi-harness.
- El Context Engine no ejecuta comandos ni altera archivos.

## Integración

`prepareHarnessTask` conserva el snapshot junto a la tarea. El prompt del workflow simple incluye sus entradas seleccionadas para que el agente empiece con el contexto relevante, además de mantener la instrucción de inspeccionar y verificar. La vista de revisión del plan puede mostrar las fuentes reunidas; la delegación SDD incluye el snapshot como punto de partida sin reemplazar la inspección propia de OpenSpec. Los artefactos de tarea serializan el snapshot y permiten inspeccionar qué contexto fue usado.

## Criterios de aceptación

- [x] Modelo tipado de niveles, entradas y snapshot con presupuesto y omisiones.
- [x] Composición determinista y ordenada por nivel.
- [x] Recuperación local acotada de rutas relevantes y documentación de arquitectura condicional.
- [x] Integración en preparación de tareas y contexto del workflow simple.
- [x] Pruebas de relevancia, exclusiones, nivel condicional, presupuesto y formato/integración.
- [x] Suite automatizada completa y validación del paquete.

## Fuera de alcance

Memoria/RAG y retrieval histórico, fuentes conversacionales, MCP, integración de documentos externos, Azure/GitHub, indexación semántica/vectorial, ajuste dinámico de políticas y métricas de tokens reales. La validación manual de Fase 9 permanece aplazada.
