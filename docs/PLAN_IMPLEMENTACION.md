# Plan de implementación: harness de desarrollo para Pi

Estado: propuesta para implementar por fases. Ninguna fase está completada.

## 1. Objetivo y alcance

Construir un package instalable de Pi que reciba una solicitud de desarrollo escrita por una persona, inspeccione el repositorio activo, elija una estrategia de trabajo y conduzca la tarea hasta una entrega verificable.

El flujo inicial tiene cuatro salidas: trabajo directo para cambios simples, una tarea ligera persistente para cambios medianos, OpenSpec para cambios formales y aclaración cuando faltan datos para decidir. El usuario puede elegir la ruta manualmente y debe confirmar la recomendación de OpenSpec en la primera versión. El package debe funcionar en distintos repositorios y lenguajes sin asumir un framework, gestor de paquetes o plataforma de tickets.

Quedan fuera de esta versión: Azure DevOps, otros sistemas de tickets, creación automática de ramas o PR, publicación automática, ejecución en CI y captura obligatoria de todos los mensajes normales de Pi. Esas integraciones podrán incorporarse después mediante adaptadores de entrada.

### Principios de diseño

- Una solicitud conserva siempre su texto original; las interpretaciones del agente se guardan aparte.
- La clasificación se basa en evidencia del repositorio y razones visibles, no solo en palabras clave del prompt ni en un puntaje arbitrario.
- Las instrucciones específicas del repositorio (`AGENTS.md`, comandos de prueba, convenciones) tienen prioridad sobre los valores generales del package.
- El package coordina la ruta compleja; OpenSpec conserva la propiedad de sus artefactos y comandos.
- Cada fase produce algo usable por sí mismo y tiene un criterio de cierre observable.
- Los comandos y recursos propios usan el prefijo `harness-` para coexistir con otros packages.
- El package no modifica el comportamiento de los prompts normales de Pi por defecto. Una posible captura automática será una opción futura y explícita.
- SDD/OpenSpec se recomienda cuando aporta valor, pero no se activa automáticamente en la primera versión.
- Una tarea mediana puede tener un único artefacto persistente sin adoptar todos los documentos de OpenSpec.
- La finalización se basa en evidencia de verificación y en un contrato de resultado común para todas las rutas.
- Human-in-the-Middle es una política transversal: la persona aprueba decisiones de alcance, riesgo, arquitectura y cierre, pero no cada acción mecánica.
- El modo de intervención predeterminado será `balanced`: autonomía alta para cambios simples y aprobación explícita para decisiones relevantes o irreversibles.
- Las capacidades adicionales se separan en packages compañeros o adaptadores opcionales.

## 2. Experiencia prevista

Entrada principal:

```text
/harness-work Implementar reintentos para las llamadas HTTP fallidas
/harness-work --mode simple Corregir el texto de este mensaje de error
/harness-work --mode sdd Agregar permisos por rol
/harness-work --analyze-only Diseñar la migración de sesiones
```

`auto` es el modo predeterminado. `--mode simple`, `--mode task` y `--mode sdd` sustituyen la recomendación del clasificador; la falta de datos indispensables sigue pudiendo producir una pregunta. `--analyze-only` muestra la evaluación sin editar archivos.

Secuencia esperada:

```text
prompt → contexto del repositorio → evaluación explicada
  ├─ simple    → implementación directa → verificación → resumen
  ├─ task      → tarea ligera → implementación → evidencia → resumen
  ├─ sdd       → recomendación → confirmación → OpenSpec → verificación → archivo
  └─ ambigua   → preguntas concretas → nueva evaluación
```

La intervención humana se activa por eventos, no por cada edición. Los checkpoints principales son: aclarar información faltante, autorizar un plan o cambio de alcance, revisar una propuesta o resultado y recuperar una tarea interrumpida. Las acciones destructivas, externas o irreversibles requieren autorización siempre.

La respuesta final de cada ruta debe indicar qué cambió, qué se verificó, qué no se pudo verificar y qué decisiones quedaron abiertas.

## 3. Arquitectura objetivo

```text
pi-harness/
├── package.json
├── extensions/
│   └── harness.ts              # registro de comandos y conexión con Pi
├── src/
│   ├── task.ts                 # contratos y transiciones de estado
│   ├── intake.ts               # contexto mínimo del repositorio
│   ├── assessment.ts           # evaluación y política de enrutamiento
│   ├── config.ts               # configuración y validación
│   ├── result.ts               # contrato común de resultados y evidencias
│   └── openspec.ts             # detección y delegación a OpenSpec
├── skills/
│   ├── harness-assess/SKILL.md
│   ├── harness-task/SKILL.md
│   ├── harness-simple/SKILL.md
│   └── harness-sdd/SKILL.md
├── tests/
└── docs/
    └── PLAN_IMPLEMENTACION.md
```

El manifest `pi` declarará solo la extensión y las skills propias. Las dependencias del runtime de Pi importadas por la extensión irán en `peerDependencies`, siguiendo la guía oficial de packages. OpenSpec será una integración de proyecto detectada en tiempo de uso; el package no copiará sus skills ni sus prompts.

### Contratos internos iniciales

```ts
type WorkMode = "auto" | "simple" | "task" | "sdd";
type Route = "simple" | "task" | "sdd" | "clarify";
type Phase = "intake" | "assessing" | "clarifying" | "planning" |
  "awaiting-approval" | "implementing" | "verifying" |
  "awaiting-review" | "blocked" | "done" | "cancelled" | "failed";

type Task = {
  id: string;
  prompt: string;
  cwd: string;
  requestedMode: WorkMode;
  route?: Route;
  phase: Phase;
  createdAt: string;
  assessment?: Assessment;
  openspecChange?: string;
  humanGates: HumanGate[];
};

type Assessment = {
  route: Route;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  affectedAreas: string[];
  unknowns: string[];
  evidence: string[];
};

type WorkResult = {
  status: "completed" | "blocked" | "needs-input" | "failed";
  summary: string;
  artifacts: string[];
  checks: Array<{
    command?: string;
    status: "passed" | "failed" | "skipped";
    evidence: string;
  }>;
  nextStep?: string;
  risks: string[];
};

type HumanGate = {
  id: string;
  kind: "clarify" | "authorize" | "review" | "recover";
  reason: string;
  question: string;
  options?: string[];
  evidence: string[];
  blocksProgress: boolean;
  decision?: {
    value: "approve" | "reject" | "revise" | "cancel" | "answer";
    note?: string;
    decidedAt: string;
  };
};
```

El estado pertenece a la sesión de Pi y se reconstruye desde entradas propias de la extensión. Las tareas de duración media se guardan como `.harness/tasks/<task-name>.md`; los artefactos OpenSpec permanecen en el repositorio en el formato de OpenSpec. No habrá una base de datos adicional para la primera versión.

## 4. Decisiones de diseño incorporadas

- Adoptar tres niveles de trabajo: `simple`, `task` y `sdd`. La ruta `task` cubre el trabajo intermedio que necesita continuidad, pero no una propuesta, especificación, diseño y tareas separados.
- Mostrar una recomendación de ruta y sus razones antes de iniciar SDD. La selección automática podrá ser una configuración posterior.
- Usar un archivo de tarea como punto de recuperación para trabajos medianos. Debe contener objetivo, alcance, restricciones, tareas, evidencia, progreso y próximo paso.
- Mantener al agente principal como responsable de alcance, decisiones y resumen. Los subagentes quedan fuera del MVP.
- Exigir evidencia explícita de verificación: comando, resultado, alcance y verificaciones omitidas.
- Usar un contrato común de resultado con estado, resumen, artefactos, checks, siguiente paso y riesgos.
- Incorporar comandos de operación: `/harness-status`, `/harness-doctor` y `/harness-changes`.
- Separar futuras integraciones como packages compañeros: memoria, Azure DevOps, web, subagentes y revisión avanzada.
- Modelar Human-in-the-Middle como política común mediante gates `clarify`, `authorize`, `review` y `recover`, con decisiones persistidas en la tarea.
- Usar `balanced` como política inicial: no pedir permiso para cada edición de bajo riesgo, pero bloquear decisiones de alcance, arquitectura, acciones destructivas y cierre de tareas complejas.

Estas decisiones adoptan un enfoque ODD, persistencia de tareas, recuperación de estado, evidencia explícita y separación de capacidades opcionales.

## 5. Fases de implementación

### Fase 0 — Contrato de producto y ejemplos de referencia

- [x] Definir una solicitud de ejemplo para cada ruta: simple, task, sdd y ambigua, usando repositorios de prueba pequeños.
- [x] Especificar qué significa `terminado` para una tarea: cambio, verificación y resumen; para análisis, evaluación sin escritura.
- [x] Definir la política Human-in-the-Middle: gates de aclaración, autorización, revisión y recuperación; niveles `conservative`, `balanced` y `autonomous`.
- [x] Definir qué acciones son siempre bloqueantes: destrucción, efectos externos, cambios de alcance, decisiones arquitectónicas y cierre de tareas complejas.
- [x] Fijar la interfaz pública de comandos y las opciones; documentar cómo se pasa un prompt largo o de varias líneas.
- [x] Documentar el contrato `Task`/`Assessment` y las transiciones válidas entre fases.

Entregable: [docs/PHASE_0_CONTRACT.md](PHASE_0_CONTRACT.md), especificación breve de comportamiento con ejemplos de entrada y salida. Cierre: otra persona puede describir el resultado esperado para las cuatro rutas sin interpretar la implementación.

### Fase 1 — Esqueleto instalable del package

- [x] Crear `package.json` con nombre, versión, scripts, palabra clave `pi-package` y manifest `pi`.
- [x] Crear una sola extensión de entrada y registrar `/harness-work` y `/harness-status`.
- [x] Validar argumentos vacíos o desconocidos y mostrar ayuda útil.
- [ ] Añadir comprobación de compatibilidad con la versión de Pi utilizada durante el desarrollo.
- [ ] Probar carga local desde Git Bash en Windows y desde un segundo repositorio, sin depender de archivos de este proyecto.
- [ ] Conservar `.pi/extensions/ask-name.ts` como ejemplo independiente; no incorporarla al package.

Entregable: package instalable localmente que recibe y muestra una solicitud, sin clasificarla ni editar código. Cierre: Pi carga ambos comandos y el package se puede desactivar sin afectar otros recursos.

### Fase 2 — Ingreso de tarea y contexto mínimo

- [ ] Analizar `--mode` y `--analyze-only` sin alterar el texto restante del usuario.
- [ ] Registrar una tarea con identificador, prompt original, directorio y fase inicial.
- [ ] Recoger contexto pertinente: instrucciones del proyecto, archivos principales, estado de Git cuando esté disponible y comandos de verificación documentados.
- [ ] Limitar la lectura inicial a lo necesario; ampliar la exploración según la solicitud.
- [ ] Persistir y reconstruir el estado en la sesión de Pi para que `/harness-status` funcione tras reiniciar o recargar.
- [ ] Distinguir errores recuperables (por ejemplo, repositorio sin Git) de fallos que impiden continuar.

Entregable: objeto de tarea y resumen de contexto reproducibles. Cierre: iniciar una solicitud, recargar Pi y obtener el mismo estado sin duplicar la tarea.

### Fase 3 — Evaluación y elección de ruta

- [ ] Definir señales de complejidad: alcance entre módulos, cambios de contratos o datos, migraciones, seguridad, compatibilidad, decisiones de diseño y dificultad de verificación.
- [ ] Definir señales de simplicidad: alcance local conocido, requisitos claros, cambio reversible y verificación acotada.
- [ ] Implementar la evaluación con salida estructurada y validación de campos; registrar razones y referencias concretas al repositorio.
- [ ] Aplicar reglas explícitas: un cambio de contrato, migración o decisión arquitectónica relevante recomienda `sdd`; un cambio con varias decisiones pero alcance acotado usa `task`; información decisiva ausente lleva a `clarify`; `simple` requiere evidencia suficiente.
- [ ] Permitir anulación manual de la ruta y registrar que provino del usuario.
- [ ] Mostrar la recomendación de `sdd` y pedir confirmación antes de crear artefactos OpenSpec.
- [ ] Persistir cada checkpoint humano, su evidencia, decisión y nota; una tarea en espera no debe poder continuar silenciosamente.
- [ ] Cubrir casos fronterizos: prompt corto con impacto grande, prompt largo con cambio trivial y tareas sin suficiente contexto.

Entregable: recomendación `simple`, `task`, `sdd` o `clarify` visible y justificable. Cierre: los ejemplos de la fase 0 llegan a la ruta esperada y los cambios de criterio se pueden hacer sin modificar la extensión principal.

### Fase 4 — Ruta de tarea ligera

- [ ] Crear `harness-task` para trabajos que requieren continuidad sin la estructura completa de OpenSpec.
- [ ] Generar `.harness/tasks/<task-name>.md` con objetivo, problema, alcance, restricciones, tareas, evidencia, progreso, próximo paso y decisiones aceptadas.
- [ ] Permitir reanudar la tarea leyendo el artefacto y reconstruyendo su fase.
- [ ] Actualizar solo las secciones afectadas, conservando tareas completadas y evidencia válida.
- [ ] Solicitar aprobación del objetivo y del plan antes de implementar; volver a `awaiting-approval` si cambia el alcance.
- [ ] Cerrar la tarea con un resultado común y mantener el archivo como historial breve del cambio.

Entregable: una tarea mediana que puede continuar después de una interrupción. Cierre: el agente puede recuperar el trabajo desde el archivo sin depender del contexto conversacional completo.

### Fase 5 — Ruta simple

- [ ] Crear `harness-simple` con el ciclo: entender, inspeccionar, editar, verificar y resumir.
- [ ] Respetar las instrucciones y herramientas del repositorio actual; no imponer `npm`, un lenguaje o una suite de pruebas universal.
- [ ] Seleccionar verificaciones proporcionales al cambio y documentar el resultado real.
- [ ] Revisar el diff antes de cerrar la tarea y detectar archivos ajenos modificados durante la sesión.
- [ ] Presentar un resumen de cambios y verificaciones para revisión humana antes del cierre cuando el perfil lo requiera.
- [ ] Permitir reencaminar a `sdd` si la implementación descubre un impacto mayor al previsto.
- [ ] Definir salida de fallo: causa concreta, estado de los archivos y siguiente paso posible.

Entregable: ejecución completa de una tarea pequeña sin artefactos SDD. Cierre: el ejemplo simple produce un cambio verificable y un resumen fiel a la evidencia.

### Fase 6 — Ruta compleja con OpenSpec

- [ ] Detectar si el repositorio tiene OpenSpec configurado para Pi; si falta, mostrar el requisito y el comando de inicialización sin modificar el proyecto automáticamente.
- [ ] Detectar los prompts/skills generados por OpenSpec y su procedencia antes de invocarlos; en Pi, los prompts se llaman `/opsx-propose`, `/opsx-apply`, etc.
- [ ] Crear el adaptador que pasa el prompt y el contexto de la tarea a `propose` sin duplicar la lógica de OpenSpec.
- [ ] Detenerse después de la recomendación hasta que el usuario confirme la creación de artefactos SDD.
- [ ] Asociar el nombre del change de OpenSpec al estado de la tarea.
- [ ] Presentar propuesta, especificaciones, diseño y tareas para revisión antes de `apply`.
- [ ] Requerir autorización explícita para `apply`, cambios de alcance y archivo del change.
- [ ] Reanudar la tarea tras ajustes de artefactos; ejecutar `apply`, verificar el resultado, sincronizar specs cuando corresponda y archivar solo al terminar.
- [ ] Manejar comandos ausentes, cambios incompletos y fallos de verificación con un estado recuperable.

Entregable: una tarea compleja ejecutada a través de OpenSpec en un repositorio de prueba. Cierre: los artefactos viven bajo `openspec/`, se pueden inspeccionar con OpenSpec y el harness muestra en qué paso quedó la tarea.

### Fase 7 — Convivencia, configuración y recuperación

- [ ] Añadir configuración validada para modo predeterminado, reglas de enrutamiento y nivel de intervención del usuario.
- [ ] Implementar la política HIL y sus transiciones `awaiting-approval`, `awaiting-review`, `blocked` y `cancelled`.
- [ ] Definir precedencia entre valores del package y configuración del proyecto; documentarla con ejemplos.
- [ ] Asegurar nombres propios para comandos, tipos de entradas y skills; no reemplazar herramientas nativas de Pi.
- [ ] Probar convivencia con otro package que registre comandos y con OpenSpec instalado en el mismo proyecto.
- [ ] Probar reanudación tras reinicio, cancelación durante evaluación e interrupción durante `apply`.
- [ ] Evitar respuestas repetidas o cambios dobles cuando se recibe el mismo comando dos veces.
- [ ] Implementar `/harness-status`, `/harness-doctor` y `/harness-changes` con salidas legibles.
- [ ] Verificar que los artefactos de tarea y OpenSpec sean suficientes para recuperar el trabajo.
- [ ] Probar rechazo, revisión, cancelación, reanudación y decisiones repetidas en cada tipo de gate.

Entregable: comportamiento estable en sesiones largas y entornos con otros packages. Cierre: los casos de interrupción terminan en un estado entendible y se pueden continuar sin recrear trabajo completado.

### Fase 8 — Validación y distribución

- [ ] Añadir pruebas de la política de clasificación y de las transiciones de estado; concentrarlas en errores que tendrían impacto real.
- [ ] Ejecutar pruebas de extremo a extremo en al menos dos repositorios de ejemplo y en Windows con Git Bash.
- [ ] Verificar el contenido distribuido y que la instalación local, por Git y por npm cargue los mismos recursos.
- [ ] Documentar instalación, requisitos de OpenSpec, comandos, configuración, desinstalación y resolución de problemas.
- [ ] Publicar una versión inicial con notas de cambios solo después de revisar los ejemplos de las fases anteriores.

Entregable: package versionado e instalable por otros desarrolladores. Cierre: una persona nueva puede instalarlo, ejecutar una tarea simple y una compleja, y entender cómo recuperarse de un fallo usando solo el README.

## 6. Orden de entrega recomendado

1. MVP operativo: fases 0 a 5. Permite validar la entrada, el estado, la evaluación, la ruta simple y la tarea ligera.
2. SDD: fase 6. Se integra OpenSpec cuando el núcleo ya puede sostener una tarea.
3. Endurecimiento y distribución: fases 7 y 8.

Cada fase se puede implementar en una rama o PR independiente. Al cerrarla, actualizar las casillas, registrar decisiones que afecten fases posteriores y comprobar los criterios de cierre antes de avanzar.

## 7. Fuera del MVP de pi-harness

Estas capacidades pueden ser valiosas, pero no son necesarias para validar el flujo principal y deben permanecer fuera de las primeras fases:

- Integración con Azure DevOps u otros sistemas de tickets.
- Creación automática de ramas, commits, PRs o releases.
- Subagentes, comunicación entre sesiones y coordinación distribuida.
- Memoria persistente externa o sincronización con servicios como Engram.
- Panel fullscreen, dashboard de cambios o UI propia de workspace.
- Monitoreo de consumo, perfiles avanzados de modelos y selección dinámica por proveedor.
- Telemetría, métricas de uso y envío de datos fuera del repositorio.
- Integración web, búsqueda externa y acceso a APIs de terceros.
- Revisión avanzada de PRs, RDD y gates especializados de publicación.
- TDD estricto configurable por proyecto y captura detallada RED/GREEN/REFACTOR.
- Registro global de todas las skills, resolución avanzada de duplicados y marketplace propio.
- Instaladores o binarios independientes de Pi.
- Automatización completa de SDD sin confirmación humana.
- Automatización completamente autónoma como comportamiento predeterminado; la intervención humana seguirá siendo obligatoria para acciones de alto riesgo.

La regla de salida del MVP es que una persona pueda iniciar una tarea desde un prompt, recibir una recomendación, completar una tarea simple o ligera y recuperar su estado. OpenSpec puede integrarse después sin rediseñar esos contratos.

## 8. Decisiones pendientes antes de implementarlas

- Nombre definitivo del package y ámbito npm, si se publicará.
- Nivel de automatización tras la propuesta OpenSpec: revisión manual obligatoria en la primera versión; opción configurable más adelante.
- Nombre definitivo para la ruta intermedia (`task`, `odd` o `work-item`).
- Formato y ubicación de la configuración del proyecto.
- Compatibilidad mínima de versiones de Pi y OpenSpec, fijada con pruebas de instalación reales.
- Necesidad futura de admitir prompts normales sin `/harness-work`; si se añade, debe ser una opción explícita por proyecto.

## 9. Fuentes de referencia

- Pi packages: https://pi.dev/docs/latest/packages
- Pi extensions: https://pi.dev/docs/latest/extensions
- Pi skills: https://pi.dev/docs/latest/skills
- Pi prompt templates: https://pi.dev/docs/latest/prompt-templates
- OpenSpec, soporte de Pi: https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md
- OpenSpec, comandos: https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md
