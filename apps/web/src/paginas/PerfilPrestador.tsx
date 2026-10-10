import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  formatearTelefono,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MINIMO_DESCRIPCION,
  normalizarTelefono,
  RADIO_MAXIMO_KM,
  RADIO_MINIMO_KM,
} from "@localcl/shared";
import { clienteApi, ErrorApi, type ClienteApi, type Comuna } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton, clasesBoton } from "../componentes/Boton";
import { CampoAreaTexto } from "../componentes/CampoAreaTexto";
import { CampoTexto } from "../componentes/CampoTexto";
import { Pagina } from "../componentes/Pagina";
import { SelectorComuna } from "../componentes/SelectorComuna";
import { VerificacionIdentidad } from "../componentes/VerificacionIdentidad";

const RADIO_POR_DEFECTO = "10";

interface Formulario {
  comunaId: string;
  descripcion: string;
  telefono: string;
  radio: string;
}

/**
 * Comprueba en el navegador lo mismo que la API, con los límites de
 * @localcl/shared. Es comodidad: avisa sin esperar la respuesta del servidor.
 * La validación que manda es la de la API, que además sabe si la comuna existe.
 */
function validar(formulario: Formulario): Record<string, string> {
  const errores: Record<string, string> = {};
  const descripcion = formulario.descripcion.trim();
  const radio = Number(formulario.radio);

  if (!formulario.comunaId) {
    errores.comunaId = "Selecciona una comuna.";
  }

  if (descripcion.length < LARGO_MINIMO_DESCRIPCION) {
    errores.descripcion = `La descripción debe tener al menos ${LARGO_MINIMO_DESCRIPCION} caracteres.`;
  } else if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) {
    errores.descripcion = `La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION} caracteres.`;
  }

  if (!normalizarTelefono(formulario.telefono)) {
    errores.telefono = "Ingresa un celular chileno, por ejemplo 9 1234 5678.";
  }

  if (!Number.isInteger(radio) || radio < RADIO_MINIMO_KM || radio > RADIO_MAXIMO_KM) {
    errores.radioAtencionKm = `Indica un número entero entre ${RADIO_MINIMO_KM} y ${RADIO_MAXIMO_KM} km.`;
  }

  return errores;
}

export default function PaginaPerfilPrestador({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const { usuario } = useAuth();

  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [cargandoComunas, setCargandoComunas] = useState(true);
  // null mientras no se sabe; después, si ya existe un perfil guardado.
  const [tienePerfil, setTienePerfil] = useState<boolean | null>(null);

  const [formulario, setFormulario] = useState<Formulario>({
    comunaId: "",
    descripcion: "",
    telefono: "",
    radio: RADIO_POR_DEFECTO,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let cancelado = false;

    cliente
      .listarComunas()
      .then((lista) => {
        if (!cancelado) setComunas(lista);
      })
      .catch(() => {
        if (!cancelado) setErrorGeneral("No fue posible cargar las comunas. Recarga la página.");
      })
      .finally(() => {
        if (!cancelado) setCargandoComunas(false);
      });

    cliente
      .obtenerMiPerfilPrestador()
      .then((perfil) => {
        if (cancelado) return;
        setTienePerfil(perfil !== null);

        if (perfil) {
          setFormulario({
            comunaId: String(perfil.comuna.id),
            descripcion: perfil.descripcion,
            telefono: formatearTelefono(perfil.telefono),
            radio: String(perfil.radioAtencionKm),
          });
        }
      })
      .catch(() => {
        if (!cancelado) setErrorGeneral("No fue posible cargar tu perfil. Recarga la página.");
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  function cambiar(campo: keyof Formulario) {
    return (valor: string) => {
      setFormulario((actual) => ({ ...actual, [campo]: valor }));
      setGuardado(false);
    };
  }

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setGuardado(false);

    const encontrados = validar(formulario);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);

    try {
      const perfil = await cliente.guardarMiPerfilPrestador({
        descripcion: formulario.descripcion.trim(),
        // validar() ya comprobó que se puede normalizar.
        telefono: normalizarTelefono(formulario.telefono) ?? formulario.telefono,
        comunaId: Number(formulario.comunaId),
        radioAtencionKm: Number(formulario.radio),
      });

      setFormulario((actual) => ({ ...actual, telefono: formatearTelefono(perfil.telefono) }));
      setTienePerfil(true);
      setGuardado(true);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "DATOS_INVALIDOS") {
        setErrores(Object.fromEntries(error.detalles.map((detalle) => [detalle.campo, detalle.mensaje])));
      } else if (error instanceof ErrorApi) {
        setErrorGeneral(error.message);
      } else {
        setErrorGeneral("No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  const telefonoNormalizado = normalizarTelefono(formulario.telefono);

  return (
    <Pagina titulo={tienePerfil === false ? "Completa tu perfil" : "Tu perfil de prestador"}>
      {tienePerfil === false && (
        <div className="mt-4 rounded-chico border border-borde bg-hielo/60 px-4 py-3 text-sm leading-relaxed text-noche">
          <p className="font-semibold">Sin perfil no puedes aparecer en las búsquedas.</p>
          <p className="mt-1 text-texto-suave">
            Los clientes buscan por comuna y por distancia: tu comuna y tu radio de atención deciden a
            quién le apareces, y tu teléfono es la forma de contactarte.
          </p>
        </div>
      )}

      {/* Solo si la API dijo explícitamente que no está confirmado. */}
      {usuario?.correoVerificado === false && (
        <div className="mt-4 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
          Confirma tu correo para poder guardar tu perfil. Busca el enlace que te enviamos al registrarte.
        </div>
      )}

      <form onSubmit={alEnviar} noValidate className="mt-2">
        {errorGeneral && (
          <p
            role="alert"
            className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {errorGeneral}
          </p>
        )}

        <SelectorComuna
          id="comunaId"
          comunas={comunas}
          cargando={cargandoComunas}
          valor={formulario.comunaId}
          alCambiar={cambiar("comunaId")}
          error={errores.comunaId}
        />

        <CampoAreaTexto
          id="descripcion"
          etiqueta="Descripción de tu servicio"
          valor={formulario.descripcion}
          alCambiar={cambiar("descripcion")}
          minimo={LARGO_MINIMO_DESCRIPCION}
          maximo={LARGO_MAXIMO_DESCRIPCION}
          error={errores.descripcion}
          ayuda={`Qué haces, tu experiencia y lo que te distingue. Mínimo ${LARGO_MINIMO_DESCRIPCION} caracteres.`}
        />

        <CampoTexto
          id="telefono"
          etiqueta="Teléfono celular"
          tipo="tel"
          inputMode="tel"
          autoComplete="tel-national"
          valor={formulario.telefono}
          alCambiar={cambiar("telefono")}
          error={errores.telefono}
          ayuda="Por ejemplo 9 1234 5678. Es como te contactarán los clientes."
          // Igual que el RUT en el registro: muestra cómo quedará guardado.
          valido={telefonoNormalizado ? `Se guardará como ${formatearTelefono(telefonoNormalizado)}` : undefined}
        />

        <CampoTexto
          id="radioAtencionKm"
          etiqueta="Radio de atención (km)"
          tipo="number"
          inputMode="numeric"
          autoComplete="off"
          valor={formulario.radio}
          alCambiar={cambiar("radio")}
          error={errores.radioAtencionKm}
          ayuda={`Hasta cuántos kilómetros te desplazas desde tu comuna (${RADIO_MINIMO_KM} a ${RADIO_MAXIMO_KM}).`}
        />

        {guardado && (
          <p
            role="status"
            className="motion-safe:animate-aparecer-corto mt-6 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
          >
            Tu perfil quedó guardado.
          </p>
        )}

        <Boton type="submit" cargando={enviando} disabled={cargandoComunas} className="mt-7">
          {enviando ? "Guardando…" : "Guardar perfil"}
        </Boton>
      </form>

      {/* La API pide el perfil antes de aceptar la cédula: se ofrece recién cuando existe. */}
      {tienePerfil && <VerificacionIdentidad cliente={cliente} />}

      <Link to="/perfil" className={`mt-6 ${clasesBoton("secundario")}`}>
        Volver a mi cuenta
      </Link>
    </Pagina>
  );
}
