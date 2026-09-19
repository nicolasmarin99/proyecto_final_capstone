-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'PRESTADOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "ProveedorAuth" AS ENUM ('LOCAL', 'GOOGLE', 'CLAVE_UNICA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "hashContrasena" TEXT,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "rutVerificado" BOOLEAN NOT NULL DEFAULT false,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "correoVerificado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidades" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "proveedor" "ProveedorAuth" NOT NULL,
    "sujetoExterno" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "hashToken" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "reemplazadaPor" TEXT,
    "agenteUsuario" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_rut_key" ON "usuarios"("rut");

-- CreateIndex
CREATE INDEX "usuarios_rol_idx" ON "usuarios"("rol");

-- CreateIndex
CREATE INDEX "identidades_usuarioId_idx" ON "identidades"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "identidades_proveedor_sujetoExterno_key" ON "identidades"("proveedor", "sujetoExterno");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_hashToken_key" ON "sesiones"("hashToken");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- CreateIndex
CREATE INDEX "sesiones_expiraEn_idx" ON "sesiones"("expiraEn");

-- AddForeignKey
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
