import { Link } from "react-router";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { websiteContent } from "../content/websiteContent";

export function AboutUs() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div>
              <p className="eyebrow">{websiteContent.brand.tagline}</p>
              <h1 className="page-title">About TORC</h1>
              <p className="page-intro">{websiteContent.brand.description}</p>
              <div className="prose" style={{ marginTop: "1.5rem" }}>
                <p>
                  TORC is revolutionizing roadside assistance by connecting drivers with professional service providers instantly. Our mission is to ensure no one is ever stranded on the road.
                </p>
                <p>
                  With our network of verified providers and innovative technology, help is always just a tap away. Available 24/7, TORC is committed to making roadside assistance faster, more reliable, and more affordable.
                </p>
                <p>
                  Drivers trust TORC for transparent pricing, real-time tracking, and secure in-app payments. Our vetted provider network maintains high standards with ratings and reviews you can rely on.
                </p>
              </div>
              <div className="hero-actions" style={{ marginTop: "2rem" }}>
                <a href={websiteContent.links.downloadApp} className="btn-primary">
                  Get The App
                </a>
                <Link to="/become-provider" className="btn-outline">
                  Become A Provider
                </Link>
              </div>
            </div>
            <img
              src={websiteContent.aboutImage}
              alt="Roadside assistance"
              className="about-img"
            />
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
