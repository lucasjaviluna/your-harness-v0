# Fase 9 — Plan aprobado para CLI y experiencia TUI

Estado: implementación en curso. La lógica común de ingreso y preparación de tareas, el primer CLI funcional, la captura automática de `input`, los gates HIL separados y la identidad visual base de yh-pi en la TUI están completados. La validación de instalación limpia y una iteración visual basada en uso siguen pendientes.

Este incremento precede a los escenarios de uso y validación descritos en [PHASE_9_USAGE_VALIDATION.md](PHASE_9_USAGE_VALIDATION.md). Su objetivo es que una instalación limpia permita ejecutar `yh-pi` desde la terminal, abrir la TUI de Pi con identidad visual propia y comenzar una solicitud escribiendo un mensaje normal. Los comandos `/harness-*` deben seguir disponibles para quien cargue la extensión en Pi directamente.

## 1. Responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| CLI `bin/yh-pi.js` | Interpretar opciones de arranque, localizar Pi y el package instalado, iniciar la TUI desde el directorio actual, transmitir señales y devolver el código de salida. No decide rutas ni ejecuta tareas. |
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

- Declarar `"bin": { "yh-pi": "./bin/yh-pi.js" }` e incluir `bin/` y el tema en `files` del `package.json`.
- El archivo de entrada será JavaScript ejecutable con `#!/usr/bin/env node`. Comandos iniciales: `yh-pi`, `yh-pi --profile <perfil>`, `yh-pi --mode <auto|simple|task|sdd>`, `yh-pi --help` y `yh-pi --version`. El directorio de trabajo será aquel desde el que se invoque el comando.
- Usar Node `>=22.19.0` y una dependencia de Pi con rango acotado y verificado a partir de `0.85.1`, en lugar del peer `*` actual. El CLI resolverá el ejecutable de esa instalación para que una instalación npm del package pueda abrir la TUI sin exigir un `pi` global independiente.
- La implementación actual declara `@earendil-works/pi-coding-agent` como dependencia `^0.85.1`, resuelve su entrypoint con Node y mantiene un fallback al comando `pi` del sistema para desarrollo local sin `node_modules`.
- Las opciones `--profile` y `--mode` se transportan mediante overrides de runtime (`PI_HARNESS_PROFILE` y `PI_HARNESS_MODE`); la precedencia queda defaults internos < configuración de proyecto < overrides de la invocación.
- Iniciar Pi con los recursos del propio package y el tema `harness`, conservar entrada/salida interactiva y propagar señales y código de salida. Los indicadores de arranque serán temporales de la invocación; no modificarán la configuración global de Pi.
- Mantener la distribución por npm con Node como primera vía. Un release compilado con Bun se evaluará después de validar uso e instalación; publicar en npm no forma parte de este incremento.

Una instalación mediante `pi install` carga recursos del package en Pi, pero no crea por sí sola el comando de terminal `yh-pi`. El comando se probará mediante instalación npm desde un tarball local antes de publicarlo.

## 3. Ingreso, rutas y Human-in-the-Middle

- Extraer la lógica del handler `/harness-work` a una entrada compartida: prompt original, modo, perfil, `analyzeOnly`, directorio, configuración y tarea activa. La salida incluirá tarea actualizada, evaluación, acción siguiente y cualquier gate pendiente. El contrato debe impedir duplicados y preservar el texto original.
- En una sesión abierta con `harness`, `input` capturará solicitudes normales, respetará comandos slash y mensajes originados por extensiones, y llevará la ruta elegida al siguiente paso. En Pi abierto directamente, la captura normal será optativa por configuración; los comandos existentes mantendrán su uso explícito.
- La implementación actual activa `captureInput` automáticamente desde `yh-pi` mediante un override de runtime. Los mensajes normales crean la tarea compartida; una ruta `simple` comienza automáticamente, mientras que `task`, `sdd` y `clarify` quedan detenidas en su gate HIL. Los mensajes de extensión, steering y comandos slash pasan sin ser reinterpretados.
- `simple` iniciará el workflow directo; `task` continuará tras aprobar objetivo y plan; `sdd` delegará a OpenSpec después de cada autorización o revisión; `clarify` esperará una respuesta y reevaluará. Un gate bloqueante nunca se resolverá por inferencia de un texto ambiguo: la TUI ofrecerá una decisión explícita y `/harness-decide` conservará su función.
- La aprobación nunca se presentará sin evidencia visible. Antes de autorizar una implementación, la TUI mostrará un resumen del plan y ofrecerá una vista completa navegable. La persona podrá aprobar, modificar o cancelar; los planes largos podrán abrirse también como artefacto Markdown en un editor externo.
- El plan será un contrato versionado (`id`, `version`, objetivo, alcance, pasos, archivos potenciales, verificaciones, riesgos y supuestos). La decisión HIL persistirá la versión aprobada; cualquier modificación invalidará la aprobación anterior y abrirá un nuevo checkpoint.
- Las acciones slash serán compatibilidad avanzada. En el flujo normal de `yh-pi`, botones, diálogos y transiciones internas reemplazarán `/harness-decide`, `/harness-simple` y `/harness-sdd` sin cambiar la lógica de negocio.
- Al reabrir Pi, reconstruir la tarea y presentar el gate de recuperación cuando corresponda. Evitar que un mismo evento o respuesta ejecute dos veces un paso. Si una entrada con imágenes u otro contenido no está soportada por el adaptador, dejarla pasar a Pi con una indicación clara, sin descartarla silenciosamente.
- `developer` seguirá siendo el perfil predeterminado. Añadir un flujo genérico funcional para analistas, producto y marketing que pueda preguntar, planificar, entregar y revisar sin exigir Git, código o tests. Una solicitud no técnica compleja sin OpenSpec se tratará como `task` persistente con plan y revisión HIL, explicando la recomendación.

## 4. Configuración y presentación de la TUI

La precedencia será: defaults internos < `.harness/config.json` < opciones de la invocación actual de `harness`. El CLI activará la captura de mensajes y la apariencia de harness para su sesión; cargar la extensión en Pi directamente mantendrá el comportamiento habitual, salvo configuración explícita del proyecto. El perfil y modo elegidos al lanzar se aplicarán a esa sesión sin sobrescribir el archivo del proyecto.

- Incluir el tema `yh-pi` en el manifest `pi.themes` y seleccionarlo solo para la invocación del CLI. El tema usa texto claro, fondos seleccionados contrastantes y colores visibles en terminales oscuras como Git Bash.
- En `session_start`, mostrar una cabecera breve con nombre del producto, perfil y modo. Usar `setStatus` para ruta, fase y decisión pendiente; usar un widget temporal para gates HIL y retirarlo al resolverlos.
- Para un gate de autorización, usar una interacción en dos niveles: resumen del plan → vista completa opcional → acciones `Aprobar`, `Modificar` o `Cancelar`. La aprobación del plan abre un checkpoint separado para autorizar el inicio de implementación.
- Para revisión final, mostrar resultado, diff o artefactos, verificaciones ejecutadas, verificaciones omitidas y riesgos antes de permitir `Aprobar y cerrar` o `Solicitar cambios`.
- Conservar inicialmente el footer nativo de Pi y añadir allí el estado del harness. Reservar un reemplazo completo mediante `setFooter` para una iteración posterior basada en pruebas de uso.
- Activar componentes visuales solo cuando `ctx.mode === "tui"`; en modos print, JSON o RPC conservar salidas y diagnósticos adecuados a esos modos.

## 5. Orden de implementación y validación

1. Refactorizar el ingreso y las transiciones hacia `src/harness-logic.ts`, manteniendo los comandos actuales. Verificar que `/harness-work` siga creando la misma evaluación, tarea y gates. **Completado.**
2. Añadir CLI, manifest y dependencias. **Completado en código:** `bin/yh-pi.js`, `package.json`, precedencia de configuración y tests de parsing/packaging. Pendiente instalar el tarball en un consumidor limpio y comprobar apertura real de la TUI; el tema se incorpora en el siguiente incremento visual.
3. Incorporar `input` y la continuación automática. **Completado en código:** captura opt-in, protección para slash/extension/steering, creación compartida de tareas y arranque automático de `simple`. Pendiente validar en TUI la equivalencia entre mensaje normal y `/harness-work`, los cuatro destinos y la ausencia de duplicados o saltos de aprobación.
4. Incorporar el flujo genérico para perfiles no técnicos y la presentación TUI. **Ampliado:** implementar el contrato `HarnessPlan`, vista resumida y completa navegable, aprobación versionada, modificación que invalida aprobaciones previas y revisión final con evidencia. Validar una solicitud sin repositorio Git y un caso complejo que pase a `task` con plan persistente.
5. Ejecutar los escenarios de [PHASE_9_USAGE_VALIDATION.md](PHASE_9_USAGE_VALIDATION.md): Windows/PowerShell y Git Bash, OpenSpec real en consumidor, interrupción y recuperación, reencaminamiento y evaluación por una persona distinta del autor. Registrar fricciones y corregir fallos antes de decidir publicación.

## Criterios de aceptación

- `yh-pi` abre la TUI con el package, tema, cabecera, estado y comandos cargados desde una instalación npm limpia.
- La extensión usada directamente desde Pi conserva los comandos slash y no captura mensajes normales sin configuración explícita.
- Texto normal y `/harness-work` comparten evaluación y estado. Los pasos posteriores avanzan sin exigir comandos manuales innecesarios, respetando todos los gates HIL.
- Cada autorización de implementación permite consultar el plan completo antes de decidir; una aprobación queda asociada a una versión concreta del plan.
- El flujo genérico entrega un resultado revisable sin requerir repositorio o verificaciones de código.
- La recuperación no duplica una acción ya completada y el artefacto distribuido contiene CLI, extensión, skills y tema.
