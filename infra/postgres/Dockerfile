# PostgreSQL 17 con PostGIS (la imagen oficial de PostGIS) más pgvector.
#
# La imagen postgis/postgis no trae pgvector, y la búsqueda semántica lo
# necesita (columna servicios.embedding de tipo vector(768) e índice HNSW).
# Se instala desde el repositorio oficial de PostgreSQL, con la misma llave
# de firma que la imagen base ya trae: es el mismo paquete que usan los
# proveedores administrados, no un binario de terceros.
#
# postgis/postgis:17-3.5 está construida sobre Debian 11 (bullseye), que el
# repositorio principal (apt.postgresql.org) ya no publica: sus paquetes
# pasaron al archivo histórico (apt-archive.postgresql.org). Por eso se
# reemplaza la fuente. No se cambia de imagen base para no mover la versión
# de glibc bajo los datos que ya existen en el volumen (cambiaría el orden
# de las intercalaciones y obligaría a reindexar).
#
# Producción (Neon) ya incluye pgvector: esta imagen es solo para desarrollo
# local. La integración continua instala el mismo paquete en su contenedor
# (ver .github/workflows/ci.yml).
FROM postgis/postgis:17-3.5

RUN echo "deb [ signed-by=/usr/local/share/keyrings/postgres.gpg.asc ] http://apt-archive.postgresql.org/pub/repos/apt bullseye-pgdg-archive main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-pgvector \
 && rm -rf /var/lib/apt/lists/*
