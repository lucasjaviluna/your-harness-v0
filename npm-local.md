# Prueba local equivalente a una instalación npm

Este procedimiento reproduce localmente lo que hará un usuario al instalar `pi-harness` desde npm, pero usando el tarball generado desde este checkout.

La prueba está pensada para ejecutarse sobre un proyecto real. Para una prueba no invasiva, trabaja primero sobre una rama o una copia del proyecto.

## 1. Precondiciones

Desde el repositorio de `pi-harness`:

```bash
node --version
npm --version
git status --short
```

Requisitos declarados:

- Node.js `>=22.19.0`.
- npm.
- Un proyecto consumidor real.
- Git es recomendable para poder revertir cualquier cambio.
- Pi no necesita estar instalado globalmente: el package instala su runtime como dependencia.

En PowerShell, los comandos equivalentes funcionan reemplazando la sintaxis de variables y rutas según corresponda.

## 2. Validar el checkout antes de empaquetar

Ejecutar desde la raíz de `your-harness-v0`:

```bash
npm ci
npm test
npm run pack:check
git diff --check
```

El resultado esperado es:

- suite sin fallos;
- `pack:check` correcto;
- sin errores de espacios o formato en `git diff --check`.

## 3. Crear el tarball local

Crear un directorio temporal fuera del repositorio y empaquetar:

```bash
mkdir -p .local-release
npm pack --pack-destination .local-release --ignore-scripts
```

El archivo esperado es similar a:

```text
.local-release/pi-harness-0.1.0.tgz
```

Inspeccionar el contenido antes de instalarlo:

```bash
npm pack --dry-run
```

Debe incluir, como mínimo, `bin/yh-pi.js`, `extensions/`, `src/`, `skills/`, `themes/`, `docs/`, `README.md` y `package.json`.

## 4. Preparar el proyecto real

### Opción recomendada: rama de prueba

Desde el proyecto consumidor:

```bash
git switch -c test/pi-harness-local
git status --short
```

Si el proyecto ya tiene cambios propios, registrarlos antes de continuar para distinguirlos de los cambios de la prueba.

### Opción no invasiva

Crear una copia o worktree del proyecto y ejecutar allí todos los pasos. No uses `npm install` directamente sobre producción.

## 5. Instalar el tarball local

Desde el proyecto consumidor, con la ruta correcta al tarball:

```bash
npm install /ruta/absoluta/your-harness-v0/.local-release/pi-harness-0.1.0.tgz --save-dev
```

En PowerShell:

```powershell
npm install "C:\ruta\your-harness-v0\.local-release\pi-harness-0.1.0.tgz" --save-dev
```

Esto simula la instalación del package desde npm y debe crear o actualizar:

- `package.json`;
- `package-lock.json`;
- `node_modules/pi-harness`;
- las dependencias runtime, incluido Pi.

Para una prueba que no modifique los manifests del proyecto consumidor:

```bash
npm install /ruta/absoluta/pi-harness-0.1.0.tgz --no-save --package-lock=false
```

Esta variante es útil para una inspección rápida, pero la rama de prueba con instalación normal es más representativa.

## 6. Verificar la instalación

Desde el proyecto consumidor:

```bash
npm ls pi-harness @earendil-works/pi-coding-agent
npx yh-pi --version
npx yh-pi --help
```

Esperado:

- aparece `pi-harness@0.1.0`;
- aparece la versión fijada de `@earendil-works/pi-coding-agent`;
- `yh-pi --version` devuelve `0.1.0`;
- `yh-pi --help` muestra las opciones `--mode`, `--profile` y el passthrough para Pi.

No es necesario instalar `pi` globalmente.

## 7. Diagnóstico inicial dentro del proyecto real

Iniciar el harness:

```bash
npx yh-pi
```

Ejecutar estos comandos dentro de Pi:

```text
/harness-doctor
/harness-overview
/harness-changes
/harness-mcp
/harness-mcp-history
```

Comprobar:

- `/harness-doctor` detecta el repositorio y muestra las advertencias reales;
- `/harness-overview` muestra `Tarea: ninguna activa` al inicio;
- `/harness-changes` muestra el estado Git y OpenSpec;
- MCP aparece deshabilitado por defecto y con allowlist vacía;
- el historial MCP informa que todavía no hubo llamadas;
- ningún comando modifica el código del proyecto.

## 8. Probar la ruta simple

Usar un cambio pequeño y reversible:

```text
/harness-work --mode simple Cambiar un texto localizado en un archivo de prueba
```

Aceptar la clasificación cuando Pi la muestre. Revisar que:

1. la ruta sea `simple`;
2. el cambio quede limitado al alcance;
3. se ejecuten las verificaciones disponibles;
4. aparezca el gate de revisión humana;
5. `/harness-overview` muestre el estado y el próximo paso;
6. la tarea no se cierre sin aprobación.

No uses archivos de configuración críticos para la primera prueba.

## 9. Probar la ruta task y recuperación

Iniciar una tarea de varios pasos:

```text
/harness-work --mode task Documentar el flujo de instalación del proyecto
```

Autorizar el plan cuando corresponda. Verificar que se cree:

```text
.harness/tasks/<task-id>.md
```

Ejecutar:

```text
/harness-task-status
/harness-overview
```

Cerrar Pi y abrir una nueva sesión desde el mismo proyecto. Recuperar:

```text
/harness-task-resume
/harness-task-status
```

El estado debe volver desde el artefacto sin duplicar silenciosamente la tarea ni perder decisiones.

Si sesión y artefacto divergen, el harness debe pedir una elección explícita:

```text
/harness-task-resume --source session
```

o:

```text
/harness-task-resume --source artifact
```

## 10. Probar SDD y OpenSpec

En un proyecto sin OpenSpec:

```text
/harness-work --mode sdd Preparar una propuesta formal para el cambio
/harness-sdd
```

Esperado: el harness informa que OpenSpec no está configurado, sugiere la inicialización y no crea artefactos del proyecto por sí solo.

En un proyecto que sí tenga OpenSpec configurado, verificar que la delegación respete los gates de aprobación y que el change se cree sólo después de autorizar la acción correspondiente.

## 11. Probar MCP de forma segura

Sin configurar MCP, comprobar:

```text
/harness-mcp
/harness-mcp-history
```

Esperado:

- MCP deshabilitado;
- allowlist vacía;
- cero llamadas en el historial;
- ninguna conexión externa iniciada.

Si el proyecto tiene un adapter MCP configurado, no agregues servidores ni tools a la allowlist sin autorización. Para un resultado `unknown`, confirma primero el efecto remoto antes de reintentar.

## 12. Medir el arranque instalado

Desde el proyecto consumidor, registrar al menos cinco ejecuciones:

```bash
for i in 1 2 3 4 5; do
  time npx yh-pi -- --no-tools --approve --no-session --print OK
done
```

En PowerShell:

```powershell
1..5 | ForEach-Object {
  Measure-Command { npx yh-pi -- --no-tools --approve --no-session --print OK }
}
```

Guardar:

- Node y npm;
- versión de Pi;
- sistema operativo y shell;
- commit o tarball probado;
- tiempos de cada ejecución;
- si la primera ejecución fue más lenta que las siguientes.

Esta medición es informativa. No cambiar a JavaScript compilado salvo que la mejora de mediana sea reproducible y supere el umbral acordado del 15 %.

## 13. Evidencia a conservar

Guardar en un lugar fuera del repositorio o en el ticket de validación:

```bash
node --version
npm --version
npm ls pi-harness @earendil-works/pi-coding-agent
npx yh-pi --version
git status --short
git rev-parse HEAD
```

También registrar:

- salida de `/harness-doctor`;
- salida de `/harness-overview` antes y durante una tarea;
- resultado de la recuperación;
- resultado de `npm test` y `npm run pack:check` en el checkout que produjo el tarball;
- problemas encontrados y pasos exactos para reproducirlos.

## 14. Limpieza

Si se usó una rama de prueba:

```bash
npm uninstall pi-harness
git status --short
```

Revisar antes de eliminar la rama que no haya cambios del proyecto real mezclados con la prueba. Conservar `.harness/tasks` si se necesita como evidencia; no borrarlo automáticamente.

## Criterio de éxito

La prueba local es satisfactoria cuando:

- el tarball se instala como dependencia normal;
- `yh-pi` inicia desde `node_modules` sin Pi global;
- doctor, overview y changes muestran el contexto correcto;
- simple y task respetan los gates humanos;
- task se recupera después de reiniciar Pi;
- SDD no crea artefactos cuando OpenSpec falta;
- MCP queda deshabilitado por defecto y no inicia conexiones;
- no se pierden ni sobrescriben cambios existentes del proyecto consumidor.
