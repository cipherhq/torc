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

export function Services() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container">
          <header className="page-header">
            <h1 className="page-title">Our Services</h1>
            <p className="page-intro">
              Comprehensive roadside assistance when you need it most. All services available 24/7 with live tracking and transparent pricing.
            </p>
          </header>

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

          <div className="hero-actions" style={{ marginTop: "2rem", justifyContent: "center" }}>
            <a href={websiteContent.links.downloadApp} className="btn-primary">
              {websiteContent.hero.ctaPrimary}
            </a>
            <Link to="/contact" className="btn-outline">
              Questions? Contact Us
            </Link>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
