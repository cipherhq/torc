import { Link, NavLink } from "react-router";
import { websiteContent } from "../content/websiteContent";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/help", label: "Help" },
  { to: "/about", label: "About" },
  { to: "/become-provider", label: "Providers" },
  { to: "/contact", label: "Contact" },
];

export function WebsiteLayout({ children }) {
  return (
    <div className="website-shell">
      <header className="website-header">
        <div className="header-inner">
          <Link to="/" className="brand-lockup" aria-label="TORC home">
            <img src="/logo.svg" alt="TORC - Auto Services On-Demand" className="brand-logo-img" />
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <a className="header-cta" href={websiteContent.links.downloadApp}>
            Download App
          </a>
        </div>
      </header>

      <main className="website-main">{children}</main>

      <footer className="website-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/logo.svg" alt="TORC - Auto Services On-Demand" className="footer-logo-img" />
            <p>Guardians of Your Journey</p>
          </div>
          <div className="footer-links">
            <Link to="/services">Services</Link>
            <Link to="/about">About</Link>
            <Link to="/become-provider">Become a Provider</Link>
            <Link to="/help">Help Center</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
          <p className="footer-copy">© {new Date().getFullYear()} TORC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
