import { Route, Routes } from "react-router";
import { RutaProtegida } from "./componentes/RutaProtegida";
import PaginaAdmin from "./paginas/Admin";
import PaginaEstado from "./paginas/Estado";
import PaginaIniciarSesion from "./paginas/IniciarSesion";
import PaginaPerfil from "./paginas/Perfil";
import PaginaRegistro from "./paginas/Registro";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaEstado />} />
      <Route path="/registro" element={<PaginaRegistro />} />
      <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
      <Route
        path="/perfil"
        element={
          <RutaProtegida>
            <PaginaPerfil />
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
