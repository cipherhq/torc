import { createBrowserRouter, Navigate } from "react-router";
import { Login } from "./pages/auth/Login";
import { AuthCallback } from "./pages/auth/AuthCallback";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminUsers } from "./pages/admin/Users";
import { AdminProviders } from "./pages/admin/Providers";
import { AdminJobs } from "./pages/admin/Jobs";
import { AdminAnalytics } from "./pages/admin/Analytics";
import { AdminSettings } from "./pages/admin/Settings";
import { AdminNotifications } from "./pages/admin/Notifications";
import { AdminPayouts } from "./pages/admin/Payouts";
import { AdminPayments } from "./pages/admin/Payments";
import { AdminFinance } from "./pages/admin/Finance";
import { AdminReporting } from "./pages/admin/Reporting";
import { AdminSupportTickets } from "./pages/admin/SupportTickets";
import { AdminAuditTrail } from "./pages/admin/AuditTrail";
import { AdminLiveDispatch } from "./pages/admin/LiveDispatch";
import { ProviderApproval as AdminProviderApproval } from "./pages/admin/ProviderApproval";
import { DocumentSettings as AdminDocumentSettings } from "./pages/admin/DocumentSettings";
import { AdminPayoutHistory } from "./pages/admin/PayoutHistory";
import { AdminServices } from "./pages/admin/Services";
import { AdminTeam } from "./pages/admin/Team";
import { AdminDirectory } from "./pages/admin/Directory";
import { AppSelector } from "./pages/AppSelector";
import { RouteErrorElement } from "./components/RouteErrorElement";
import { Outlet } from "react-router";

function RootLayout() {
  return <Outlet />;
}

export const router = createBrowserRouter(
  [
  {
    Component: RootLayout,
    errorElement: <RouteErrorElement />,
    children: [
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
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
    path: "/auth/callback",
    Component: AuthCallback,
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
    path: "/provider-approval",
    Component: AdminProviderApproval,
  },
  {
    path: "/jobs",
    Component: AdminJobs,
  },
  {
    path: "/live-dispatch",
    Component: AdminLiveDispatch,
  },
  {
    path: "/analytics",
    Component: AdminAnalytics,
  },
  {
    path: "/notifications",
    Component: AdminNotifications,
  },
  {
    path: "/settings",
    Component: AdminSettings,
  },
  {
    path: "/payouts",
    Component: AdminPayouts,
  },
  {
    path: "/payout-history",
    Component: AdminPayoutHistory,
  },
  {
    path: "/payments",
    Component: AdminPayments,
  },
  {
    path: "/finance",
    Component: AdminFinance,
  },
  {
    path: "/reporting",
    Component: AdminReporting,
  },
  {
    path: "/support-tickets",
    Component: AdminSupportTickets,
  },
  {
    path: "/audit-trail",
    Component: AdminAuditTrail,
  },
  {
    path: "/services",
    Component: AdminServices,
  },
  {
    path: "/documents",
    Component: AdminDocumentSettings,
  },
  {
    path: "/team",
    Component: AdminTeam,
  },
  {
    path: "/directory",
    Component: AdminDirectory,
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
    ],
  },
],
  { basename: '/' }
);
