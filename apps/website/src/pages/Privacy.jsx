import { WebsiteLayout } from "../components/WebsiteLayout";

export function Privacy() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "720px" }}>
          <header className="page-header">
            <h1 className="page-title">Privacy Policy</h1>
            <p className="page-intro">
              Last updated: {new Date().toLocaleDateString("en-US")}
            </p>
          </header>

          <div className="prose">
            <h2>1. Information We Collect</h2>
            <p>
              Torc collects information you provide directly (name, email, phone, payment info),
              location data when you request roadside assistance, and usage data to improve our services.
            </p>

            <h2>2. How We Use Your Information</h2>
            <p>
              We use your information to provide roadside assistance, process payments, communicate
              about your requests, improve our app, and comply with legal obligations.
            </p>

            <h2>3. Data Sharing</h2>
            <p>
              We share data with service providers (payment processors, maps) and with providers
              assigned to your requests. We do not sell your personal information.
            </p>

            <h2>4. Security</h2>
            <p>
              We use industry-standard security measures to protect your data. Payment information
              is processed by Stripe and is not stored on our servers.
            </p>

            <h2>5. Your Rights</h2>
            <p>
              You may access, correct, or delete your data through the app or by contacting
              support@torcapp.com. You may also opt out of marketing communications.
            </p>

            <h2>6. Contact</h2>
            <p>
              Questions? Email us at <a href="mailto:support@torcapp.com">support@torcapp.com</a>.
            </p>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
