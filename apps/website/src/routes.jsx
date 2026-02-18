import { createBrowserRouter } from "react-router";
import { Landing } from "./pages/Landing";
import { AboutUs } from "./pages/AboutUs";
import { Services } from "./pages/Services";
import { BecomeProvider } from "./pages/BecomeProvider";
import { Contact } from "./pages/Contact";

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
]);
