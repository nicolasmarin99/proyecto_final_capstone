import { Navigate, Route, Routes } from "react-router";
import { AreaPrestador } from "./componentes/AreaPrestador";
import { ConEncabezado } from "./componentes/Encabezado";
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
import PaginaServicio from "./paginas/Servicio";
import PaginaVerificarCorreo from "./paginas/VerificarCorreo";
import PaginaEditorServicio from "./paginas/mi/EditorServicio";
import PaginaMiIdentidad from "./paginas/mi/MiIdentidad";
import PaginaMiPerfil from "./paginas/mi/MiPerfil";
import PaginaMisServicios from "./paginas/mi/MisServicios";

export default function App() {
  return (
    <Routes>
      {/* Todas las páginas comparten el encabezado con la sesión. */}
      <Route element={<ConEncabezado />}>
        <Route path="/" element={<PaginaInicio />} />
        <Route path="/buscar" element={<PaginaBuscar />} />
        {/* Pública: la ve cualquiera. Solo el contacto exige sesión. */}
        <Route path="/servicios/:id" element={<PaginaServicio />} />
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
        {/*
          Área del prestador. roles es comodidad: le evita a un cliente
          pantallas que no le sirven. Quien rechaza de verdad es
          autorizar(PRESTADOR) en la API.
        */}
        <Route
          path="/mi"
          element={
            <RutaProtegida roles={["PRESTADOR"]}>
              <AreaPrestador />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="/mi/perfil" replace />} />
          <Route path="perfil" element={<PaginaMiPerfil />} />
          <Route path="identidad" element={<PaginaMiIdentidad />} />
          <Route path="servicios" element={<PaginaMisServicios />} />
          <Route path="servicios/nuevo" element={<PaginaEditorServicio />} />
          <Route path="servicios/:id/editar" element={<PaginaEditorServicio />} />
        </Route>
        {/* Dirección anterior: hay enlaces y marcadores que todavía la usan. */}
        <Route path="/perfil-prestador" element={<Navigate to="/mi/perfil" replace />} />
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
      </Route>
    </Routes>
  );
}
