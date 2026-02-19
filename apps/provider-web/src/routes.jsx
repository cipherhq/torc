import { createBrowserRouter, Navigate } from "react-router";

// Auth
import { Splash } from "./pages/auth/Splash";
import { ProviderIntro } from "./pages/auth/ProviderIntro";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { AuthCallback } from "./pages/auth/AuthCallback";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";

// Provider pages
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
import { RatingsReviews } from "./pages/provider/RatingsReviews";
import { TaxDocuments } from "./pages/provider/TaxDocuments";
import { NotificationsPage } from "./pages/provider/NotificationsPage";
import { HelpSupport } from "./pages/provider/HelpSupport";
import { PersonalInformation } from "./pages/provider/PersonalInformation";
import { ProviderVehicles } from "./pages/provider/Vehicles";
import { ProviderMessages } from "./pages/provider/Messages";
import { AccountSecurity } from "./pages/provider/AccountSecurity";
import { AppShell } from "./components/AppShell";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      {
        path: "/",
        Component: Splash,
      },
      {
        path: "/login",
        Component: ProviderLogin,
      },
      {
        path: "/intro/provider",
        Component: ProviderIntro,
      },
      {
        path: "/signup",
        Component: ProviderSignup,
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
        path: "/onboarding",
        Component: ProviderOnboarding,
      },
      {
        path: "/services",
        Component: ProviderServiceSelection,
      },
      {
        path: "/documents",
        Component: ProviderDocuments,
      },
      {
        path: "/provider/documents",
        Component: ProviderDocuments,
      },
      {
        path: "/payout",
        Component: PayoutSetup,
      },
      {
        path: "/provider/payout",
        Component: PayoutSetup,
      },
      {
        path: "/verification-pending",
        Component: VerificationPending,
      },
      {
        path: "/home",
        Component: ProviderHome,
      },
      {
        path: "/request/:requestId",
        Component: JobRequest,
      },
      {
        path: "/job/:jobId",
        Component: JobActive,
      },
      {
        path: "/complete/:jobId",
        Component: JobComplete,
      },
      {
        path: "/earnings",
        Component: ProviderEarnings,
      },
      {
        path: "/provider/earnings",
        Component: ProviderEarnings,
      },
      {
        path: "/profile",
        Component: ProviderProfile,
      },
      {
        path: "/services-list",
        Component: ProviderServices,
      },
      {
        path: "/bank-accounts",
        Component: PayoutSetup,
      },
      {
        path: "/provider/bank-accounts",
        Component: PayoutSetup,
      },
      {
        path: "/provider/ratings-reviews",
        Component: RatingsReviews,
      },
      {
        path: "/provider/tax-documents",
        Component: TaxDocuments,
      },
      {
        path: "/provider/notifications",
        Component: NotificationsPage,
      },
      {
        path: "/provider/help-support",
        Component: HelpSupport,
      },
      {
        path: "/provider/personal-information",
        Component: PersonalInformation,
      },
      {
        path: "/provider/vehicles",
        Component: ProviderVehicles,
      },
      {
        path: "/provider/account-security",
        Component: AccountSecurity,
      },
      {
        path: "/messages",
        Component: ProviderMessages,
      },
      {
        path: "/provider/messages",
        Component: ProviderMessages,
      },
      {
        path: "*",
        element: <Navigate to="/home" replace />,
      },
    ],
  },
]);
