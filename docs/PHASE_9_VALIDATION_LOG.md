# Fase 9 — Registro de validación operativa

Estado: **completada**. El usuario confirmó el 2026-10-06 que la validación manual está OK.

La confirmación cubre el cierre de la fase. En esta actualización no se agregan prompts, commits, nombres de repositorios ni resultados por escenario que no hayan sido proporcionados explícitamente.

Este registro reúne la evidencia que no puede sustituirse con pruebas unitarias o de empaquetado: comportamiento de la TUI, decisiones Human-in-the-Middle, recuperación de una sesión y la integración real con OpenSpec.

## Precondiciones

- Ejecutar un tarball local mediante `yh-pi` desde un repositorio consumidor.
- Registrar versión del package, sistema operativo, shell, repositorio consumidor y commit inicial.
- Para SDD, usar un consumidor con OpenSpec configurado para Pi y conservar el identificador del change generado.
- No marcar un escenario como completado si una aprobación, recuperación o verificación fue simulada fuera del flujo del harness.

## Matriz

| Escenario | Estado | Evidencia mínima |
| --- | --- | --- |
| Instalación limpia desde PowerShell | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Instalación limpia desde Git Bash | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Ruta `simple` | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Ruta `task` | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Ruta `clarify` | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Ruta `sdd` con OpenSpec | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Recuperación tras interrupción | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Cambio de alcance | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Solicitud equivalente | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |
| Persona no autora | Completado (confirmación del usuario) | Validación manual confirmada; detalles de ejecución no registrados aquí |

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
