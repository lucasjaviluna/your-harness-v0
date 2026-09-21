# Fase 9 — Plan aprobado para CLI y experiencia TUI

Estado: aprobado para implementación; todavía no implementado.

Este incremento precede a los escenarios de uso y validación descritos en [PHASE_9_USAGE_VALIDATION.md](PHASE_9_USAGE_VALIDATION.md). Su objetivo es que una instalación limpia permita ejecutar `harness` desde la terminal, abrir la TUI de Pi con identidad visual propia y comenzar una solicitud escribiendo un mensaje normal. Los comandos `/harness-*` deben seguir disponibles para quien cargue la extensión en Pi directamente.

## 1. Responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| CLI `bin/harness.js` | Interpretar opciones de arranque, localizar Pi y el package instalado, iniciar la TUI desde el directorio actual, transmitir señales y devolver el código de salida. No decide rutas ni ejecuta tareas. |
| `src/harness-logic.ts` | Recibir la solicitud original, perfil, configuración y estado; evaluar la ruta; producir la siguiente transición o acción de workflow. Reutiliza `assessment.ts`, `task.ts`, `simple.ts`, `openspec.ts` y los artefactos existentes. |
| `extensions/harness.ts` | Adaptar Pi a la lógica compartida: registrar comandos slash, atender `input`, persistir estado en la sesión, delegar trabajos al agente y mostrar decisiones HIL. |
| Capa de presentación de la extensión | Mostrar cabecera, tema, estado y checkpoints en modo TUI; retirar indicadores cuando ya no correspondan. No contiene reglas de negocio. |
| Configuración | Resolver defaults, `.harness/config.json` y opciones de la invocación actual del CLI, sin escribir automáticamente el archivo del proyecto. |

Flujo común:

```text
harness -> TUI de Pi -> mensaje normal -> input -----------+
Pi con extensión -> /harness-work -> comando slash --------+-> harness-logic.ts
                                                            -> tarea, ruta y gates HIL
                                                            -> simple | task | sdd | clarify
```

Pi despacha los comandos de extensión antes del evento `input`. Por eso ambas entradas llamarán a la misma función de ingreso; el handler `input` no reescribirá el texto a `/harness-work ...`. Los mensajes emitidos por la extensión no se procesarán nuevamente.

## 2. Contrato inicial del CLI y distribución

- Declarar `"bin": { "harness": "./bin/harness.js" }` e incluir `bin/` y el tema en `files` del `package.json`.
- El archivo de entrada será JavaScript ejecutable con `#!/usr/bin/env node`. Comandos iniciales: `harness`, `harness --profile <perfil>`, `harness --mode <auto|simple|task|sdd>`, `harness --help` y `harness --version`. El directorio de trabajo será aquel desde el que se invoque el comando.
- Usar Node `>=22.19.0` y una dependencia de Pi con rango acotado y verificado a partir de `0.85.1`, en lugar del peer `*` actual. El CLI resolverá el ejecutable de esa instalación para que una instalación npm del package pueda abrir la TUI sin exigir un `pi` global independiente.
- Iniciar Pi con los recursos del propio package y el tema `harness`, conservar entrada/salida interactiva y propagar señales y código de salida. Los indicadores de arranque serán temporales de la invocación; no modificarán la configuración global de Pi.
- Mantener la distribución por npm con Node como primera vía. Un release compilado con Bun se evaluará después de validar uso e instalación; publicar en npm no forma parte de este incremento.

Una instalación mediante `pi install` carga recursos del package en Pi, pero no crea por sí sola el comando de terminal `harness`. El comando se probará mediante instalación npm desde un tarball local antes de publicarlo.

## 3. Ingreso, rutas y Human-in-the-Middle

- Extraer la lógica del handler `/harness-work` a una entrada compartida: prompt original, modo, perfil, `analyzeOnly`, directorio, configuración y tarea activa. La salida incluirá tarea actualizada, evaluación, acción siguiente y cualquier gate pendiente. El contrato debe impedir duplicados y preservar el texto original.
- En una sesión abierta con `harness`, `input` capturará solicitudes normales, respetará comandos slash y mensajes originados por extensiones, y llevará la ruta elegida al siguiente paso. En Pi abierto directamente, la captura normal será optativa por configuración; los comandos existentes mantendrán su uso explícito.
- `simple` iniciará el workflow directo; `task` continuará tras aprobar objetivo y plan; `sdd` delegará a OpenSpec después de cada autorización o revisión; `clarify` esperará una respuesta y reevaluará. Un gate bloqueante nunca se resolverá por inferencia de un texto ambiguo: la TUI ofrecerá una decisión explícita y `/harness-decide` conservará su función.
- Al reabrir Pi, reconstruir la tarea y presentar el gate de recuperación cuando corresponda. Evitar que un mismo evento o respuesta ejecute dos veces un paso. Si una entrada con imágenes u otro contenido no está soportada por el adaptador, dejarla pasar a Pi con una indicación clara, sin descartarla silenciosamente.
- `developer` seguirá siendo el perfil predeterminado. Añadir un flujo genérico funcional para analistas, producto y marketing que pueda preguntar, planificar, entregar y revisar sin exigir Git, código o tests. Una solicitud no técnica compleja sin OpenSpec se tratará como `task` persistente con plan y revisión HIL, explicando la recomendación.

## 4. Configuración y presentación de la TUI

La precedencia será: defaults internos < `.harness/config.json` < opciones de la invocación actual de `harness`. El CLI activará la captura de mensajes y la apariencia de harness para su sesión; cargar la extensión en Pi directamente mantendrá el comportamiento habitual, salvo configuración explícita del proyecto. El perfil y modo elegidos al lanzar se aplicarán a esa sesión sin sobrescribir el archivo del proyecto.

- Incluir un tema `harness` en el manifest `pi.themes` y seleccionarlo solo para la invocación del CLI.
- En `session_start`, mostrar una cabecera breve con nombre del producto, perfil y modo. Usar `setStatus` para ruta, fase y decisión pendiente; usar un widget temporal para gates HIL y retirarlo al resolverlos.
- Conservar inicialmente el footer nativo de Pi y añadir allí el estado del harness. Reservar un reemplazo completo mediante `setFooter` para una iteración posterior basada en pruebas de uso.
- Activar componentes visuales solo cuando `ctx.mode === "tui"`; en modos print, JSON o RPC conservar salidas y diagnósticos adecuados a esos modos.

## 5. Orden de implementación y validación

1. Refactorizar el ingreso y las transiciones hacia `src/harness-logic.ts`, manteniendo los comandos actuales. Verificar que `/harness-work` siga creando la misma evaluación, tarea y gates.
2. Añadir CLI, manifest, dependencias y tema. Instalar el tarball en un consumidor limpio y comprobar `harness --help`, `--version` y apertura de la TUI desde el directorio consumidor.
3. Incorporar `input` y la continuación automática. Validar equivalencia entre mensaje normal y `/harness-work`, los cuatro destinos `simple`, `task`, `sdd`, `clarify`, y la ausencia de duplicados o saltos de aprobación.
4. Incorporar el flujo genérico para perfiles no técnicos y la presentación TUI. Validar una solicitud sin repositorio Git y un caso complejo que pase a `task` con plan persistente.
5. Ejecutar los escenarios de [PHASE_9_USAGE_VALIDATION.md](PHASE_9_USAGE_VALIDATION.md): Windows/PowerShell y Git Bash, OpenSpec real en consumidor, interrupción y recuperación, reencaminamiento y evaluación por una persona distinta del autor. Registrar fricciones y corregir fallos antes de decidir publicación.

## Criterios de aceptación

- `harness` abre la TUI con el package, tema, cabecera, estado y comandos cargados desde una instalación npm limpia.
- La extensión usada directamente desde Pi conserva los comandos slash y no captura mensajes normales sin configuración explícita.
- Texto normal y `/harness-work` comparten evaluación y estado. Los pasos posteriores avanzan sin exigir comandos manuales innecesarios, respetando todos los gates HIL.
- El flujo genérico entrega un resultado revisable sin requerir repositorio o verificaciones de código.
- La recuperación no duplica una acción ya completada y el artefacto distribuido contiene CLI, extensión, skills y tema.
