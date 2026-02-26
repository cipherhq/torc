import { Link } from "react-router";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { websiteContent } from "../content/websiteContent";

export function BecomeProvider() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container">
          <header className="page-header">
            <h1 className="page-title">{websiteContent.providerSection.title}</h1>
            <p className="page-intro">
              Join our network of professional service providers. Accept nearby requests, manage jobs, and grow your business with TORC.
            </p>
          </header>

          <div className="section-card">
            <h2 className="section-title" style={{ textAlign: "left", marginBottom: "0.5rem" }}>What you get</h2>
            <ul className="provider-points">
              {websiteContent.providerSection.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="section-card">
            <h2 className="section-title" style={{ textAlign: "left", marginBottom: "0.5rem" }}>Quality standards</h2>
            <p className="prose">
              Providers go through an approval process to ensure authenticity and reliability. You'll have access to a provider dashboard to manage requests, track earnings, and build your reputation through verified ratings and reviews.
            </p>
          </div>

          <div className="hero-actions">
            <a href={websiteContent.links.providerSignup} className="btn-primary">
              Sign Up as Provider
            </a>
            <Link to="/contact" className="btn-outline">
              Have questions? Contact us
            </Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
