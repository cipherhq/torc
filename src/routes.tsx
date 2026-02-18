import { createBrowserRouter } from "react-router";
import { Splash } from "./pages/auth/Splash";
import { RoleSelection } from "./pages/auth/RoleSelection";
import { Login } from "./pages/auth/Login";
import { Signup } from "./pages/auth/Signup";
import { Permissions } from "./pages/auth/Permissions";
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
import { NotFound } from "./pages/NotFound";
import { Navigate } from "react-router";
import { AppSelector } from "./pages/AppSelector";

// Provider imports
import { ProviderOnboarding } from "./pages/provider/ProviderOnboarding";
import { ProviderLogin } from "./pages/provider/ProviderLogin";
import { ProviderSignup } from "./pages/provider/ProviderSignup";
import { ProviderServiceSelection } from "./pages/provider/ServiceSelection";
import { ProviderDocuments } from "./pages/provider/Documents";
import { PayoutSetup } from "./pages/provider/PayoutSetup";
import { VerificationPending } from "./pages/provider/VerificationPending";
import { ProviderHome } from "./pages/provider/ProviderHome";
import { JobRequest } from "./pages/provider/JobRequest";
import { JobActive } from "./pages/provider/JobActive";
import { JobComplete } from "./pages/provider/JobComplete";
import { ProviderEarnings } from "./pages/provider/Earnings";
import { ProviderProfile } from "./pages/provider/ProviderProfile";
import { ProviderServices } from "./pages/provider/Services";
import { ProviderBankAccounts } from "./pages/provider/BankAccounts";

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

// Website imports
import { WebsiteHome } from "./pages/website/Home";
import { WebsiteServices } from "./pages/website/Services";
import { WebsitePricing } from "./pages/website/Pricing";
import { WebsiteBecomeProvider } from "./pages/website/BecomeProvider";
import { WebsiteHelp } from "./pages/website/Help";

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
    path: "/home",
    Component: HomeMap,
  },
  {
    path: "/customer/home",
    Component: HomeMap,
  },
  {
    path: "/customer/history",
    Component: Activity,
  },
  {
    path: "/customer/explore",
    Component: Explore,
  },
  {
    path: "/customer/profile",
    Component: Profile,
  },
  {
    path: "/customer/service-history",
    Component: ServiceHistory,
  },
  {
    path: "/customer/payment-methods",
    Component: PaymentMethods,
  },
  {
    path: "/customer/notifications",
    Component: Notifications,
  },
  {
    path: "/customer/help-center",
    Component: HelpCenter,
  },
  {
    path: "/who-needs-help",
    Component: WhoNeedsHelp,
  },
  {
    path: "/confirm-location",
    Component: ConfirmLocation,
  },
  {
    path: "/service-selection",
    Component: ServiceSelection,
  },
  {
    path: "/service-details/:serviceId",
    Component: ServiceDetails,
  },
  {
    path: "/schedule",
    Component: ScheduleService,
  },
  {
    path: "/pricing",
    Component: PricingPayment,
  },
  {
    path: "/matching",
    Component: Matching,
  },
  {
    path: "/tracking/:jobId",
    Component: LiveTracking,
  },
  {
    path: "/completion/:jobId",
    Component: ServiceCompletion,
  },
  {
    path: "/activity",
    Component: Activity,
  },
  {
    path: "/job/:jobId",
    Component: JobDetail,
  },
  {
    path: "/wallet",
    Component: Wallet,
  },
  {
    path: "/profile",
    Component: Profile,
  },
  {
    path: "/explore",
    Component: Explore,
  },
  {
    path: "/shop/:shopId",
    Component: ShopDetail,
  },
  // Provider routes
  {
    path: "/provider/onboarding",
    Component: ProviderOnboarding,
  },
  {
    path: "/provider/login",
    Component: ProviderLogin,
  },
  {
    path: "/provider/signup",
    Component: ProviderSignup,
  },
  {
    path: "/provider/services",
    Component: ProviderServiceSelection,
  },
  {
    path: "/provider/documents",
    Component: ProviderDocuments,
  },
  {
    path: "/provider/payout",
    Component: PayoutSetup,
  },
  {
    path: "/provider/verification-pending",
    Component: VerificationPending,
  },
  {
    path: "/provider/home",
    Component: ProviderHome,
  },
  {
    path: "/provider/request/:requestId",
    Component: JobRequest,
  },
  {
    path: "/provider/job/:jobId",
    Component: JobActive,
  },
  {
    path: "/provider/complete/:jobId",
    Component: JobComplete,
  },
  {
    path: "/provider/earnings",
    Component: ProviderEarnings,
  },
  {
    path: "/provider/profile",
    Component: ProviderProfile,
  },
  {
    path: "/provider/services-list",
    Component: ProviderServices,
  },
  {
    path: "/provider/bank-accounts",
    Component: ProviderBankAccounts,
  },
  // Admin routes
  {
    path: "/admin",
    Component: AdminDashboard,
  },
  {
    path: "/admin/jobs",
    Component: AdminJobs,
  },
  {
    path: "/admin/providers",
    Component: AdminProviders,
  },
  {
    path: "/admin/payments",
    Component: AdminPayments,
  },
  {
    path: "/admin/directory",
    Component: AdminDirectory,
  },
  {
    path: "/admin/provider-approval",
    Component: ProviderApproval,
  },
  {
    path: "/admin/payouts",
    Component: AdminPayouts,
  },
  {
    path: "/admin/document-settings",
    Component: DocumentSettings,
  },
  {
    path: "/admin/analytics",
    Component: AdminAnalytics,
  },
  {
    path: "/admin/users",
    Component: AdminUsers,
  },
  {
    path: "/admin/payout-history",
    Component: AdminPayoutHistory,
  },
  {
    path: "/admin/services",
    Component: AdminServices,
  },
  {
    path: "/admin/team",
    Component: AdminTeam,
  },
  {
    path: "/admin/settings",
    Component: AdminSettings,
  },
  {
    path: "/admin/live-dispatch",
    Component: AdminLiveDispatch,
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
    path: "/provider",
    element: <Navigate to="/provider/home" replace />,
  },
  {
    path: "*",
    Component: NotFound,
  },
]);