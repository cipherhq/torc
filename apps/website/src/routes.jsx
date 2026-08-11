import { createBrowserRouter } from "react-router";
import { Landing } from "./pages/Landing";
import { AboutUs } from "./pages/AboutUs";
import { Services } from "./pages/Services";
import { BecomeProvider } from "./pages/BecomeProvider";
import { Contact } from "./pages/Contact";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { HelpCenter } from "./pages/HelpCenter";
import { AccountDeletion } from "./pages/AccountDeletion";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/about",
    Component: AboutUs,
  },
  {
    path: "/services",
    Component: Services,
  },
  {
    path: "/become-provider",
    Component: BecomeProvider,
  },
  {
    path: "/contact",
    Component: Contact,
  },
  {
    path: "/privacy",
    Component: Privacy,
  },
  {
    path: "/terms",
    Component: Terms,
  },
  {
    path: "/help",
    Component: HelpCenter,
  },
  {
    path: "/account-deletion",
    Component: AccountDeletion,
  },
]);
