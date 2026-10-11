-- CreateTable
CREATE TABLE "prestadores_comunas" (
    "prestador_id" TEXT NOT NULL,
    "comuna_id" INTEGER NOT NULL,

    CONSTRAINT "prestadores_comunas_pkey" PRIMARY KEY ("prestador_id","comuna_id")
);

-- CreateIndex
CREATE INDEX "prestadores_comunas_comuna_id_idx" ON "prestadores_comunas"("comuna_id");

-- AddForeignKey
ALTER TABLE "prestadores_comunas" ADD CONSTRAINT "prestadores_comunas_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "perfiles_prestador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestadores_comunas" ADD CONSTRAINT "prestadores_comunas_comuna_id_fkey" FOREIGN KEY ("comuna_id") REFERENCES "comunas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

