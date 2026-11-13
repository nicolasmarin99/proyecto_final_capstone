-- Búsqueda semántica: cada servicio guarda un vector de su significado.
--
-- El vector se calcula al publicar o editar el servicio (nunca al buscar) a
-- partir de título + descripción + categoría (servicios.indexacion.ts). Al
-- buscar solo se vectoriza la consulta y se compara por distancia de coseno.
--
-- Nada de esto reemplaza la búsqueda de texto completo (columna busqueda,
-- índice GIN): las dos se combinan en el buscador.

-- pgvector. Neon lo trae; en local lo instala infra/postgres/Dockerfile y en
-- la integración continua un paso de ci.yml.
CREATE EXTENSION IF NOT EXISTS vector;

-- 768 dimensiones: el tamaño reducido recomendado de gemini-embedding-001.
-- Nulable: un servicio sin vector (aún no calculado, o el proveedor falló al
-- publicarlo) sigue siendo un servicio válido y aparece por texto.
ALTER TABLE "servicios"
  ADD COLUMN "embedding" vector(768),
  -- SHA-256 del texto fuente y del proveedor que lo vectorizó. Si al editar
  -- no cambió, no se vuelve a llamar al proveedor.
  ADD COLUMN "embedding_texto_hash" TEXT,
  ADD COLUMN "embedding_actualizado_en" TIMESTAMP(3);

-- Los tres van juntos: un vector sin hash no se podría saber si está al día,
-- y un hash sin vector diría que hay algo que no hay.
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_embedding_coherente" CHECK (
  ("embedding" IS NULL) = ("embedding_texto_hash" IS NULL)
  AND ("embedding" IS NULL) = ("embedding_actualizado_en" IS NULL)
);

-- Índice aproximado de vecinos cercanos con distancia de coseno (operador
-- <=>). Con pocos servicios PostgreSQL prefiere recorrer la tabla, que es
-- exacto y igual de rápido; el índice entra en juego cuando el catálogo
-- crece. Los valores por defecto (m = 16, ef_construction = 64) bastan.
CREATE INDEX "servicios_embedding_hnsw_idx" ON "servicios" USING hnsw ("embedding" vector_cosine_ops);
