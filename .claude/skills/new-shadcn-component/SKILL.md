---
name: new-shadcn-component
description: Agrega un componente shadcn/ui usando el CLI con la config de components.json del proyecto, lo coloca en components/ui y verifica que importe correctamente.
disable-model-invocation: true
---

# new-shadcn-component

Skill invocable solo por el usuario (`/new-shadcn-component <nombre>` ej: `/new-shadcn-component dialog`).

## Contexto

- Versión: `shadcn` v4 (en package.json).
- Config: `components.json` en raíz.
- Destino por convención: `components/ui/<name>.tsx`.
- Estilos: Tailwind 4 + `tw-animate-css` + `tailwind-merge` + `clsx` (ya instalados).

## Pasos

1. **Validar nombre**: lowercase, kebab-case, único componente shadcn oficial. Si el usuario pide algo no estándar, sugerir el nombre correcto.

2. **Verificar que no exista ya**
   - `ls components/ui/<name>.tsx` — si existe, preguntar si sobreescribir.

3. **Ejecutar CLI**
   ```bash
   npx shadcn@latest add <name>
   ```
   - Confirma que `components.json` esté presente; si no, abortar y avisar.

4. **Post-install**
   - Listar archivos creados/modificados.
   - Si el componente requiere deps nuevas, mencionarlas (NO instalar sin avisar — regla del proyecto).
   - Generar un snippet de uso mínimo que el usuario puede pegar.

5. **Smoke check**
   - `npx tsc --noEmit` para confirmar que el nuevo archivo compila con el resto.

## NO hacer

- No mezclar versiones (mantener `shadcn` v4).
- No instalar componentes que no son del registry oficial sin confirmar.
- No editar `components.json` salvo que el usuario lo pida.
