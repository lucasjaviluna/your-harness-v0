# Workflow SDD con OpenSpec

Usa esta skill para cambios con impacto en contratos, datos, seguridad, arquitectura, compatibilidad o varios módulos.

Pi-harness coordina el ciclo, pero OpenSpec es dueño de sus artefactos y comandos. Detecta primero la instalación del proyecto y usa el comando generado para Pi (`/opsx-propose`, `/opsx-apply`, etc.) o el nombre de skill equivalente. No inventes una sintaxis si OpenSpec generó otra.

Secuencia obligatoria:

1. Proponer el change sin ejecutar `apply`.
2. Revisar con la persona los artefactos de propuesta, especificaciones, diseño y tareas.
3. Solicitar autorización explícita para `apply`.
4. Revisar los cambios implementados.
5. Ejecutar `verify`, después `sync` y solicitar autorización explícita antes de `archive`.
6. Archivar únicamente cuando la persona haya aprobado el resultado.

Si OpenSpec no está instalado o no está configurado para Pi, informa el comando de inicialización sugerido y no modifiques el repositorio automáticamente.
