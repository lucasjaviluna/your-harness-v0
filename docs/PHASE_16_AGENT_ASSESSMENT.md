# Fase 16 — Clasificación asistida por el modelo

## Comportamiento

Para solicitudes nuevas y cambios de alcance, yh-pi pide al modelo activo de Pi una clasificación estructurada: ruta (`simple`, `task`, `sdd` o `clarify`), confianza, razones, áreas afectadas y dudas. La llamada no recibe herramientas. La solicitud y el contexto del repositorio se envían como datos no confiables.

Las reglas deterministas existentes siguen actuando como fallback cuando no hay modelo, la llamada falla o la respuesta no cumple el esquema. También fuerzan `sdd` ante riesgos explícitos de seguridad, contratos, datos, arquitectura o alcance transversal y `clarify` ante falta decisiva de información.

## Decisión humana

La TUI ofrece aceptar la ruta, elegir otra, aclarar o cancelar. La decisión y la evaluación se persisten en el registro de la tarea. Ningún workflow, incluida la ruta `simple`, puede empezar antes de resolver el gate `assessment`.

En modo sin TUI:

- `/harness-decide approve` confirma la ruta recomendada.
- `/harness-route simple|task|sdd|clarify` confirma otra ruta.
- `/harness-decide cancel` cancela la solicitud.
- Si la ruta elegida es `clarify`, responde con `/harness-decide answer <respuesta>`.

Una vez confirmada la clasificación se conservan los checkpoints existentes de plan, implementación SDD, revisión y cierre. Cada cambio de alcance invalida las aprobaciones previas, vuelve a evaluar y exige confirmar la ruta otra vez.

## Limitación

La evaluación no tiene herramientas y solo recomienda una estrategia; no ejecuta trabajo. `--analyze-only` muestra el análisis sin iniciar workflows ni pedir aprobación de ejecución.
