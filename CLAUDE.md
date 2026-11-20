# Contexto para trabajar en Alma Esencial (repo Ela-esencia)

Lee todo antes de tocar nada. Las notas completas del proyecto están en `AGENTS.md` (se cargan aquí abajo).

@AGENTS.md

## Quién es el desarrollador y cómo hablarle
- Es desarrollador (GADR Net) y trabaja solo desde Android con Termux. No tiene PC.
- Háblale en español, corto y sencillo, sin palabras técnicas de más. Primero haz o dile qué hacer; explica solo lo necesario.
- Los textos para sus clientes van claros y sin abreviaturas (nada de «c/u»; escribe «cada una»).

## Reglas de trabajo
- Nunca subas contraseñas, claves, tokens ni cadenas de conexión. Van en los secretos de Cloudflare o en `.dev.vars` (ese archivo no se sube).
- No borres datos reales ni hagas cambios que no se puedan deshacer en la base de datos sin preguntar antes.
- Para detener un proceso, usa su número (`kill <PID>`), nunca `pkill`.
- Antes de subir: `npm install`, `npm run build` (genera `src/routeTree.gen.ts`) y después `npx tsc --noEmit`.
- No subas `package-lock.json` (este repo no lo usa).

## Comandos para publicar (Termux)
- Sube tus cambios a la rama que te indique la sesión (`claude/…`), nunca directo a `main`.
- Al terminar, dale al desarrollador este comando completo, con el nombre real de la rama:
  ```
  cd ~/Ela-esencia && git fetch origin && git checkout main && git pull origin main && git merge --no-edit origin/<rama> && git push origin main
  ```
  (La carpeta en Termux se llama como el repositorio; si no existe, primero `git clone https://github.com/SRALEXANDERGADR/Ela-esencia.git ~/Ela-esencia`.)
- Cada push a `main` hace que Cloudflare publique solo (1 a 3 minutos) en https://almaesencial.gadrnet.workers.dev.
- Si no puedes subir a GitHub, prepara el cambio como parche (`git diff`) y dale los comandos para aplicarlo en `~/Ela-esencia`.
- Cuando termines algo importante, anótalo en este archivo para que la próxima sesión lo sepa sin leer el chat viejo.
