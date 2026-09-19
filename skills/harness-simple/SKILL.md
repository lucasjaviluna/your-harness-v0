# Workflow simple de pi-harness

Usa este workflow para cambios localizados y de bajo riesgo. El flujo recibe una tarea ya evaluada como `simple`, inspecciona las instrucciones del repositorio, edita sólo el alcance aprobado, ejecuta verificaciones proporcionales y solicita revisión humana del resultado.

No cierres la tarea si hay verificaciones fallidas. Si aparecen cambios de contrato, datos, seguridad, arquitectura o varios módulos, informa `route: sdd` en `HARNESS_RESULT` para que pi-harness solicite autorización para reencaminarla.
