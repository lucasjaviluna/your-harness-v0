# your-harness-v0

## Instalación local

Desde este repositorio:

```text
pi install . -l
```

Para verificar el artefacto distribuible sin publicarlo:

```text
npm run pack:check
npm run test:e2e
```

Requisitos: Node.js compatible con la versión de Pi instalada y Pi disponible en el entorno. OpenSpec es opcional para las rutas `sdd`; si falta, `/harness-doctor` muestra el comando de inicialización sugerido.

Para probar una tarea:

```text
/harness-work --mode simple Cambiar un texto localizado
/harness-simple
```

En Git Bash, si Pi no recibe correctamente una ruta Windows, usa `MSYS_NO_PATHCONV=1`.

Documentación del proyecto:

- [Fundamentos del proyecto](docs/FOUNDATIONS.md)
- [Contrato de la Fase 0](docs/PHASE_0_CONTRACT.md)
- [Ingreso y contexto de la Fase 2](docs/PHASE_2_INTAKE.md)
- [Evaluación y selección de la Fase 3](docs/PHASE_3_ASSESSMENT.md)
- [Ruta de tarea ligera de la Fase 4](docs/PHASE_4_TASKS.md)
- [Ruta simple de la Fase 5](docs/PHASE_5_SIMPLE.md)
- [Ruta SDD con OpenSpec de la Fase 6](docs/PHASE_6_OPENSPEC.md)
- [Operación y configuración de la Fase 7](docs/PHASE_7_OPERATIONS.md)
- [Configuración](docs/CONFIGURATION.md)
- [Validación y distribución de la Fase 8](docs/PHASE_8_VALIDATION.md)
- [Plan de implementación por fases](docs/PLAN_IMPLEMENTACION.md)
