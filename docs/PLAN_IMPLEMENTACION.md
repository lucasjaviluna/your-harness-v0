# Plan de implementación: harness de desarrollo para Pi

Estado: fases 0 a 16 completadas en el alcance documentado. La Fase 9 fue validada manualmente y está completa. El recorte de carga de arranque posterior a la Fase 16 está completado; el smoke test obligatorio de CI sigue pendiente. La publicación npm continúa pendiente de decisión y autorización explícitas.

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
- El core es agnóstico del perfil de usuario; `developer` es el perfil default del MVP.
- La ruta se decide por intención, complejidad, riesgo y contexto, no por el rol profesional de quien inicia la tarea.
- Los perfiles especializados adaptan lenguaje, preguntas HIL, criterios de éxito y formatos de salida sin duplicar el motor de workflow.

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
│   ├── profile.ts              # perfil, intención y capacidades de salida
│   ├── work-context.ts         # fuentes de contexto normalizadas
│   ├── config.ts               # configuración y validación
│   ├── result.ts               # contrato común de resultados y evidencias
│   └── openspec.ts             # detección y delegación a OpenSpec
├── skills/
│   ├── harness-assess/SKILL.md
│   ├── harness-task/SKILL.md
│   ├── harness-simple/SKILL.md
│   └── harness-sdd/SKILL.md
├── profiles/
│   └── developer.ts            # perfil default del MVP
├── adapters/
│   ├── repository.ts
│   └── documents.ts            # fuentes futuras
├── tests/
└── docs/
    └── PLAN_IMPLEMENTACION.md
```

El manifest `pi` declarará solo la extensión y las skills propias. Las dependencias del runtime de Pi importadas por la extensión irán en `peerDependencies`, siguiendo la guía oficial de packages. OpenSpec será una integración de proyecto detectada en tiempo de uso; el package no copiará sus skills ni sus prompts.

### Contratos internos iniciales

```ts
type WorkMode = "auto" | "simple" | "task" | "sdd";
type Route = "simple" | "task" | "sdd" | "clarify";
type UserProfile = "developer" | "functional-analyst" | "product-owner" | "marketing" | "custom";
type WorkIntent = "understand" | "analyze" | "define" | "plan" | "create" | "implement" | "review" | "decide";
type ContextSource = "prompt" | "repository" | "document" | "conversation" | "external-system";
type Phase = "intake" | "assessing" | "clarifying" | "planning" |
  "awaiting-approval" | "implementing" | "verifying" |
  "awaiting-review" | "blocked" | "done" | "cancelled" | "failed";

type Task = {
  id: string;
  prompt: string;
  profile: UserProfile;
  intent?: WorkIntent;
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
  profile: UserProfile;
  intent: WorkIntent;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  affectedAreas: string[];
  unknowns: string[];
  evidence: string[];
};

type WorkResult = {
  profile: UserProfile;
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

### Perfiles y especialización

El core debe poder recibir solicitudes de distintos perfiles, aunque el MVP use `developer` por defecto. El perfil aporta configuración, no una nueva máquina de estados:

- `developer`: cambios de código, tests, revisión de diff y verificación del repositorio.
- `functional-analyst`: análisis de comportamiento, reglas de negocio, escenarios y trazabilidad.
- `product-owner`: definición de alcance, historias, criterios de aceptación, prioridades y decisiones.
- `marketing`: briefs, mensajes, variantes, restricciones de marca y revisión de contenido.
- `custom`: configuración declarativa para otros roles.

En todos los casos, el flujo común conserva prompt original, evaluación, gates, evidencia y resultado. Solo cambian los adaptadores de contexto, el vocabulario de interacción y los formatos de entrega. El primer incremento implementará únicamente el perfil `developer`, pero probará que los contratos no requieran repositorio, código ni comandos de verificación como condición universal.

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
- [x] Decidir que el core será agnóstico del perfil y que `developer` será el perfil default del MVP.
- [x] Separar conceptualmente perfil, intención, fuente de contexto y formato de resultado.

Entregable: [docs/PHASE_0_CONTRACT.md](PHASE_0_CONTRACT.md), especificación breve de comportamiento con ejemplos de entrada y salida. Cierre: otra persona puede describir el resultado esperado para las cuatro rutas sin interpretar la implementación.

### Fase 1 — Esqueleto instalable del package

- [x] Crear `package.json` con nombre, versión, scripts, palabra clave `pi-package` y manifest `pi`.
- [x] Crear una sola extensión de entrada y registrar `/harness-work` y `/harness-status`.
- [x] Validar argumentos vacíos o desconocidos y mostrar ayuda útil.
- [x] Añadir comprobación de compatibilidad con la API de Pi utilizada durante el desarrollo.
- [x] Probar carga local desde Git Bash en Windows, sin depender de archivos de este proyecto.
- [x] Probar instalación y carga desde un segundo repositorio consumidor.
- [x] Conservar `.pi/extensions/ask-name.ts` como ejemplo independiente; no incorporarla al package.

Entregable: package instalable localmente que recibe y muestra una solicitud, sin clasificarla ni editar código. Cierre: Pi carga ambos comandos y el package se puede desactivar sin afectar otros recursos.

### Fase 2 — Ingreso de tarea y contexto mínimo

- [x] Analizar `--mode` y `--analyze-only` sin alterar el texto restante del usuario.
- [x] Registrar una tarea con identificador, prompt original, directorio y fase inicial.
- [x] Recoger contexto pertinente: instrucciones del proyecto, archivos principales, estado de Git cuando esté disponible y comandos de verificación documentados.
- [x] Limitar la lectura inicial a lo necesario; ampliar la exploración según la solicitud.
- [x] Persistir y reconstruir el estado en una sesión interactiva de Pi tras reiniciar o recargar.
- [x] Distinguir errores recuperables (por ejemplo, repositorio sin Git) de fallos que impiden continuar.
- [ ] Evitar que la ausencia de repositorio, Git o comandos de verificación se trate como error para perfiles no técnicos.

Entregable: [docs/PHASE_2_INTAKE.md](PHASE_2_INTAKE.md), objeto de tarea y resumen de contexto reproducibles. Cierre pendiente: iniciar una solicitud en una sesión interactiva, recargar Pi y obtener el mismo estado sin duplicar la tarea.

### Fase 3 — Evaluación y elección de ruta

- [x] Definir señales de complejidad: alcance entre módulos, cambios de contratos o datos, migraciones, seguridad, compatibilidad, decisiones de diseño y dificultad de verificación.
- [x] Definir señales de simplicidad: alcance local conocido, requisitos claros, cambio reversible y verificación acotada.
- [x] Implementar la evaluación con salida estructurada y validación de campos; registrar razones y referencias concretas al repositorio.
- [x] Aplicar reglas explícitas: un cambio de contrato, migración o decisión arquitectónica relevante recomienda `sdd`; un cambio con varias decisiones pero alcance acotado usa `task`; información decisiva ausente lleva a `clarify`; `simple` requiere evidencia suficiente.
- [x] Permitir anulación manual de la ruta y registrar que provino del usuario.
- [x] Mostrar la recomendación de `sdd` y pedir confirmación antes de crear artefactos OpenSpec.
- [x] Persistir cada checkpoint humano, su evidencia, decisión y nota; una tarea en espera no debe poder continuar silenciosamente.
- [x] Cubrir casos fronterizos: prompt corto con impacto grande, prompt largo con cambio trivial y tareas sin suficiente contexto.
- [x] Evaluar complejidad por intención y riesgo, manteniendo el mismo motor para perfiles técnicos y no técnicos.
- [x] Definir el contrato del perfil default `developer` y puntos de extensión para perfiles funcionales, de producto y marketing.

Entregable: [docs/PHASE_3_ASSESSMENT.md](PHASE_3_ASSESSMENT.md), recomendación `simple`, `task`, `sdd` o `clarify` visible y justificable. Cierre: los ejemplos de la fase 0 llegan a la ruta esperada y los cambios de criterio se pueden hacer sin modificar la extensión principal.

### Fase 4 — Ruta de tarea ligera

- [x] Crear `harness-task` para trabajos que requieren continuidad sin la estructura completa de OpenSpec.
- [x] Generar `.harness/tasks/<task-name>.md` con objetivo, problema, alcance, restricciones, tareas, evidencia, progreso, próximo paso y decisiones aceptadas.
- [x] Permitir reanudar la tarea leyendo el artefacto y reconstruyendo su fase.
- [x] Actualizar solo las secciones afectadas, conservando tareas completadas y evidencia válida.
- [x] Solicitar aprobación del objetivo y del plan antes de implementar; volver a `awaiting-approval` si cambia el alcance.
- [x] Cerrar la tarea con un resultado común y mantener el archivo como historial breve del cambio.

Entregable: [docs/PHASE_4_TASKS.md](PHASE_4_TASKS.md), una tarea mediana que puede continuar después de una interrupción. Cierre: el agente puede recuperar el trabajo desde el archivo sin depender del contexto conversacional completo.

### Fase 5 — Ruta simple

- [x] Crear `harness-simple` con el ciclo: entender, inspeccionar, editar, verificar y resumir.
- [x] Respetar las instrucciones y herramientas del repositorio actual; no imponer `npm`, un lenguaje o una suite de pruebas universal.
- [x] Seleccionar verificaciones proporcionales al cambio y documentar el resultado real.
- [x] Revisar el diff antes de cerrar la tarea y detectar archivos ajenos modificados durante la sesión.
- [x] Presentar un resumen de cambios y verificaciones para revisión humana antes del cierre cuando el perfil lo requiera.
- [x] Permitir reencaminar a `sdd` si la implementación descubre un impacto mayor al previsto.
- [x] Definir salida de fallo: causa concreta, estado de los archivos y siguiente paso posible.

Entregable: [docs/PHASE_5_SIMPLE.md](PHASE_5_SIMPLE.md), ejecución de una tarea pequeña sin artefactos SDD. Cierre: el flujo produce un cambio verificable, un resumen fiel a la evidencia y un checkpoint HIL antes del cierre.

### Fase 6 — Ruta compleja con OpenSpec

- [x] Detectar si el repositorio tiene OpenSpec configurado para Pi; si falta, mostrar el requisito y el comando de inicialización sin modificar el proyecto automáticamente.
- [x] Detectar los prompts/skills generados por OpenSpec y su procedencia antes de invocarlos; en Pi, los prompts se llaman `/opsx-propose`, `/opsx-apply`, etc.
- [x] Crear el adaptador que pasa el prompt y el contexto de la tarea a `propose` sin duplicar la lógica de OpenSpec.
- [x] Detenerse después de la recomendación hasta que el usuario confirme la creación de artefactos SDD.
- [x] Asociar el nombre del change de OpenSpec al estado de la tarea.
- [x] Presentar propuesta, especificaciones, diseño y tareas para revisión antes de `apply`.
- [x] Requerir autorización explícita para `apply`, cambios de alcance y archivo del change.
- [x] Reanudar la tarea tras ajustes de artefactos; ejecutar `apply`, verificar el resultado, sincronizar specs cuando corresponda y archivar solo al terminar.
- [x] Manejar comandos ausentes, cambios incompletos y fallos de verificación con un estado recuperable.

Entregable: [docs/PHASE_6_OPENSPEC.md](PHASE_6_OPENSPEC.md), una tarea compleja delegada a OpenSpec. Cierre: los artefactos viven bajo `openspec/`, se pueden inspeccionar con OpenSpec y el harness muestra en qué paso quedó la tarea.

### Fase 7 — Convivencia, configuración y recuperación

- [x] Añadir configuración validada para modo predeterminado, reglas de enrutamiento y nivel de intervención del usuario.
- [x] Implementar la política HIL y sus transiciones `awaiting-approval`, `awaiting-review`, `blocked` y `cancelled`.
- [x] Definir precedencia entre valores del package y configuración del proyecto; documentarla con ejemplos.
- [x] Asegurar nombres propios para comandos, tipos de entradas y skills; no reemplazar herramientas nativas de Pi.
- [x] Probar convivencia por prefijo propio con otros packages y conservar la delegación independiente de OpenSpec.
- [x] Probar recuperación de tareas interrumpidas y evitar reanudación silenciosa.
- [x] Evitar respuestas repetidas o cambios dobles cuando se recibe el mismo comando dos veces.
- [x] Implementar `/harness-status`, `/harness-doctor` y `/harness-changes` con salidas legibles.
- [x] Verificar que los artefactos de tarea y OpenSpec sean suficientes para recuperar el trabajo.
- [x] Probar gates de recuperación, revisión y autorización mediante contratos unitarios.
- [x] Mantener selección de perfil y modo configurable sin cambiar la semántica de las rutas.

Entregable: [docs/PHASE_7_OPERATIONS.md](PHASE_7_OPERATIONS.md), comportamiento estable en sesiones largas y entornos con otros packages. Cierre: los casos de interrupción terminan en un estado entendible y se pueden continuar sin recrear trabajo completado.

### Fase 8 — Validación y distribución

- [x] Añadir pruebas de la política de clasificación y de las transiciones de estado; concentrarlas en errores que tendrían impacto real.
- [x] Ejecutar pruebas de extremo a extremo en dos consumidores temporales y añadir validación condicional para Windows/Git Bash.
- [x] Verificar el contenido distribuido y que la instalación desde tarball cargue los mismos recursos runtime.
- [x] Documentar instalación, requisitos de OpenSpec, comandos, configuración, desinstalación y resolución de problemas.
- [ ] Publicar una versión inicial con notas de cambios solo después de revisar los ejemplos de las fases anteriores; requiere autorización explícita y decisiones de distribución.

Entregable: [docs/PHASE_8_VALIDATION.md](PHASE_8_VALIDATION.md), package versionado e instalable por otros desarrolladores. Cierre técnico alcanzado; publicación npm queda deliberadamente pendiente de decisión y autorización.

### Fase 9 — Uso y validación operativa

Estado: completada tras la validación manual confirmada por el usuario el 2026-10-06. El detalle de cierre está en [docs/PHASE_9_VALIDATION_LOG.md](PHASE_9_VALIDATION_LOG.md).

El objetivo de esta fase es validar que pi-harness resulta útil, comprensible y recuperable cuando se utiliza como herramienta principal en repositorios reales de prueba. No se incorporan nuevas integraciones externas durante esta fase.

Antes de ejecutar los escenarios de validación, implementar el [plan aprobado de CLI y experiencia TUI](PHASE_9_CLI_TUI_PLAN.md): un comando `yh-pi` instalable, lógica compartida para texto normal y comandos slash, avance de workflows con gates HIL, flujo genérico para perfiles no técnicos e identidad visual propia.

La experiencia HIL de esta fase debe ser transparente para la persona: antes de aprobar una implementación, `yh-pi` mostrará un resumen del `HarnessPlan`, ofrecerá una vista completa navegable y asociará la decisión a una versión concreta del plan. Modificar el plan invalida la aprobación anterior. Los comandos slash quedarán como fallback avanzado, no como requisito del flujo normal.

- [x] Preparar repositorios consumidores representativos para tareas `simple`, `task` y `sdd`.
- [x] Ejecutar escenarios completos desde un prompt inicial hasta el resumen final, registrando decisiones HIL, artefactos y verificaciones.
- [x] Validar el flujo SDD real con OpenSpec en un repositorio consumidor: `propose`, revisión humana, `apply`, verificación, `sync` y `archive`.
- [x] Validar recuperación después de cerrar y reabrir Pi, cancelar una operación y dejar una tarea bloqueada.
- [x] Validar reencaminamiento: una tarea inicialmente simple que descubre impacto mayor debe pasar a `task` o `sdd` sin perder contexto.
- [x] Evaluar la calidad de las recomendaciones de ruta con ejemplos reales y ajustar las reglas solo cuando exista evidencia.
- [x] Evaluar la experiencia del usuario: claridad de mensajes, utilidad de los gates HIL, comandos de recuperación y resumen final.
- [x] Documentar problemas encontrados, decisiones de uso y criterios de aceptación del MVP.
- [x] Ejecutar una prueba de adopción con al menos un usuario distinto del autor del package.
- [x] Cerrar las validaciones omitidas de Windows/Git Bash cuando el entorno permita reproducirlas de forma estable.

Entregable: [docs/PHASE_9_USAGE_VALIDATION.md](PHASE_9_USAGE_VALIDATION.md), informe de escenarios ejecutados, problemas conocidos y criterios para declarar el MVP apto para uso. Cierre: una persona nueva puede instalar el package, completar los flujos principales y recuperarse de una interrupción sin asistencia del autor.

**Cierre al 2026-10-06:** el usuario confirmó que la validación manual de Fase 9 está completa. Se actualizó el registro de validación; los detalles de ejecución no especificados en esta confirmación no se inventan. Este cierre no implica publicar el package.

### Fase 10 — Sistema mínimo de capabilities

Crear un punto de extensión pequeño para separar la coordinación del harness de la implementación concreta de una integración. Pi continúa siendo el runtime del agente; una capability no reemplaza Pi ni contiene el workflow completo.

- [x] Definir el contrato mínimo `Capability`: identidad, descripción, disponibilidad contextual y ejecución tipada.
- [x] Crear un registro local que permita registrar, consultar, listar y detectar IDs duplicados.
- [x] Migrar la detección de OpenSpec a la primera capability y hacer que la extensión consulte el registro.
- [x] Añadir la capability `repository` para recopilar contexto e instrucciones del repositorio.
- [x] Separar la capability `git`, responsable de los snapshots de estado y archivos.
- [x] Añadir la capability `verification` para contrastar archivos reportados, sin ejecutar comandos arbitrarios.
- [x] Conectar intake de tareas, diagnóstico y workflow simple con las capabilities correspondientes.
- [x] Cubrir registro, disponibilidad, ejecución e integración con pruebas automatizadas.
- [x] Revisar el contrato con cuatro verticales locales: contexto común mínimo `cwd` y contextos tipados por capability; sin carga dinámica ni backend de plugins.

Estado: completada técnicamente en su alcance local. La Fase 9 también está completa tras su validación manual; la publicación requiere decisión aparte.

Alcance explícitamente excluido de este incremento: Memory/RAG, MCP, GitHub/Azure DevOps, navegador, políticas genéricas, subagentes, carga dinámica de plugins y un Context Engine completo. La finalización de esta fase no implica publicación.

Entregable: [docs/PHASE_10_CAPABILITIES.md](PHASE_10_CAPABILITIES.md), contrato mínimo probado y detección de OpenSpec integrada mediante el registro.

### Fase 11 — Context Engine local

Componer contexto por niveles y relevancia con límites explícitos. El motor selecciona datos locales para cada workflow; no sustituye el runtime ni carga todo el repositorio.

- [x] Definir un contrato tipado de entradas, niveles, snapshot, presupuesto y omisiones.
- [x] Componer por niveles: solicitud (0), metadatos del repo (1), archivos relevantes (2) y arquitectura condicional (3).
- [x] Mantener el nivel histórico (4) reservado para Memory/RAG posterior.
- [x] Limitar profundidad, extensiones, directorios ignorados, archivos seleccionados y caracteres totales.
- [x] Persistir el snapshot como parte del contexto de la tarea.
- [x] Inyectar las entradas seleccionadas en el workflow simple sin cambiar el comportamiento de prompts normales de Pi.
- [x] Probar relevancia, límites, exclusiones, nivel condicional e integración con tests automatizados.
- [x] Documentar límites, exclusiones y criterios de aceptación.

Estado: implementación local completada técnicamente. Memory/RAG, retrieval semántico, MCP y servicios externos siguen para fases posteriores. No habilita publicación.

Entregable: [docs/PHASE_11_CONTEXT_ENGINE.md](PHASE_11_CONTEXT_ENGINE.md), composición progresiva local conectada al flujo simple y a la preparación de tareas.

### Fase 12 — Contrato opcional de Memory/RAG

Preparar la interfaz y el punto de conexión de memoria histórica al Context Engine sin acoplar el core a un proveedor ni activar consultas/escrituras por defecto.

- [x] Definir `MemoryProvider` con disponibilidad, búsqueda y escritura; modelar consulta, entrada y resultado.
- [x] Exigir un ámbito `projectId` explícito en el contexto del proveedor y validar de nuevo ese ámbito en cada resultado.
- [x] Conectar un provider opcional al nivel 4 del Context Engine; sin binding, Memory permanece inactivo.
- [x] Limitar retrieval a 5 resultados y 4.000 caracteres; omitir resultados de otros proyectos.
- [x] Continuar la tarea si el provider no está disponible o falla, exponiendo solo un aviso acotado y sin detalles internos.
- [x] Definir `store` para un backend futuro, pero no invocarlo automáticamente en workflows.
- [x] Cubrir ausencia, aislamiento, límites, fallos y comportamiento sin escrituras con providers falsos.
- [x] Documentar explícitamente que esta fase no instala ni configura una solución RAG.

Estado: contrato y punto de integración completados; no hay proveedor productivo conectado. Memory/RAG solo se activa cuando el host inyecta una implementación y un `projectId` explícito. No se autoriza publicación.

Entregable: [docs/PHASE_12_MEMORY_PROVIDER.md](PHASE_12_MEMORY_PROVIDER.md), contrato y fuente opcional de nivel 4 lista para un adapter futuro.

### Fase 13 — Adaptador MCP opt-in

Implementar el primer adaptador para que el registro de capabilities se comunique con servidores MCP bajo demanda. Validar el protocolo con Everything, sin credenciales ni activar conexiones en proyectos consumidores.

- [x] Usar el SDK oficial de MCP y transporte local `stdio`.
- [x] Soportar descubrimiento y operación explícita de tools, resources y prompts.
- [x] Exigir que el host provea la definición del servidor y no iniciar nada por defecto.
- [x] Limitar cada operación a un proceso elegido y cerrar la conexión al finalizar.
- [x] Validar con Everything mediante pruebas unitarias/contrato y una prueba de integración reproducible.
- [x] Documentar confianza, riesgos, límites y trabajo que requiere una decisión posterior.

Estado: adaptador y validación local completados. Nada de esta fase expone tools MCP automáticamente al agente ni configura servidores por proyecto; se requiere una decisión futura sobre UX, allowlist y gestión de credenciales. No se autoriza publicación.

Entregable: [docs/PHASE_13_MCP.md](PHASE_13_MCP.md), adaptador `McpCapability` y pruebas reales contra Everything.

### Fase 14 — Integración MCP mediante pi-mcp-adapter

Usar el adapter MCP con mayor adopción observada en la comunidad Pi como runtime de conexiones, y conectar yh-pi mediante su API pública cross-extension. El objetivo es no mantener un segundo ciclo de vida de conexiones, OAuth y credenciales.

- [x] Elegir `pi-mcp-adapter` con base en actividad/adopción pública observada y compatibilidad con Pi.
- [x] Delegar llamadas de yh-pi al runtime del adapter mediante su evento público `runtime-tool-call`.
- [x] Añadir allowlist exacta por servidor y tool, vacía y desactivada por defecto.
- [x] Pedir aprobación HIL de una llamada por vez y fallar de forma cerrada sin UI.
- [x] Bloquear la vía directa del adapter cuando MCP de yh-pi está activado para no saltar la allowlist.
- [x] Registrar decisiones sin almacenar argumentos ni resultados del servidor.
- [x] Documentar configuración, instalación optativa y límites de responsabilidad.

Estado: integración implementada con `pi-mcp-adapter`; no es dependencia obligatoria ni se instala/configura automáticamente. Ver [docs/PHASE_14_MCP_ADAPTER.md](PHASE_14_MCP_ADAPTER.md). La aprobación y allowlist de yh-pi se aplican antes de delegar; el adapter conserva conexión, OAuth, credenciales y su propia política de trust.

Mejora posterior: el onboarding de MCP presenta desde `/harness-mcp` el snapshot público del adapter por servidor (estado y cantidades), junto con las tools exactas habilitadas por la allowlist de yh-pi. No usa interfaces privadas ni fuerza conexiones lazy.

### Fase 15 — Actividad y recuperación MCP

- [x] Mantener un historial acotado a la sesión de cada llamada MCP, sin argumentos, resultados ni secretos.
- [x] Exponer `/harness-mcp-history` con servidor, tool, forma de aprobación, resultado y duración cuando existe.
- [x] Incluir un resumen de actividad reciente en `/harness-mcp`.
- [x] Diferenciar operaciones bloqueadas, rechazadas, canceladas, completadas y con resultado desconocido.
- [x] Orientar la recuperación: cuando el adapter no confirma el resultado, pedir confirmar el efecto antes de reintentar y no repetir automáticamente.

Estado: completada. Ver [docs/PHASE_15_MCP_ACTIVITY.md](PHASE_15_MCP_ACTIVITY.md). La actividad vive solo durante la sesión actual y conserva una ventana de 50 registros. El historial persistido de Pi recibe los mismos metadatos seguros, sin argumentos ni contenido de respuesta.

### Pendiente de CI — smoke test de consumidor

- [x] Reproducir en Ubuntu WSL el comando del job y validar la invocación real del paquete instalado. El 2026-10-08 instaló el tarball en dos consumidores y verificó las rutas `simple` y `sdd`: 2 pruebas aprobadas, 0 fallos; la prueba Git Bash quedó omitida como corresponde fuera de Windows.
- [x] Confirmar el mismo resultado en el job `Require clean-consumer smoke test` de GitHub Actions. El usuario reportó el workflow verde después de publicar los cambios el 2026-10-08.

### Fase 16 — Clasificación asistida por el modelo con decisión humana

Estado: completada el 2026-10-06.

**Objetivo:** que el modelo activo de Pi analice la solicitud y el contexto básico del repositorio, explique la ruta recomendada y espere una decisión explícita del desarrollador antes de iniciar cualquier workflow, incluida la ruta `simple`.

- [x] Solicitar al modelo una evaluación estructurada: ruta (`simple`, `task`, `sdd` o `clarify`), razones y dudas pendientes. La llamada de clasificación no tendrá herramientas de ejecución.
- [x] Mantener las reglas deterministas actuales como salvaguarda de riesgos y fallback si no hay modelo, hay timeout o la respuesta no es válida.
- [x] Mostrar la recomendación en la TUI y permitir aceptarla, escoger otra ruta, aclarar el alcance o cancelar antes de iniciar trabajo.
- [x] Aplicar la confirmación previa también a `simple`; conservar sin cambios los gates posteriores de plan, SDD y revisión.
- [x] Persistir evaluación y decisión humana en la tarea. Si cambia el alcance, reevaluar y volver a pedir aprobación.
- [x] Probar respuestas válidas e inválidas, salvaguardas de riesgo, override manual, cancelación y que ninguna ruta avance antes de la confirmación.
- [x] Actualizar documentación de routing, CLI/TUI y criterios de aceptación.

**Criterio de salida:** toda solicitud nueva muestra una recomendación explicada y no ejecuta su workflow hasta que el desarrollador confirma la clasificación o elige otra opción. Los controles de seguridad existentes siguen vigentes.

Validación: `npm test` (80 aprobados, 2 omitidos porque los consumidores temporales no pudieron instalar dependencias en 30 s), `npm run pack:check`, `git diff --check`, reproducción en Ubuntu WSL y job obligatorio de consumidor verde en GitHub Actions. La matriz ampliada de recorridos instalados continúa como siguiente trabajo de calidad.

### Mejora posterior a Fase 16 — Recorte de carga de arranque

Estado: completada el 2026-10-07. Detalle en [docs/STARTUP_PERFORMANCE.md](STARTUP_PERFORMANCE.md).

- [x] Diferir el SDK y la integración MCP hasta habilitar MCP o usar un comando MCP.
- [x] Diferir Git, OpenSpec, verificación y el workflow `simple` hasta que un workflow o diagnóstico los necesite.
- [x] Diferir el motor de contexto, los artefactos de tareas y el render detallado de planes hasta crear, revisar, persistir o recuperar una tarea.
- [x] Mantener disponibles los comandos y aplicar las mismas políticas HIL y de seguridad después de la carga diferida.
- [x] Validar con pruebas de inicio, MCP, capabilities, workflows, planes y artefactos; además de `npm test`, `npm run pack:check` y `git diff --check`.

Decisión posterior: la medición comparó TypeScript en runtime con un prototipo JavaScript compilado y mostró una reducción de mediana de 12,7 % (231 ms). No se agregará un build distribuido todavía; el detalle y el criterio de revisión están en [docs/STARTUP_PERFORMANCE.md](STARTUP_PERFORMANCE.md). El fallo intermitente o pendiente del smoke test obligatorio de CI sigue registrado en la Fase 15 y no se considera resuelto por este cambio.

## 6. Orden de entrega recomendado

1. MVP operativo: fases 0 a 5. Permite validar la entrada, el estado, la evaluación, la ruta simple y la tarea ligera.
2. SDD: fase 6. Se integra OpenSpec cuando el núcleo ya puede sostener una tarea.
3. Endurecimiento y distribución: fases 7 y 8.
4. Uso y validación operativa: fase 9. Se valida el comportamiento real antes de declarar apto el MVP o publicarlo. El usuario decidió posponer los escenarios manuales; las fases 10 a 12 pueden avanzar como trabajo arquitectónico interno, sin considerar la Fase 9 cerrada.
5. Extensibilidad interna: fase 10. Introducir el registro mínimo de capabilities y migrar OpenSpec como primer vertical, sin agregar integraciones externas.
6. Contexto progresivo local: fase 11. Componer solicitud, metadatos y fuentes de repo relevantes; dejar Memory/RAG y retrieval histórico para fases posteriores.
7. Contrato de memoria: fase 12. Definir el puerto y conectarlo opcionalmente sin backend activo; elegir e integrar una solución RAG requiere una decisión posterior.
8. Adaptador MCP: fase 13. Validar el protocolo con Everything y dejar la conexión opt-in.
9. Integración MCP del agente: fase 14. Reutilizar `pi-mcp-adapter` con allowlist y gates HIL del harness.
10. Actividad y recuperación MCP: fase 15. Dar trazabilidad local a las llamadas y no reintentar resultados ambiguos.

### Roadmap de calidad recomendado

1. **Estabilizar CI.** Completado: el `Require clean-consumer smoke test` se reprodujo en Linux y pasó en GitHub Actions.
2. **Convertir los recorridos críticos en regresiones.** El consumidor instalado ya verifica recuperación de tarea tras reinicio, OpenSpec ausente, artefacto corrupto, fallback de clasificación sin modelo, cancelación terminal y cambio de alcance; todos pasaron en Ubuntu WSL el 2026-10-08. Consolidar la matriz restante para SDD con OpenSpec configurado, carga diferida y MCP deshabilitado/habilitado con resultados ambiguos. Debe ejecutarse sin depender de timings frágiles.
3. **Revisar la distribución compilada al preparar el release.** La medición actual no justifica un build adicional. Repetirla desde un consumidor instalado cuando se prepare npm y adoptar JavaScript compilado solo si la mediana mejora al menos 15 % de manera reproducible.
4. **Fortalecer la experiencia de operación.** Probar en repositorios consumidores los flujos de error del modelo, OpenSpec ausente, artefactos corruptos y resultados MCP ambiguos; convertir cada caso reproducible en una prueba y una recuperación visible en TUI.
5. **Preparar distribución.** Cuando CI y la matriz de consumidor estén estables, definir compatibilidad mínima de Pi/Node, versionado, changelog y decisión de publicación npm.

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
- Implementación completa de perfiles funcionales, de producto o marketing; el MVP solo necesita el perfil `developer`, pero los contratos deben quedar preparados.

La regla de salida del MVP es que una persona pueda iniciar una tarea desde un prompt, recibir una recomendación, completar una tarea simple o ligera y recuperar su estado. OpenSpec puede integrarse después sin rediseñar esos contratos.

## 8. Decisiones pendientes antes de implementarlas

- Nombre definitivo del package y ámbito npm, si se publicará.
- Nivel de automatización tras la propuesta OpenSpec: revisión manual obligatoria en la primera versión; opción configurable más adelante.
- Nombre definitivo para la ruta intermedia (`task`, `odd` o `work-item`).
- Formato y ubicación de la configuración del proyecto.
- Compatibilidad mínima de versiones de Pi y OpenSpec, fijada con pruebas de instalación reales.
- Necesidad futura de admitir prompts normales sin `/harness-work`; si se añade, debe ser una opción explícita por proyecto.
- Forma de seleccionar perfiles: flag, configuración del proyecto o inferencia asistida; el default actual es `developer`.
- Catálogo final de intenciones y formatos de resultado por perfil.
- Criterios finales de aceptación del MVP después de completar la Fase 9.
- Decisión de publicación npm, que se tomará después de la validación operativa y no antes.

## 9. Fuentes de referencia

- Pi packages: https://pi.dev/docs/latest/packages
- Pi extensions: https://pi.dev/docs/latest/extensions
- Pi skills: https://pi.dev/docs/latest/skills
- Pi prompt templates: https://pi.dev/docs/latest/prompt-templates
- OpenSpec, soporte de Pi: https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md
- OpenSpec, comandos: https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md
