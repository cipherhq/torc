import { WebsiteLayout } from "../components/WebsiteLayout";
import { websiteContent } from "../content/websiteContent";

export function Contact() {
  const { email, phone, address } = websiteContent.contact;

  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container">
          <header className="page-header">
            <h1 className="page-title">Contact Us</h1>
            <p className="page-intro">
              Get in touch with our team. We're here to help with questions about services, the app, or becoming a provider.
            </p>
          </header>

          <div className="contact-list" style={{ maxWidth: "480px" }}>
            <div className="contact-item">
              <strong>Email</strong>
              <a href={`mailto:${email}`}>{email}</a>
            </div>
            <div className="contact-item">
              <strong>Phone</strong>
              <a href={`tel:${phone.replace(/\D/g, "")}`}>{phone}</a>
            </div>
            <div className="contact-item">
              <strong>Service area</strong>
              <span>{address}</span>
            </div>
          </div>

          <a
            href={websiteContent.links.downloadApp}
            className="btn-primary"
            style={{ display: "inline-block", marginTop: "2rem" }}
          >
            Download TORC
          </a>
        </div>
      </section>
    </WebsiteLayout>
  );
}
