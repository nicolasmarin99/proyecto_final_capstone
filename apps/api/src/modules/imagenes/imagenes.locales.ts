import { Router } from "express";
import { AlmacenamientoPublicoEnDisco, obtenerAlmacenamientoPublico, TIPO_MIME_IMAGEN } from "../almacenamiento/index.js";

/**
 * Sirve las imágenes guardadas en disco, SOLO en desarrollo local. Con
 * cualquier otro almacenamiento (memoria en las pruebas, Cloudinary en
 * producción) responde 404: las URL públicas apuntan al proveedor.
 *
 * El id se valida en el adaptador (solo letras, dígitos y guiones), así que
 * no hay forma de pedir un archivo fuera de la carpeta.
 */
export const rutasImagenesLocales = Router();

rutasImagenesLocales.get("/:id", async (req, res) => {
  const almacenamiento = obtenerAlmacenamientoPublico();
  const imagen = almacenamiento instanceof AlmacenamientoPublicoEnDisco ? await almacenamiento.leer(req.params.id) : null;

  if (!imagen) {
    res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Recurso no encontrado" } });
    return;
  }

  res.set({
    "Content-Type": TIPO_MIME_IMAGEN[imagen.tipo],
    // Que el navegador no adivine otro tipo a partir del contenido.
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
  });
  res.send(imagen.contenido);
});
