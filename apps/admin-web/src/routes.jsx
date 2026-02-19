import { createBrowserRouter, Navigate } from "react-router";
import { Splash } from "./pages/auth/Splash";
import { Login } from "./pages/auth/Login";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminUsers } from "./pages/admin/Users";
import { AdminProviders } from "./pages/admin/Providers";
import { AdminJobs } from "./pages/admin/Jobs";
import { AdminAnalytics } from "./pages/admin/Analytics";
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
    path: "/admin",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: "/users",
    Component: AdminUsers,
  },
  {
    path: "/providers",
    Component: AdminProviders,
  },
  {
    path: "/jobs",
    Component: AdminJobs,
  },
  {
    path: "/analytics",
    Component: AdminAnalytics,
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
