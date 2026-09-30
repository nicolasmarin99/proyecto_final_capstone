import { Route, Routes } from "react-router";
import { RutaProtegida } from "./componentes/RutaProtegida";
import PaginaAdmin from "./paginas/Admin";
import PaginaBuscar from "./paginas/Buscar";
import PaginaCambiarContrasena from "./paginas/CambiarContrasena";
import PaginaEstado from "./paginas/Estado";
import PaginaIniciarSesion from "./paginas/IniciarSesion";
import PaginaInicio from "./paginas/Inicio";
import PaginaPerfil from "./paginas/Perfil";
import PaginaRecuperarCuenta from "./paginas/RecuperarCuenta";
import PaginaRegistro from "./paginas/Registro";
import PaginaRegistroPrestador from "./paginas/RegistroPrestador";
import PaginaRestablecerContrasena from "./paginas/RestablecerContrasena";
import PaginaRevisaTuCorreo from "./paginas/RevisaTuCorreo";
import PaginaVerificarCorreo from "./paginas/VerificarCorreo";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaInicio />} />
      <Route path="/buscar" element={<PaginaBuscar />} />
      <Route path="/estado" element={<PaginaEstado />} />
      <Route path="/registro" element={<PaginaRegistro />} />
      <Route path="/registro-prestador" element={<PaginaRegistroPrestador />} />
      <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />

      {/*
        Rutas públicas a propósito: son los destinos de los enlaces que llegan
        por correo, y quien los abre normalmente NO tiene sesión iniciada.
        Las direcciones tienen que calzar exactamente con las que arma
        correo.plantillas.ts en la API.
      */}
      <Route path="/revisa-tu-correo" element={<PaginaRevisaTuCorreo />} />
      <Route path="/verificar-correo" element={<PaginaVerificarCorreo />} />
      <Route path="/recuperar-cuenta" element={<PaginaRecuperarCuenta />} />
      <Route path="/restablecer-contrasena" element={<PaginaRestablecerContrasena />} />

      <Route
        path="/perfil"
        element={
          <RutaProtegida>
            <PaginaPerfil />
          </RutaProtegida>
        }
      />
      <Route
        path="/cambiar-contrasena"
        element={
          <RutaProtegida>
            <PaginaCambiarContrasena />
          </RutaProtegida>
        }
      />
      {/*
        RutaProtegida solo exige sesión, no rol: quién puede ver el resumen lo
        decide el servidor con autorizar(). Si un cliente llega aquí, la API
        responde 403 y la página lo muestra como tal.
      */}
      <Route
        path="/admin"
        element={
          <RutaProtegida>
            <PaginaAdmin />
          </RutaProtegida>
        }
      />
    </Routes>
  );
}
