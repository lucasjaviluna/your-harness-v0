# Fase 9 — Uso y validación operativa

## Objetivo

Validar pi-harness como herramienta de uso real antes de ampliar su alcance con integraciones externas. La fase busca descubrir problemas de experiencia, recuperación, routing, gates HIL y documentación que no aparecen únicamente en pruebas unitarias o de packaging.

## Alcance

Incluye instalación desde el package en repositorios consumidores, tareas `simple`, `task`, `sdd` y `clarify`, revisión humana, recuperación, integración real con OpenSpec y evaluación de la experiencia de una persona nueva usando solo el README.

No incluye Azure DevOps, publicación npm obligatoria, ramas o pull requests automáticos, subagentes ni nuevas integraciones externas.

## Escenarios mínimos

### 1. Tarea simple

Comprobar recomendación `simple`, revisión del diff, verificaciones proporcionales, gate HIL de revisión y resumen fiel de archivos y checks.

### 2. Tarea ligera

Comprobar creación de `.harness/tasks/<id>.md`, aprobación de objetivo y plan, actualización de progreso y evidencia, interrupción, reanudación y cierre con resultado común.

### 3. Tarea compleja con OpenSpec

Comprobar recomendación explicada de `sdd`, autorización antes de crear el change, revisión de propuesta antes de `apply`, revisión antes de `sync` y `archive`, asociación con la tarea del harness y recuperación si el flujo queda incompleto.

### 4. Solicitud ambigua

Comprobar que el harness pregunta antes de editar y que la nueva información permite reevaluar la ruta.

### 5. Reencaminamiento

Comprobar que una tarea inicialmente simple puede pasar a `task` o `sdd` sin perder el prompt original, el contexto ni las decisiones HIL.

## Registro de cada escenario

Para cada ejecución documentar repositorio y commit inicial, prompt, modo y ruta, decisiones HIL, archivos y artefactos, verificaciones, interrupciones, resultado y fricción observada por el usuario.

## Criterios de cierre

- Los cuatro flujos principales son ejecutables por una persona nueva.
- El flujo SDD real fue probado con OpenSpec en un consumidor.
- Una interrupción no obliga a reiniciar el trabajo desde cero.
- Los mensajes HIL explican claramente qué se solicita y por qué.
- No existen fallos críticos de pérdida de estado, edición no autorizada o cierre sin evidencia.
- Las incidencias restantes están documentadas y priorizadas.
- Al menos una evaluación fue realizada por alguien distinto del autor.

## Decisión de alcance

Azure DevOps y otras integraciones externas se mantienen fuera de esta fase. Solo se reconsiderarán después de validar que el flujo basado en prompt, contexto local, routing, HIL, implementación y verificación aporta valor de forma consistente.

## Resultado de la validación automatizada

Última ejecución en Windows:

- `npm run pack:check`: correcto; el tarball contiene el CLI, la extensión, el core, las skills y la documentación.
- `node bin/yh-pi.js --help`: correcto.
- `node bin/yh-pi.js --version`: correcto.
- Pruebas unitarias y de routing: correctas.
- Instalación del tarball en consumidor: pendiente; la resolución de dependencias no terminó dentro del límite de 30 segundos y el escenario queda marcado como `skip` para evitar bloquear la suite.
- Git Bash: pendiente; el entorno de validación no expone `pi` en su `PATH`.

La validación manual pendiente debe ejecutarse desde un entorno donde Pi esté instalado y pueda abrir una TUI. Allí se probarán los flujos `simple`, `task`, `sdd`, `clarify`, la recuperación y los checkpoints HIL.
