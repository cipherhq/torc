import { WebsiteLayout } from "../components/WebsiteLayout";

export function Privacy() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "720px" }}>
          <header className="page-header">
            <h1 className="page-title">Privacy Policy</h1>
            <p className="page-intro">Effective Date: February 26, 2026</p>
          </header>

          <div className="prose legal-content" style={{ marginTop: 0 }}>
            <p>
              TORC ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Platform"). Please read this policy carefully. By using the Platform, you consent to the practices described herein.
            </p>

            <h2>1. Information We Collect</h2>

            <h3>1.1 Information You Provide</h3>
            <ul>
              <li><strong>Account Information:</strong> Name, email address, phone number, and password when you create an account.</li>
              <li><strong>Payment Information:</strong> Credit card, debit card, or other payment method details processed through our third-party payment processor (Stripe). We do not store your full payment card information on our servers.</li>
              <li><strong>Vehicle Information:</strong> Vehicle make, model, year, color, and license plate number.</li>
              <li><strong>Profile Information:</strong> Profile photo, communication preferences, and any other information you choose to provide.</li>
              <li><strong>Provider Information:</strong> For service providers, we additionally collect driver's license, insurance documents, professional certifications, banking information for payouts, and tax identification numbers.</li>
              <li><strong>Third-Party Contact Information:</strong> When you request services on behalf of another person, we collect their name and phone number.</li>
              <li><strong>Communications:</strong> Messages exchanged through our in-app messaging system and any correspondence with our support team.</li>
            </ul>

            <h3>1.2 Information Collected Automatically</h3>
            <ul>
              <li><strong>Location Data:</strong> We collect precise GPS location data from your device when you use the Platform to request or provide services. Location is used to match you with nearby providers, enable real-time tracking, and improve service delivery.</li>
              <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, browser type, and mobile network information.</li>
              <li><strong>Usage Data:</strong> Pages viewed, features used, timestamps, interaction patterns, and app performance data.</li>
              <li><strong>Log Data:</strong> IP address, access times, referring URLs, and error logs.</li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve the Platform and our services</li>
              <li>Process service requests and match Customers with Providers</li>
              <li>Enable real-time location tracking during active service requests</li>
              <li>Process payments, payouts, and issue receipts</li>
              <li>Verify Provider identities, credentials, and insurance</li>
              <li>Send service notifications, updates, and appointment reminders</li>
              <li>Communicate with you about your account, services, and support requests</li>
              <li>Send SMS notifications to third parties when services are requested on their behalf</li>
              <li>Analyze usage patterns to improve the Platform experience</li>
              <li>Detect, prevent, and address fraud, abuse, and security issues</li>
              <li>Comply with legal obligations and enforce our terms</li>
            </ul>

            <h2>3. How We Share Your Information</h2>

            <h3>3.1 With Service Providers and Customers</h3>
            <p>
              When a service is requested, we share relevant information between the Customer and Provider to facilitate the service. This includes first name, approximate location, vehicle information, and real-time location during active services. Full names are displayed in a privacy-preserving format (e.g., "John S.").
            </p>

            <h3>3.2 With Third-Party Service Providers</h3>
            <p>We share information with trusted third parties who assist us in operating the Platform:</p>
            <ul>
              <li><strong>Stripe:</strong> Payment processing and payout disbursement</li>
              <li><strong>Supabase:</strong> Database hosting and authentication</li>
              <li><strong>Twilio:</strong> SMS notifications</li>
              <li><strong>Google Maps / Mapbox:</strong> Mapping and location services</li>
              <li><strong>Vercel:</strong> Website and application hosting</li>
            </ul>

            <h3>3.3 Legal Requirements</h3>
            <p>
              We may disclose your information if required by law, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others, investigate fraud, or respond to a government request.
            </p>

            <h3>3.4 Business Transfers</h3>
            <p>
              In the event of a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of the transaction. We will notify you of any such change.
            </p>

            <h3>3.5 No Sale of Personal Information</h3>
            <p>
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>

            <h2>4. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide services. After account deletion, we may retain certain information for up to 3 years to comply with legal obligations, resolve disputes, and enforce our agreements. Anonymized or aggregated data may be retained indefinitely for analytics purposes.
            </p>

            <h2>5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your information, including:
            </p>
            <ul>
              <li>Encryption of data in transit (TLS/SSL) and at rest</li>
              <li>Secure authentication with row-level security policies</li>
              <li>Regular security assessments and monitoring</li>
              <li>Access controls limiting employee access to personal data</li>
              <li>Payment card data handled exclusively by PCI-compliant processors (Stripe)</li>
            </ul>
            <p>
              While we strive to protect your information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
            </p>

            <h2>6. Your Rights and Choices</h2>

            <h3>6.1 Access and Correction</h3>
            <p>
              You may access and update your personal information through your account settings in the app. For information not accessible through the app, contact us at support@torcapp.com.
            </p>

            <h3>6.2 Account Deletion</h3>
            <p>
              You may request deletion of your account and personal data by contacting us at{" "}
              <a href="mailto:support@torcapp.com">support@torcapp.com</a>. We will process your request within 30 days, subject to any legal retention requirements.
            </p>

            <h3>6.3 Location Data</h3>
            <p>
              You may disable location services through your device settings. However, this will prevent the Platform from functioning properly, as location is required to request and provide services.
            </p>

            <h3>6.4 Communications</h3>
            <p>
              You may opt out of promotional communications by following the unsubscribe instructions in those messages. You cannot opt out of service-related communications (e.g., order confirmations, security alerts) while your account is active.
            </p>

            <h3>6.5 California Residents (CCPA)</h3>
            <p>
              If you are a California resident, you have the right to know what personal information we collect, request deletion, and opt out of the sale of your data (we do not sell personal data). To exercise these rights, contact us at{" "}
              <a href="mailto:support@torcapp.com">support@torcapp.com</a>.
            </p>

            <h2>7. Children's Privacy</h2>
            <p>
              The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children under 18. If we become aware that we have collected such information, we will take steps to delete it promptly.
            </p>

            <h2>8. Third-Party Links</h2>
            <p>
              The Platform may contain links to third-party websites or services. We are not responsible for the privacy practices of those third parties. We encourage you to review the privacy policies of any third-party services you access.
            </p>

            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will notify you through the Platform or via email. Your continued use of the Platform after changes are posted constitutes your acceptance of the updated policy.
            </p>

            <h2>10. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
            </p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:support@torcapp.com">support@torcapp.com</a></li>
              <li><strong>Phone:</strong> <a href="tel:+12405052828">+1 (240) 505-2828</a></li>
            </ul>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
