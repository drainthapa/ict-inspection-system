import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import WardsPage from './pages/WardsPage.jsx';
import WardDetailPage from './pages/WardDetailPage.jsx';
import EquipmentPage from './pages/EquipmentPage.jsx';
import EquipmentDetailPage from './pages/EquipmentDetailPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import InspectionFormPage from './pages/InspectionFormPage.jsx';
import InspectionsPage from './pages/InspectionsPage.jsx';
import InspectionDetailPage from './pages/InspectionDetailPage.jsx';
import MaintenancePage from './pages/MaintenancePage.jsx';
import MaintenanceDetailPage from './pages/MaintenanceDetailPage.jsx';
import ReplacementsPage from './pages/ReplacementsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import { ForbiddenPage, NotFoundPage } from './pages/StatusPages.jsx';
import { ROLES } from './utils/roles.js';


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="wards" element={<WardsPage />} />
          <Route path="wards/:id" element={<WardDetailPage />} />
          <Route path="equipment" element={<EquipmentPage />} />
          <Route path="equipment/:id" element={<EquipmentDetailPage />} />
          <Route path="inspections" element={<InspectionsPage />} />
          <Route path="inspections/:id" element={<InspectionDetailPage />} />
          <Route element={<ProtectedRoute roles={[ROLES.SUPER_ADMIN, ROLES.INSPECTOR]} />}>
            <Route path="inspections/new" element={<InspectionFormPage key="new" />} />
            <Route path="inspections/:id/edit" element={<InspectionFormPage />} />
          </Route>
          <Route path="maintenance" element={<MaintenancePage key="records" mode="records" />} />
          <Route path="maintenance/requests" element={<MaintenancePage key="requests" mode="requests" />} />
          <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
          <Route path="replacements" element={<ReplacementsPage />} />
          <Route path="reports" element={<ReportsPage />} />

          <Route element={<ProtectedRoute roles={[ROLES.SUPER_ADMIN]} />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>


          <Route path="forbidden" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
