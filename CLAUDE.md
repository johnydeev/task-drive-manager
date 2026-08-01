@AGENTS.md

## Convenciones de código

- TypeScript estricto, sin `any`. Validación con Zod en cliente y en API routes.
- Errores de API: `{ error: string }` con status HTTP apropiado.
- Naming: PascalCase componentes, camelCase funciones, kebab-case archivos.
- El campo `Dpto`/ubicación es **obligatorio** siempre (un dpto, o una parte común específica).
- **Tests + estructura escalable:** ver [docs/CONTRIBUTING-tests.md](docs/CONTRIBUTING-tests.md)
  (lógica en hooks finos, tests colocados, feature-folders, `withAuth`, schema único).
