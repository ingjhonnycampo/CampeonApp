import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';
import { ConfiguracionProvider } from './context/ConfiguracionContext';
import InstalarApp from './components/InstalarApp';
import RutaProtegida from './components/RutaProtegida';
import CargaJugador from './components/CargaJugador';
import Login from './pages/Login';
import DashboardPlaceholder from './pages/DashboardPlaceholder';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCampeonatos from './pages/admin/AdminCampeonatos';
import AdminUsuarios from './pages/admin/AdminUsuarios';
import AdminFixture from './pages/admin/AdminFixture';
import AdminDisciplina from './pages/admin/AdminDisciplina';
import InscripcionPublica from './pages/publico/InscripcionPublica';
import MiInscripcion from './pages/publico/MiInscripcion';
import PartidoPublico from './pages/publico/PartidoPublico';
import PartidosPublico from './pages/publico/PartidosPublico';
import TorneosEnVivo from './pages/publico/TorneosEnVivo';
import ImprimirEquipos from './pages/admin/ImprimirEquipos';
import ImprimirEquipo from './pages/admin/ImprimirEquipo';
import ImprimirFixture from './pages/admin/ImprimirFixture';
import ImprimirJornada from './pages/admin/ImprimirJornada';
import ImprimirCuadro from './pages/admin/ImprimirCuadro';
import AdminBitacora from './pages/admin/AdminBitacora';
import ArbitroDashboard from './pages/arbitro/ArbitroDashboard';
import PlanillaPartido from './pages/arbitro/PlanillaPartido';
import ImprimirInformePartido from './pages/arbitro/ImprimirInformePartido';

function Inicio() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <CargaJugador />;
  if (!usuario) return <Navigate to="/login" replace />;
  const destino = { admin: '/admin', organizador: '/admin', arbitro: '/arbitro', delegado: '/delegado' }[usuario.rol];
  return <Navigate to={destino} replace />;
}

export default function App() {
  return (
    <ModalProvider>
      <AuthProvider>
        <ConfiguracionProvider>
          <BrowserRouter>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/inscripcion/:slug" element={<InscripcionPublica />} />
            <Route path="/mi-inscripcion" element={<MiInscripcion />} />
            <Route path="/partido/:partidoId" element={<PartidoPublico />} />
            <Route path="/en-vivo" element={<TorneosEnVivo />} />
            <Route path="/en-vivo/:slug" element={<PartidosPublico />} />
            <Route path="/admin" element={<RutaProtegida roles={['admin', 'organizador']}><AdminDashboard /></RutaProtegida>} />
            <Route path="/admin/campeonatos" element={<RutaProtegida roles={['admin', 'organizador']}><AdminCampeonatos /></RutaProtegida>} />
            <Route path="/admin/usuarios" element={<RutaProtegida roles={['admin']}><AdminUsuarios /></RutaProtegida>} />
            <Route path="/admin/fixture" element={<RutaProtegida roles={['admin', 'organizador']}><AdminFixture /></RutaProtegida>} />
            <Route path="/admin/disciplina" element={<RutaProtegida roles={['admin', 'organizador']}><AdminDisciplina /></RutaProtegida>} />
            <Route path="/admin/imprimir/torneo/:torneoId" element={<RutaProtegida roles={['admin', 'organizador']}><ImprimirEquipos /></RutaProtegida>} />
            <Route path="/admin/imprimir/equipo/:equipoId" element={<RutaProtegida roles={['admin', 'organizador']}><ImprimirEquipo /></RutaProtegida>} />
            <Route path="/admin/imprimir/fixture/:torneoId" element={<RutaProtegida roles={['admin', 'organizador']}><ImprimirFixture /></RutaProtegida>} />
            <Route path="/admin/imprimir/jornada/:torneoId/:jornada" element={<RutaProtegida roles={['admin', 'organizador']}><ImprimirJornada /></RutaProtegida>} />
            <Route path="/admin/imprimir/cuadro/:torneoId" element={<RutaProtegida roles={['admin', 'organizador']}><ImprimirCuadro /></RutaProtegida>} />
            <Route path="/admin/bitacora" element={<RutaProtegida roles={['admin']}><AdminBitacora /></RutaProtegida>} />
            <Route path="/arbitro" element={<RutaProtegida roles={['admin', 'organizador', 'arbitro']}><ArbitroDashboard /></RutaProtegida>} />
            <Route path="/arbitro/planilla/:partidoId" element={<RutaProtegida roles={['admin', 'organizador', 'arbitro']}><PlanillaPartido /></RutaProtegida>} />
            <Route path="/arbitro/informe/:partidoId" element={<RutaProtegida roles={['admin', 'organizador', 'arbitro']}><ImprimirInformePartido /></RutaProtegida>} />
            <Route path="/delegado" element={<RutaProtegida roles={['delegado']}><DashboardPlaceholder /></RutaProtegida>} />
            <Route path="/" element={<Inicio />} />
            </Routes>
            <InstalarApp />
          </BrowserRouter>
        </ConfiguracionProvider>
      </AuthProvider>
    </ModalProvider>
  );
}
