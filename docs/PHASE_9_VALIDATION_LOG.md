# Fase 9 — Registro de validación operativa

Estado: pendiente de ejecuciones manuales en un consumidor real.

Este registro reúne la evidencia que no puede sustituirse con pruebas unitarias o de empaquetado: comportamiento de la TUI, decisiones Human-in-the-Middle, recuperación de una sesión y la integración real con OpenSpec.

## Precondiciones

- Ejecutar un tarball local mediante `yh-pi` desde un repositorio consumidor.
- Registrar versión del package, sistema operativo, shell, repositorio consumidor y commit inicial.
- Para SDD, usar un consumidor con OpenSpec configurado para Pi y conservar el identificador del change generado.
- No marcar un escenario como completado si una aprobación, recuperación o verificación fue simulada fuera del flujo del harness.

## Matriz

| Escenario | Estado | Evidencia mínima |
| --- | --- | --- |
| Instalación limpia desde PowerShell | Pendiente | Tarball, versión de `yh-pi`, arranque de TUI |
| Instalación limpia desde Git Bash | Pendiente | Tarball, versión de `yh-pi`, arranque de TUI |
| Ruta `simple` | Pendiente | Diff, checks, gate de revisión y resultado |
| Ruta `task` | Pendiente | `.harness/tasks/<id>.md`, aprobación de plan, reanudación y cierre |
| Ruta `clarify` | Pendiente | Pregunta, respuesta y reevaluación resultante |
| Ruta `sdd` con OpenSpec | Pendiente | Change, gates de propose/apply/sync/archive y resultado |
| Recuperación tras interrupción | Pendiente | Estado persistido, gate recover y continuación sin duplicados |
| Cambio de alcance | Pendiente | Ruta anterior/nueva, plan versionado y gate renovado |
| Solicitud equivalente | Pendiente | Decisión humana y ausencia de ejecución duplicada |
| Persona no autora | Pendiente | Resultado, comprensión observada y fricciones |

## Plantilla de ejecución

Copiar este bloque una vez por escenario completado.

```md
### <escenario> — <fecha>

- Package y entorno:
- Repositorio consumidor y commit inicial:
- Prompt:
- Perfil y modo:
- Ruta seleccionada y justificación:
- Gates HIL mostrados y decisiones:
- Artefactos, archivos y diff:
- Verificaciones ejecutadas y resultado:
- Recuperación o reevaluación, si aplica:
- Fricción observada:
- Resultado: completado | bloqueado | fallido
- Seguimiento:
```

## Criterio de cierre

La Fase 9 solo puede cerrarse cuando los cuatro flujos principales estén registrados, SDD haya funcionado con OpenSpec real, recuperación y reevaluación no pierdan estado, y las incidencias restantes estén priorizadas.
