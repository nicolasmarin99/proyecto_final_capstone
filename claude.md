# LocalCL — Instrucciones para agentes

## Qué es
Plataforma web y móvil para buscar prestadores de servicios en la RM,
con validación de credenciales contrastada contra registros oficiales.
Proyecto de título, Duoc UC. Tres perfiles: cliente, prestador, administrador.

## Stack (cerrado, no proponer alternativas)
Node 24 LTS · TypeScript · npm workspaces
API: Express + Prisma + PostgreSQL con PostGIS
Web: React + Vite + Tailwind · Móvil: React Native con Expo
Validación: Zod · Contraseñas: Argon2id · Pruebas: Vitest + Supertest

## Estructura
apps/api · apps/web · apps/mobile · packages/shared (tipos y esquemas Zod)

## Reglas de la API
- Capas: rutas → middlewares → controlador → servicio → repositorio.
- El servicio no conoce HTTP: no recibe req ni res.
- Toda entrada se valida con Zod, con el esquema en packages/shared.
- Las consultas geoespaciales y de texto completo van con $queryRaw
  parametrizado. Nunca $queryRawUnsafe.

## Reglas de seguridad (no negociables)
- Nunca escribir secretos en el código ni leer el archivo .env.
- Contraseñas solo con hash Argon2id.
- Autorización verificada en el servidor, no solo en la interfaz.
- Los errores devueltos al cliente no exponen trazas internas.
- El estado de una credencial lo fija el servidor, nunca el cliente.

## Convenciones
- Código y comentarios en español; nombres de tablas en snake_case
  mediante @@map.
- Un cambio por rama; los mensajes de commit usan prefijos feat, fix, docs, chore.