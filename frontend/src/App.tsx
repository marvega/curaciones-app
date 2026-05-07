import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import NewPatientPage from './pages/NewPatientPage';
import PatientPage from './pages/PatientPage';
import AgendaPage from './pages/AgendaPage';
import MonthlyReportPage from './pages/MonthlyReportPage';
import DetailedReportPage from './pages/DetailedReportPage';
import PatientsListPage from './pages/PatientsListPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import InventoryListPage from './pages/inventory/InventoryListPage';
import ReceptionPage from './pages/inventory/ReceptionPage';
import StockCountPage from './pages/inventory/StockCountPage';
import CatalogAdminPage from './pages/inventory/CatalogAdminPage';
import CanastaAdminPage from './pages/inventory/CanastaAdminPage';
import AuditExportPage from './pages/inventory/AuditExportPage';
import UiGalleryPage from './pages/dev/UiGalleryPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SessionsPage from './pages/account/SessionsPage';
import ChangePasswordPage from './pages/account/ChangePasswordPage';
import ConnectedAppsPage from './pages/account/ConnectedAppsPage';
import { ConsentScreen } from './pages/account/ConsentScreen';
import MembersPage from './pages/org/MembersPage';
import InvitationsPage from './pages/org/InvitationsPage';
import EstablishmentsPage from './pages/org/EstablishmentsPage';
import OrgSettingsPage from './pages/org/SettingsPage';

function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
    <ConfirmProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="pacientes" element={<PatientsListPage />} />
              <Route path="paciente/nuevo" element={<NewPatientPage />} />
              <Route path="paciente/:id" element={<PatientPage />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="reportes/mensual" element={<MonthlyReportPage />} />
              <Route path="reportes/detallado" element={<DetailedReportPage />} />
              <Route path="usuarios" element={<UsersPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
              <Route path="inventory" element={<InventoryListPage />} />
              <Route path="inventory/reception" element={<ReceptionPage />} />
              <Route path="inventory/count" element={<StockCountPage />} />
              <Route path="inventory/audit-export" element={<AuditExportPage />} />
              <Route path="inventory/admin/catalog" element={<CatalogAdminPage />} />
              <Route path="inventory/admin/canasta" element={<CanastaAdminPage />} />
              <Route path="account/sessions" element={<SessionsPage />} />
              <Route path="account/change-password" element={<ChangePasswordPage />} />
              <Route path="account/connected-apps" element={<ConnectedAppsPage />} />
              <Route path="account/oauth/consent" element={<ConsentScreen />} />
              <Route path="org/members" element={<MembersPage />} />
              <Route path="org/invitations" element={<InvitationsPage />} />
              <Route path="org/establishments" element={<EstablishmentsPage />} />
              <Route path="org/settings" element={<OrgSettingsPage />} />
              {import.meta.env.DEV && (
                <Route path="dev/ui" element={<UiGalleryPage />} />
              )}
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ConfirmProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
