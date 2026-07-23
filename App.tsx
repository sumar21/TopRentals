import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { Loader } from './components/ui/Loader';
import { canAccessTecnico, isTecnicoOnly } from './utils/permissions';
import Layout from './components/Layout';
import LayoutTecnico from './components/LayoutTecnico';
import Login from './components/Login';
import HomeView from './components/home/HomeView';
import StockView from './components/stock/StockView';
import SalidasStockView from './components/stock/SalidasStockView';
import OrdenesTrabajoView from './components/ordenes/OrdenesTrabajoView';
import ComprasView from './components/compras/ComprasView';
import AprobacionesView from './components/aprobaciones/AprobacionesView';
import VentilacionesView from './components/ventilaciones/VentilacionesView';
import ConfiguracionView from './components/configuracion/ConfiguracionView';
import HomeTecnicoView from './components/tecnico/HomeTecnicoView';
import OrdenesTecnicoView from './components/tecnico/OrdenesTecnicoView';
import ActivosView from './components/tecnico/ActivosView';
import StockTecnicoView from './components/tecnico/StockTecnicoView';
import VentilacionesTecnicoView from './components/tecnico/VentilacionesTecnicoView';

const FullPageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader size="lg" text="Cargando…" />
  </div>
);

/** Session gate shared by both modules. */
const RequireSession = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/** Back-office: any perfil except Tecnico (mirrors the PA desktop login block). */
const BackOffice = () => {
  const { user } = useAuth();
  if (user && isTecnicoOnly(user.perfil)) return <Navigate to="/tecnico" replace />;
  return <Layout />;
};

/** Technician module: Tecnico + Admin only. */
const Tecnico = () => {
  const { user } = useAuth();
  if (user && !canAccessTecnico(user.perfil)) return <Navigate to="/home" replace />;
  return <LayoutTecnico />;
};

const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={isTecnicoOnly(user.perfil) ? '/tecnico' : '/home'} replace />;
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireSession>
                <Outlet />
              </RequireSession>
            }
          >
            {/* Back-office */}
            <Route element={<BackOffice />}>
              <Route path="/home" element={<HomeView />} />
              <Route path="/stock" element={<StockView />} />
              <Route path="/salidas-stock" element={<SalidasStockView />} />
              <Route path="/ordenes-trabajo" element={<OrdenesTrabajoView />} />
              <Route path="/compras" element={<ComprasView />} />
              <Route path="/aprobaciones" element={<AprobacionesView />} />
              <Route path="/ventilaciones" element={<VentilacionesView />} />
              <Route path="/abm" element={<ConfiguracionView />} />
            </Route>

            {/* Módulo técnico */}
            <Route path="/tecnico" element={<Tecnico />}>
              <Route index element={<HomeTecnicoView />} />
              <Route path="ot" element={<OrdenesTecnicoView />} />
              <Route path="activos" element={<ActivosView />} />
              <Route path="stock" element={<StockTecnicoView />} />
              <Route path="ventilaciones" element={<VentilacionesTecnicoView />} />
            </Route>
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
