import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
