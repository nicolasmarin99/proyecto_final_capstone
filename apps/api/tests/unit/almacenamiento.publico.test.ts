import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { UploadApiOptions, UploadApiResponse, UrlOptions } from "cloudinary";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AlmacenamientoPublicoCloudinary,
  type ClienteCloudinaryPublico,
} from "../../src/modules/almacenamiento/almacenamiento.publico.cloudinary.js";
import { AlmacenamientoPublicoEnDisco } from "../../src/modules/almacenamiento/almacenamiento.publico.disco.js";

/** Doble del SDK que registra lo que se le pide, sin red. */
function clienteFalso(resultadoDestroy: unknown = { result: "ok" }) {
  const subidas: { archivo: string; opciones: UploadApiOptions }[] = [];
  const borrados: { publicId: string; opciones: object }[] = [];
  const urls: { publicId: string; opciones: UrlOptions }[] = [];

  const cliente: ClienteCloudinaryPublico = {
    uploader: {
      async upload(archivo, opciones) {
        subidas.push({ archivo, opciones });
        return {} as UploadApiResponse;
      },
      async destroy(publicId, opciones) {
        borrados.push({ publicId, opciones });
        return resultadoDestroy;
      },
    },
    url(publicId, opciones) {
      urls.push({ publicId, opciones });
      return `https://res.cloudinary.com/demo/image/upload/${publicId}`;
    },
  };

  return { cliente, subidas, borrados, urls };
}

describe("AlmacenamientoPublicoCloudinary", () => {
  it("sube como recurso PÚBLICO, con el id del servidor y en la carpeta de servicios", async () => {
    const { cliente, subidas } = clienteFalso();
    const almacenamiento = new AlmacenamientoPublicoCloudinary(cliente, "localcl/servicios");

    await almacenamiento.guardar({ id: "id-generado", contenido: Buffer.from("RIFF"), tipo: "webp" });

    expect(subidas).toHaveLength(1);
    expect(subidas[0]?.archivo.startsWith("data:image/webp;base64,")).toBe(true);
    expect(subidas[0]?.opciones).toMatchObject({
      resource_type: "image",
      type: "upload",
      public_id: "id-generado",
      asset_folder: "localcl/servicios",
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    });
    // Nunca la configuración de los documentos de identidad.
    expect(subidas[0]?.opciones.type).not.toBe("private");
    expect(subidas[0]?.opciones.asset_folder).not.toContain("identidades");
  });

  it("arma URL públicas sin firma: completa limitada y miniatura recortada", () => {
    const { cliente, urls } = clienteFalso();
    const almacenamiento = new AlmacenamientoPublicoCloudinary(cliente, "localcl/servicios");

    almacenamiento.url("id-1", "completa");
    almacenamiento.url("id-1", "miniatura");

    expect(urls.map((url) => url.opciones)).toEqual([
      expect.objectContaining({ secure: true, type: "upload", transformation: [{ width: 1600, crop: "limit" }, { fetch_format: "auto", quality: "auto" }] }),
      expect.objectContaining({
        secure: true,
        type: "upload",
        transformation: [{ width: 640, height: 480, crop: "fill", gravity: "auto" }, { fetch_format: "auto", quality: "auto" }],
      }),
    ]);
    expect(urls.every((url) => !("sign_url" in url.opciones))).toBe(true);
  });

  it.each(["ok", "not found"])("eliminar acepta «%s» e invalida la caché", async (resultado) => {
    const { cliente, borrados } = clienteFalso({ result: resultado });

    await new AlmacenamientoPublicoCloudinary(cliente, "localcl/servicios").eliminar("id-1");

    expect(borrados).toEqual([{ publicId: "id-1", opciones: { resource_type: "image", type: "upload", invalidate: true } }]);
  });

  it("eliminar falla si Cloudinary no lo confirma", async () => {
    const { cliente } = clienteFalso({ result: "error" });

    await expect(new AlmacenamientoPublicoCloudinary(cliente, "localcl/servicios").eliminar("id-1")).rejects.toThrow(/no confirmó/);
  });
});

describe("AlmacenamientoPublicoEnDisco", () => {
  let carpeta = "";

  beforeEach(async () => {
    carpeta = await mkdtemp(path.join(tmpdir(), "localcl-imagenes-"));
  });

  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it("guarda, lee y elimina por id, y la URL pasa por el proxy de la API", async () => {
    const almacenamiento = new AlmacenamientoPublicoEnDisco(carpeta);

    await almacenamiento.guardar({ id: "abc-123", contenido: Buffer.from("PNG"), tipo: "png" });

    expect(await readdir(carpeta)).toEqual(["abc-123.png"]);
    expect(await almacenamiento.leer("abc-123")).toEqual({ contenido: Buffer.from("PNG"), tipo: "png" });
    expect(almacenamiento.url("abc-123", "miniatura")).toBe("/api/imagenes-locales/abc-123");

    await almacenamiento.eliminar("abc-123");
    await almacenamiento.eliminar("abc-123");
    expect(await readdir(carpeta)).toEqual([]);
  });

  it("no pisa un archivo existente", async () => {
    const almacenamiento = new AlmacenamientoPublicoEnDisco(carpeta);
    await almacenamiento.guardar({ id: "repetido", contenido: Buffer.from("1"), tipo: "jpg" });

    await expect(almacenamiento.guardar({ id: "repetido", contenido: Buffer.from("2"), tipo: "jpg" })).rejects.toThrow();
  });

  it.each(["../secreto", "..%2F..%2Fetc", "a/b", "con espacio", ""])("no lee ni escribe fuera de su carpeta: «%s»", async (id) => {
    const almacenamiento = new AlmacenamientoPublicoEnDisco(carpeta);

    expect(await almacenamiento.leer(id)).toBeNull();
    await expect(almacenamiento.guardar({ id, contenido: Buffer.from("x"), tipo: "jpg" })).rejects.toThrow(/no válido/);
  });
});
