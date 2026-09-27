-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('VERIFICACION_CORREO', 'RECUPERACION_CONTRASENA');

-- CreateTable
CREATE TABLE "tokens_cuenta" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoToken" NOT NULL,
    "hashToken" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_cuenta_hashToken_key" ON "tokens_cuenta"("hashToken");

-- CreateIndex
CREATE INDEX "tokens_cuenta_usuarioId_tipo_idx" ON "tokens_cuenta"("usuarioId", "tipo");

-- CreateIndex
CREATE INDEX "tokens_cuenta_expiraEn_idx" ON "tokens_cuenta"("expiraEn");

-- AddForeignKey
ALTER TABLE "tokens_cuenta" ADD CONSTRAINT "tokens_cuenta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
