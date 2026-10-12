# Publicación de pi-harness en npm

## Qué implica

Publicar `pi-harness@0.1.0` lo convierte en un paquete públicamente instalable desde npm.

- El nombre actual es `pi-harness`; debe comprobarse su disponibilidad con `npm view pi-harness`.
- La combinación nombre + versión queda reservada. Una versión publicada no debe reutilizarse aunque luego se retire.
- Los cambios posteriores requieren una nueva versión (`0.1.1`, `0.2.0`, etc.).
- npm distribuirá el contenido definido por `files` en `package.json` y resolverá las dependencias declaradas.
- La publicación requiere autenticación npm y 2FA, o un token granular con bypass de 2FA.
- Your-Team-Knowledge no se publica ni se activa: la integración SQLite permanece opt-in y deshabilitada por defecto.

Referencias oficiales:

- [npm publish](https://docs.npmjs.com/cli/v6/commands/npm-publish/)
- [Autenticación 2FA de npm](https://docs.npmjs.com/about-two-factor-authentication/)
- [Paquetes públicos escopados](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)

## Pasos para publicar

Desde el commit candidato:

```bash
npm ci
npm test
npm run test:e2e:required
npm run pack:check
npm pack --dry-run
npm publish --dry-run
```

Comprobar el nombre y autenticarse:

```bash
npm view pi-harness
npm login
npm whoami
```

Publicar la versión candidata:

```bash
npm publish
```

`pi-harness` es actualmente un paquete no escopado, por lo que no necesita `--access public`. Para una versión prerelease puede utilizarse:

```bash
npm publish --tag next
```

Verificar el resultado:

```bash
npm view pi-harness version dist-tags
```

La publicación no debe automatizarse ni ejecutarse hasta contar con autorización explícita.

## Validación desde un consumidor limpio

```bash
mkdir prueba-pi-harness
cd prueba-pi-harness
npm init -y
npm install pi-harness@0.1.0
npx yh-pi --version
npx yh-pi
```

El consumidor debe usar Node.js `>=22.19.0` y npm. Pi no necesita estar instalado globalmente porque `pi-harness` declara `@earendil-works/pi-coding-agent` como dependencia y el binario `yh-pi` resuelve esa instalación.

## Uso por parte de un usuario

En el repositorio consumidor:

```bash
npm install pi-harness
npx yh-pi
```

También puede seleccionar perfil o modo:

```bash
npx yh-pi --profile developer
npx yh-pi --mode simple
npx yh-pi --mode task
npx yh-pi --mode sdd
```

Dentro de Pi puede utilizar:

```text
/harness-work Actualizar las validaciones del formulario
/harness-overview
/harness-doctor
/harness-changes
```

El flujo conserva clasificación, aprobación humana, artefactos en `.harness/tasks`, recuperación tras reinicio y las integraciones opcionales OpenSpec/MCP.

## Actualización y rollback

Actualizar a la versión publicada:

```bash
npm install pi-harness@latest
```

Volver a una versión conocida:

```bash
npm install pi-harness@0.1.0
```

Después de actualizar o volver atrás:

```bash
npm ls pi-harness @earendil-works/pi-coding-agent
npx yh-pi --version
```

Ejecutar `/harness-doctor` y conservar los artefactos `.harness/tasks`. Una actualización no debe borrar tareas, cambios OpenSpec ni la configuración del consumidor.

Si una llamada MCP queda con resultado `unknown`, confirmar primero el efecto remoto antes de reintentarla.

## Decisión actual

La versión candidata recomendada es `0.1.0`. Los gates técnicos están verdes, pero la publicación npm requiere autorización explícita. Este documento describe el procedimiento y no ejecuta ninguna publicación.
