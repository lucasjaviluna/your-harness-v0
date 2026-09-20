# Configuración de pi-harness

La configuración del proyecto es opcional y vive en:

```text
.harness/config.json
```

La precedencia es:

```text
defaults internos < configuración del proyecto
```

Los valores inválidos no detienen Pi: se ignoran, se conserva el default y `/harness-doctor` muestra una advertencia.

## Ejemplo

```json
{
  "defaultMode": "auto",
  "profile": "developer",
  "hil": {
    "requireApproval": true,
    "requireReview": true,
    "recoverInterrupted": true
  },
  "routing": {
    "allowManualOverride": true,
    "allowRerouteToSdd": true
  }
}
```

`requireApproval: false` solo puede omitir la aprobación inicial de una tarea `task`; nunca elimina las autorizaciones de SDD ni los gates de cambios de alcance. `requireReview: false` permite cerrar automáticamente la ruta simple, por lo que debe reservarse para repositorios o perfiles con una política explícita de confianza.

## Diagnóstico

```text
/harness-doctor
/harness-changes
```

`/harness-doctor` muestra la configuración efectiva, compatibilidad de Pi, Git, instrucciones del repositorio y OpenSpec. `/harness-changes` muestra archivos Git modificados y changes OpenSpec activos.
