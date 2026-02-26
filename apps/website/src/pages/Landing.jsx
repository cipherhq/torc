import { Link } from "react-router";
import { BatteryCharging, Fuel, KeyRound, Truck, Wrench, CircleDot } from "lucide-react";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { websiteContent } from "../content/websiteContent";

const SERVICE_ICONS = {
  Towing: Truck,
  "Fuel Delivery": Fuel,
  "Jump Start & Battery": BatteryCharging,
  "Lockout Support": KeyRound,
  "Tire Assistance": CircleDot,
};

export function Landing() {
  return (
    <WebsiteLayout>
      <section className="hero-section">
        <div
          className="hero-bg"
          style={{ backgroundImage: `url(${websiteContent.hero.image})` }}
        />
        <div className="hero-content">
          <p className="eyebrow">{websiteContent.brand.tagline}</p>
          <h1 className="hero-title">{websiteContent.hero.title}</h1>
          <p className="hero-subtitle">{websiteContent.hero.subtitle}</p>
          <div className="hero-actions">
            <a href={websiteContent.links.downloadApp} className="btn-primary">
              {websiteContent.hero.ctaPrimary}
            </a>
            <Link to="/become-provider" className="btn-secondary">
              {websiteContent.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Why drivers choose TORC</h2>
          <div className="chip-grid">
            {websiteContent.trustBadges.map((item) => (
              <span key={item} className="chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="section-title">Our Services</h2>
          <p className="section-subtitle">
            Professional roadside assistance when you need it most. Available 24/7 with live tracking and transparent pricing.
          </p>
          <div className="services-grid">
            {websiteContent.services.map((service) => {
              const Icon = SERVICE_ICONS[service.title] || Wrench;
              return (
                <article key={service.title} className="service-card">
                  <div className="service-card-body">
                    <div className="service-card-icon-wrap">
                      <Icon className="service-card-icon" />
                    </div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">How TORC works</h2>
          <p className="section-subtitle">
            Get help on the road in four simple steps. Fast, reliable, and secure.
          </p>
          <div className="steps-grid">
            {websiteContent.howItWorks.map((step) => (
              <div key={step.step} className="step-card">
                <div className="step-num">{step.step}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="section-title">Ready to get started?</h2>
          <p className="section-subtitle">
            Download the TORC app and get roadside help in minutes. Or join our network of professional providers.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <a href={websiteContent.links.downloadApp} className="btn-primary">
              Get The App
            </a>
            <Link to="/become-provider" className="btn-outline">
              Become A Provider
            </Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
