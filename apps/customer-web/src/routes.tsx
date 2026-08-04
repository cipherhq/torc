import { createBrowserRouter } from "react-router";
import { Splash } from "./pages/auth/Splash";
import { UserIntro } from "./pages/auth/UserIntro";
import { RoleSelection } from "./pages/auth/RoleSelection";
import { Login } from "./pages/auth/Login";
import { Signup } from "./pages/auth/Signup";
import { Permissions } from "./pages/auth/Permissions";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { AuthCallback } from "./pages/auth/AuthCallback";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { HomeMap } from "./pages/customer/HomeMap";
import { WhoNeedsHelp } from "./pages/customer/WhoNeedsHelp";
import { ConfirmLocation } from "./pages/customer/ConfirmLocation";
import { ServiceSelection } from "./pages/customer/ServiceSelection";
import { ServiceDetails } from "./pages/customer/ServiceDetails";
import { ScheduleService } from "./pages/customer/ScheduleService";
import { PricingPayment } from "./pages/customer/PricingPayment";
import { Matching } from "./pages/customer/Matching";
import { LiveTracking } from "./pages/customer/LiveTracking";
import { ServiceCompletion } from "./pages/customer/ServiceCompletion";
import { Activity } from "./pages/customer/Activity";
import { JobDetail } from "./pages/customer/JobDetail";
import { Wallet } from "./pages/customer/Wallet";
import { Profile } from "./pages/customer/Profile";
import { ServiceHistory } from "./pages/customer/ServiceHistory";
import { PaymentMethods } from "./pages/customer/PaymentMethods";
import { Notifications } from "./pages/customer/Notifications";
import { HelpCenter } from "./pages/customer/HelpCenter";
import { Explore } from "./pages/customer/Explore";
import { ShopDetail } from "./pages/customer/ShopDetail";
import { PersonalInfo } from "./pages/customer/PersonalInfo";
import { Vehicles } from "./pages/customer/Vehicles";
import { AccountSecurity } from "./pages/customer/AccountSecurity";
import { CustomerMessages } from "./pages/customer/Messages";
import { CustomerReporting } from "./pages/customer/Reporting";
import { NotFound } from "./pages/NotFound";
import { Navigate } from "react-router";
import { AppSelector } from "./pages/AppSelector";

// Admin imports
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminJobs } from "./pages/admin/Jobs";
import { AdminProviders } from "./pages/admin/Providers";
import { AdminPayments } from "./pages/admin/Payments";
import { AdminDirectory } from "./pages/admin/Directory";
import { ProviderApproval } from "./pages/admin/ProviderApproval";
import { AdminPayouts } from "./pages/admin/Payouts";
import { DocumentSettings } from "./pages/admin/DocumentSettings";
import { AdminAnalytics } from "./pages/admin/Analytics";
import { AdminUsers } from "./pages/admin/Users";
import { AdminPayoutHistory } from "./pages/admin/PayoutHistory";
import { AdminServices } from "./pages/admin/Services";
import { AdminTeam } from "./pages/admin/Team";
import { AdminSettings } from "./pages/admin/Settings";
import { AdminLiveDispatch } from "./pages/admin/LiveDispatch";
import { AdminSupportTickets } from "./pages/admin/SupportTickets";
import { AdminFinance } from "./pages/admin/Finance";
import { AdminAuditTrail } from "./pages/admin/AuditTrail";
import { AdminReporting } from "./pages/admin/Reporting";

// Website imports
import { WebsiteHome } from "./pages/website/Home";
import { WebsiteServices } from "./pages/website/Services";
import { WebsitePricing } from "./pages/website/Pricing";
import { WebsiteBecomeProvider } from "./pages/website/BecomeProvider";
import { WebsiteHelp } from "./pages/website/Help";

import { ProtectedRoute } from "./context/AuthContext";
import { RouteErrorElement } from "./components/RouteErrorElement";
import { Outlet } from "react-router";

// Root layout that provides an error boundary for all child routes
function RootLayout() {
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    errorElement: <RouteErrorElement />,
    children: [
  {
    path: "/",
    Component: Splash,
  },
  {
    path: "/apps",
    Component: AppSelector,
  },
  {
    path: "/intro/user",
    Component: UserIntro,
  },
  {
    path: "/role-selection",
    Component: RoleSelection,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/signup",
    Component: Signup,
  },
  {
    path: "/permissions",
    Component: Permissions,
  },
  {
    path: "/verify-email",
    Component: VerifyEmail,
  },
  {
    path: "/auth/callback",
    Component: AuthCallback,
  },
  {
    path: "/forgot-password",
    Component: ForgotPassword,
  },
  {
    path: "/reset-password",
    Component: ResetPassword,
  },
  {
    path: "/home",
    element: <Navigate to="/customer/home" replace />,
  },
  {
    path: "/customer/home",
    element: <ProtectedRoute requiredRole="customer"><HomeMap /></ProtectedRoute>,
  },
  {
    path: "/customer/history",
    element: <ProtectedRoute requiredRole="customer"><Activity /></ProtectedRoute>,
  },
  {
    path: "/customer/explore",
    element: <ProtectedRoute requiredRole="customer"><Explore /></ProtectedRoute>,
  },
  {
    path: "/customer/profile",
    element: <ProtectedRoute requiredRole="customer"><Profile /></ProtectedRoute>,
  },
  {
    path: "/customer/service-history",
    element: <ProtectedRoute requiredRole="customer"><ServiceHistory /></ProtectedRoute>,
  },
  {
    path: "/customer/payment-methods",
    element: <ProtectedRoute requiredRole="customer"><PaymentMethods /></ProtectedRoute>,
  },
  {
    path: "/customer/notifications",
    element: <ProtectedRoute requiredRole="customer"><Notifications /></ProtectedRoute>,
  },
  {
    path: "/customer/notification-settings",
    element: <ProtectedRoute requiredRole="customer"><Notifications /></ProtectedRoute>,
  },
  {
    path: "/notification-settings",
    element: <Navigate to="/customer/notification-settings" replace />,
  },
  {
    path: "/customer/help-center",
    element: <ProtectedRoute requiredRole="customer"><HelpCenter /></ProtectedRoute>,
  },
  {
    path: "/customer/personal-info",
    element: <ProtectedRoute requiredRole="customer"><PersonalInfo /></ProtectedRoute>,
  },
  {
    path: "/customer/vehicles",
    element: <ProtectedRoute requiredRole="customer"><Vehicles /></ProtectedRoute>,
  },
  {
    path: "/customer/account-security",
    element: <ProtectedRoute requiredRole="customer"><AccountSecurity /></ProtectedRoute>,
  },
  {
    path: "/customer/messages",
    element: <ProtectedRoute requiredRole="customer"><CustomerMessages /></ProtectedRoute>,
  },
  {
    path: "/customer/reporting",
    element: <ProtectedRoute requiredRole="customer"><CustomerReporting /></ProtectedRoute>,
  },
  {
    path: "/who-needs-help",
    element: <ProtectedRoute requiredRole="customer"><WhoNeedsHelp /></ProtectedRoute>,
  },
  {
    path: "/confirm-location",
    element: <ProtectedRoute requiredRole="customer"><ConfirmLocation /></ProtectedRoute>,
  },
  {
    path: "/service-selection",
    element: <ProtectedRoute requiredRole="customer"><ServiceSelection /></ProtectedRoute>,
  },
  {
    path: "/service-details/:serviceId",
    element: <ProtectedRoute requiredRole="customer"><ServiceDetails /></ProtectedRoute>,
  },
  {
    path: "/schedule",
    element: <ProtectedRoute requiredRole="customer"><ScheduleService /></ProtectedRoute>,
  },
  {
    path: "/pricing",
    element: <ProtectedRoute requiredRole="customer"><PricingPayment /></ProtectedRoute>,
  },
  {
    path: "/matching",
    element: <ProtectedRoute requiredRole="customer"><Matching /></ProtectedRoute>,
  },
  {
    path: "/tracking/:jobId",
    element: <ProtectedRoute requiredRole="customer"><LiveTracking /></ProtectedRoute>,
  },
  {
    path: "/completion/:jobId",
    element: <ProtectedRoute requiredRole="customer"><ServiceCompletion /></ProtectedRoute>,
  },
  {
    path: "/activity",
    element: <Navigate to="/customer/history" replace />,
  },
  {
    path: "/job/:jobId",
    element: <ProtectedRoute requiredRole="customer"><JobDetail /></ProtectedRoute>,
  },
  {
    path: "/wallet",
    element: <Navigate to="/customer/profile" replace />,
  },
  {
    path: "/profile",
    element: <Navigate to="/customer/profile" replace />,
  },
  {
    path: "/explore",
    element: <Navigate to="/customer/explore" replace />,
  },
  {
    path: "/shop/:shopId",
    element: <ProtectedRoute requiredRole="customer"><ShopDetail /></ProtectedRoute>,
  },
  // Provider routes don't exist in customer app — redirect to home.
  {
    path: "/provider/*",
    element: <Navigate to="/customer/home" replace />,
  },
  {
    path: "/apps",
    element: <Navigate to="/customer/home" replace />,
  },

  // Admin routes
  {
    path: "/admin",
    element: <ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>,
  },
  {
    path: "/admin/jobs",
    element: <ProtectedRoute requiredRole="admin"><AdminJobs /></ProtectedRoute>,
  },
  {
    path: "/admin/providers",
    element: <ProtectedRoute requiredRole="admin"><AdminProviders /></ProtectedRoute>,
  },
  {
    path: "/admin/payments",
    element: <ProtectedRoute requiredRole="admin"><AdminPayments /></ProtectedRoute>,
  },
  {
    path: "/admin/directory",
    element: <ProtectedRoute requiredRole="admin"><AdminDirectory /></ProtectedRoute>,
  },
  {
    path: "/admin/provider-approval",
    element: <ProtectedRoute requiredRole="admin"><ProviderApproval /></ProtectedRoute>,
  },
  {
    path: "/admin/payouts",
    element: <ProtectedRoute requiredRole="admin"><AdminPayouts /></ProtectedRoute>,
  },
  {
    path: "/admin/document-settings",
    element: <ProtectedRoute requiredRole="admin"><DocumentSettings /></ProtectedRoute>,
  },
  {
    path: "/admin/analytics",
    element: <ProtectedRoute requiredRole="admin"><AdminAnalytics /></ProtectedRoute>,
  },
  {
    path: "/admin/users",
    element: <ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>,
  },
  {
    path: "/admin/payout-history",
    element: <ProtectedRoute requiredRole="admin"><AdminPayoutHistory /></ProtectedRoute>,
  },
  {
    path: "/admin/services",
    element: <ProtectedRoute requiredRole="admin"><AdminServices /></ProtectedRoute>,
  },
  {
    path: "/admin/team",
    element: <ProtectedRoute requiredRole="admin"><AdminTeam /></ProtectedRoute>,
  },
  {
    path: "/admin/settings",
    element: <ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>,
  },
  {
    path: "/admin/live-dispatch",
    element: <ProtectedRoute requiredRole="admin"><AdminLiveDispatch /></ProtectedRoute>,
  },
  {
    path: "/admin/support",
    element: <ProtectedRoute requiredRole="admin"><AdminSupportTickets /></ProtectedRoute>,
  },
  {
    path: "/admin/finance",
    element: <ProtectedRoute requiredRole="admin"><AdminFinance /></ProtectedRoute>,
  },
  {
    path: "/admin/audit-trail",
    element: <ProtectedRoute requiredRole="admin"><AdminAuditTrail /></ProtectedRoute>,
  },
  {
    path: "/admin/reporting",
    element: <ProtectedRoute requiredRole="admin"><AdminReporting /></ProtectedRoute>,
  },
  // Website routes
  {
    path: "/website",
    Component: WebsiteHome,
  },
  {
    path: "/website/services",
    Component: WebsiteServices,
  },
  {
    path: "/website/pricing",
    Component: WebsitePricing,
  },
  {
    path: "/website/become-provider",
    Component: WebsiteBecomeProvider,
  },
  {
    path: "/website/help",
    Component: WebsiteHelp,
  },
  // Redirect old routes to new ones
  {
    path: "/user",
    element: <Navigate to="/home" replace />,
  },
  {
    path: "/user/book/:serviceId",
    element: <Navigate to="/service-selection" replace />,
  },
  {
    path: "/user/rescue/:rescueId",
    element: <Navigate to="/home" replace />,
  },
  
  {
    path: "*",
    Component: NotFound,
  },
    ],
  },
]);
