import { Route, Routes } from "react-router";
import { RutaProtegida } from "./componentes/RutaProtegida";
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
    </Routes>
  );
}
