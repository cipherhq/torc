import { createBrowserRouter, Navigate } from "react-router";
import { Splash } from "./pages/auth/Splash";
import { Login } from "./pages/auth/Login";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { UsersManagement } from "./pages/admin/UsersManagement";
import { ProvidersManagement } from "./pages/admin/ProvidersManagement";
import { JobsManagement } from "./pages/admin/JobsManagement";
import { Analytics } from "./pages/admin/Analytics";
import { AppSelector } from "./pages/AppSelector";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Splash,
  },
  {
    path: "/apps",
    Component: AppSelector,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/dashboard",
    Component: AdminDashboard,
  },
  {
    path: "/users",
    Component: UsersManagement,
  },
  {
    path: "/providers",
    Component: ProvidersManagement,
  },
  {
    path: "/jobs",
    Component: JobsManagement,
  },
  {
    path: "/analytics",
    Component: Analytics,
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
