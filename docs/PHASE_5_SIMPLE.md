# Fase 5 — Ruta simple

La ruta simple está destinada a cambios localizados y de bajo riesgo. No crea artefactos SDD ni impone una herramienta de build: usa las instrucciones y los comandos de verificación detectados en el repositorio.

## Flujo operativo

1. `/harness-work --mode simple <prompt>` recibe el prompt, reúne el contexto y deja la tarea en `planning`.
2. `/harness-simple` toma una fotografía del estado Git y envía al agente un workflow explícito: entender, inspeccionar, editar, verificar, revisar diff y resumir.
3. El agente debe devolver un bloque `<HARNESS_RESULT>` con resumen, archivos modificados, verificaciones, riesgos y ruta sugerida.
4. Pi compara los archivos actuales con la fotografía inicial y detecta archivos modificados que no fueron reportados.
5. La tarea queda en `awaiting-review`; la persona decide con `/harness-decide approve`, `revise` o `cancel`.
6. Si el agente indica `route: sdd`, la tarea vuelve a un gate de autorización SDD y no se cierra como simple.

## Ejemplo

```text
/harness-work --mode simple Cambiar el mensaje de error del botón de login en src/login.ts
/harness-simple
```

Al finalizar el turno del agente:

```text
/harness-status
/harness-decide approve
```

Usa `revise` para devolver la tarea a planificación y repetir el workflow. Una verificación marcada como `failed` impide aprobar el resultado hasta corregirla.

## Contrato de salida

El agente debe informar evidencia real, no sólo afirmar que ejecutó un comando:

```text
<HARNESS_RESULT>
summary: ...
changed_files: uno por línea o none
checks:
- [passed|failed|skipped] comando :: evidencia
risks:
- riesgo o none
route: simple|sdd
</HARNESS_RESULT>
```

Si el bloque falta o es inválido, la tarea queda en `failed` con el siguiente paso para reintentar. La revisión humana sigue siendo obligatoria antes del cierre.
