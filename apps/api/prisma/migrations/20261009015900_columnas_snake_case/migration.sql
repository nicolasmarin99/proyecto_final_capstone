-- Pasa a snake_case las columnas, índices, restricciones y enums de las
-- tablas que ya existían en producción (identidad y acceso).
--
-- Por qué: PostgreSQL convierte a minúsculas todo identificador sin
-- comillas. Con columnas en camelCase, una consulta escrita a mano como
--   SELECT creadoEn FROM usuarios
-- falla ("column creadoen does not exist") y obliga a citar cada nombre.
-- En snake_case se escribe sin comillas, como cualquier SQL.
--
-- El código TypeScript no cambia: el esquema de Prisma mapea cada campo con
-- @map, así que el cliente sigue exponiendo creadoEn, usuarioId, etc.
--
-- Se escribe a mano con RENAME y no se deja a Prisma: Prisma lo generaría
-- como DROP COLUMN + ADD COLUMN, que borra los datos. RENAME solo cambia el
-- catálogo, no toca las filas, y es instantáneo aunque la tabla sea grande.

-- ─── Enums ──────────────────────────────────────────────────────────────────
ALTER TYPE "Rol" RENAME TO "rol";
ALTER TYPE "ProveedorAuth" RENAME TO "proveedor_auth";
ALTER TYPE "TipoToken" RENAME TO "tipo_token";

-- ─── usuarios ───────────────────────────────────────────────────────────────
ALTER TABLE "usuarios" RENAME COLUMN "hashContrasena" TO "hash_contrasena";
ALTER TABLE "usuarios" RENAME COLUMN "rutVerificado" TO "rut_verificado";
ALTER TABLE "usuarios" RENAME COLUMN "correoVerificado" TO "correo_verificado";
ALTER TABLE "usuarios" RENAME COLUMN "creadoEn" TO "creado_en";
ALTER TABLE "usuarios" RENAME COLUMN "actualizadoEn" TO "actualizado_en";

-- ─── identidades ────────────────────────────────────────────────────────────
ALTER TABLE "identidades" RENAME COLUMN "usuarioId" TO "usuario_id";
ALTER TABLE "identidades" RENAME COLUMN "sujetoExterno" TO "sujeto_externo";
ALTER TABLE "identidades" RENAME COLUMN "creadoEn" TO "creado_en";
ALTER INDEX "identidades_usuarioId_idx" RENAME TO "identidades_usuario_id_idx";
ALTER INDEX "identidades_proveedor_sujetoExterno_key" RENAME TO "identidades_proveedor_sujeto_externo_key";
ALTER TABLE "identidades" RENAME CONSTRAINT "identidades_usuarioId_fkey" TO "identidades_usuario_id_fkey";

-- ─── sesiones ───────────────────────────────────────────────────────────────
ALTER TABLE "sesiones" RENAME COLUMN "usuarioId" TO "usuario_id";
ALTER TABLE "sesiones" RENAME COLUMN "hashToken" TO "hash_token";
ALTER TABLE "sesiones" RENAME COLUMN "expiraEn" TO "expira_en";
ALTER TABLE "sesiones" RENAME COLUMN "revocadaEn" TO "revocada_en";
ALTER TABLE "sesiones" RENAME COLUMN "reemplazadaPor" TO "reemplazada_por";
ALTER TABLE "sesiones" RENAME COLUMN "agenteUsuario" TO "agente_usuario";
ALTER TABLE "sesiones" RENAME COLUMN "creadaEn" TO "creada_en";
ALTER INDEX "sesiones_hashToken_key" RENAME TO "sesiones_hash_token_key";
ALTER INDEX "sesiones_usuarioId_idx" RENAME TO "sesiones_usuario_id_idx";
ALTER INDEX "sesiones_expiraEn_idx" RENAME TO "sesiones_expira_en_idx";
ALTER TABLE "sesiones" RENAME CONSTRAINT "sesiones_usuarioId_fkey" TO "sesiones_usuario_id_fkey";

-- ─── tokens_cuenta ──────────────────────────────────────────────────────────
ALTER TABLE "tokens_cuenta" RENAME COLUMN "usuarioId" TO "usuario_id";
ALTER TABLE "tokens_cuenta" RENAME COLUMN "hashToken" TO "hash_token";
ALTER TABLE "tokens_cuenta" RENAME COLUMN "expiraEn" TO "expira_en";
ALTER TABLE "tokens_cuenta" RENAME COLUMN "usadoEn" TO "usado_en";
ALTER TABLE "tokens_cuenta" RENAME COLUMN "creadoEn" TO "creado_en";
ALTER INDEX "tokens_cuenta_hashToken_key" RENAME TO "tokens_cuenta_hash_token_key";
ALTER INDEX "tokens_cuenta_usuarioId_tipo_idx" RENAME TO "tokens_cuenta_usuario_id_tipo_idx";
ALTER INDEX "tokens_cuenta_expiraEn_idx" RENAME TO "tokens_cuenta_expira_en_idx";
ALTER TABLE "tokens_cuenta" RENAME CONSTRAINT "tokens_cuenta_usuarioId_fkey" TO "tokens_cuenta_usuario_id_fkey";
