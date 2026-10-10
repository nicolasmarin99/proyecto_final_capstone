import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlmacenamientoCloudinary,
  type ClienteCloudinary,
} from "../../src/modules/almacenamiento/almacenamiento.cloudinary.js";

/**
 * Doble del SDK que registra lo que se le pide. No prueba Cloudinary (eso
 * exige la cuenta real): prueba que el adaptador SIEMPRE pida lo correcto.
 */
function clienteFalso(resultadoDestroy: unknown = { result: "ok" }) {
  const subidas: { archivo: string; opciones: UploadApiOptions }[] = [];
  const borrados: { publicId: string; opciones: object }[] = [];
  const urls: { publicId: string; formato: string; opciones: { expires_at: number; type: string; attachment: boolean } }[] = [];

  const cliente: ClienteCloudinary = {
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
    utils: {
      private_download_url(publicId, formato, opciones) {
        urls.push({ publicId, formato, opciones });
        return `https://api.cloudinary.com/firmada/${publicId}`;
      },
    },
  };

  return { cliente, subidas, borrados, urls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AlmacenamientoCloudinary", () => {
  it("sube como recurso privado, con el id del servidor y en su carpeta", async () => {
    const { cliente, subidas } = clienteFalso();
    const almacenamiento = new AlmacenamientoCloudinary(cliente, "localcl/identidades");

    await almacenamiento.guardar({ id: "id-generado", contenido: Buffer.from([0xff, 0xd8, 0xff]), tipo: "jpg" });

    expect(subidas).toHaveLength(1);
    expect(subidas[0]?.archivo.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(subidas[0]?.opciones).toMatchObject({
      type: "private",
      resource_type: "image",
      public_id: "id-generado",
      asset_folder: "localcl/identidades",
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    });
  });

  it("la URL firmada pide un JPG (rasterizado), sin descarga, y vence a los 5 minutos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    const { cliente, urls } = clienteFalso();
    const almacenamiento = new AlmacenamientoCloudinary(cliente, "carpeta");

    await almacenamiento.urlFirmada("id-generado", 300);

    expect(urls[0]).toEqual({
      publicId: "id-generado",
      formato: "jpg",
      opciones: {
        resource_type: "image",
        type: "private",
        attachment: false,
        expires_at: Math.floor(Date.parse("2026-10-10T12:05:00Z") / 1000),
      },
    });
  });

  it("eliminar borra el recurso privado e invalida la CDN", async () => {
    const { cliente, borrados } = clienteFalso();

    await new AlmacenamientoCloudinary(cliente, "carpeta").eliminar("id-generado");

    expect(borrados).toEqual([
      { publicId: "id-generado", opciones: { resource_type: "image", type: "private", invalidate: true } },
    ]);
  });

  it("eliminar algo que ya no está no es un error (se puede reintentar)", async () => {
    const { cliente } = clienteFalso({ result: "not found" });

    await expect(new AlmacenamientoCloudinary(cliente, "carpeta").eliminar("id")).resolves.toBeUndefined();
  });

  it("si Cloudinary no confirma la eliminación, falla en vez de callar", async () => {
    const { cliente } = clienteFalso({ result: "error" });

    await expect(new AlmacenamientoCloudinary(cliente, "carpeta").eliminar("id")).rejects.toThrow(
      /no confirmó la eliminación/,
    );
  });
});
