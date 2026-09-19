import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /health", () => {
  it("responde 200 con la base de datos en ok", async () => {
    const respuesta = await request(app).get("/health");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.baseDatos).toBe("ok");
  });
});
