import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { loadPublicPlatformContent } from "../lib/publicContent";

function CustomerTerms() {
  return (
    <>
      <h2>1. Acceptance of Terms</h2>
      <p>
        By downloading, accessing, or using the TORC mobile application or website (collectively, the "Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Platform. TORC reserves the right to modify these terms at any time, and your continued use of the Platform constitutes acceptance of any changes.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        TORC is an on-demand roadside assistance platform that connects drivers ("Customers") with independent roadside assistance providers ("Providers"). Services available through the Platform include, but are not limited to, towing, fuel delivery, jump-start and battery assistance, lockout support, and tire assistance.
      </p>
      <p>
        TORC acts as an intermediary platform and does not itself provide roadside assistance services. All services are performed by independent Providers who are not employees or agents of TORC.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        To use the Platform, you must create an account by providing accurate, current, and complete information including your name, email address, phone number, and payment method. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
      </p>
      <p>
        You must be at least 18 years of age to create an account. By creating an account, you represent and warrant that all information you provide is truthful, accurate, and complete.
      </p>

      <h2>4. Service Requests and Pricing</h2>
      <p>
        When you submit a service request through the Platform, you will be shown an estimated price before confirming. Final pricing may vary based on actual service conditions, distance, and any additional services required. All pricing is displayed transparently within the Platform before you confirm a request.
      </p>
      <p>
        By confirming a service request, you authorize TORC to charge your selected payment method for the final service amount, including any applicable fees, taxes, or surcharges.
      </p>

      <h2>5. Payment Terms</h2>
      <p>
        All payments are processed securely through our third-party payment processor (Stripe). You agree to provide a valid payment method and authorize charges for completed services. Receipts are provided electronically through the Platform after each completed service.
      </p>
      <p>
        If a payment fails or is disputed, TORC reserves the right to suspend your account until the matter is resolved. Refund requests are handled on a case-by-case basis and may be submitted through the app or by contacting support.
      </p>

      <h2>6. Cancellation Policy</h2>
      <p>
        You may cancel a service request at any time before a Provider has been dispatched at no charge. Once a Provider has been dispatched and is en route, a cancellation fee may apply. The cancellation fee amount will be disclosed to you before you confirm the cancellation.
      </p>

      <h2>7. User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Platform for any unlawful purpose or in violation of any applicable laws</li>
        <li>Provide false, misleading, or inaccurate information</li>
        <li>Harass, threaten, or behave inappropriately toward Providers or TORC staff</li>
        <li>Interfere with or disrupt the Platform or its infrastructure</li>
        <li>Attempt to access another user's account without authorization</li>
        <li>Use the Platform to transmit spam, malware, or other harmful content</li>
      </ul>

      <h2>8. Third-Party Requests</h2>
      <p>
        You may request services on behalf of a third party. When doing so, you are responsible for providing accurate contact information for the third party and ensuring they are aware of the incoming service. The third party may receive an SMS notification regarding the service request. You remain responsible for all charges associated with the request.
      </p>

      <h2>9. Location Data</h2>
      <p>
        The Platform requires access to your device's location to provide services. By using the Platform, you consent to the collection and use of your location data as described in our Privacy Policy. You may disable location services at any time, but this will limit the Platform's functionality.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        TORC provides the Platform on an "as is" and "as available" basis. TORC is not liable for the actions, omissions, or quality of service provided by independent Providers. To the maximum extent permitted by law, TORC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.
      </p>
      <p>
        TORC's total liability for any claims arising from your use of the Platform shall not exceed the amount you paid to TORC in the 12 months preceding the claim.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless TORC, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of your use of the Platform, your violation of these Terms, or your violation of any rights of a third party.
      </p>

      <h2>12. Dispute Resolution</h2>
      <p>
        Any disputes arising from or relating to these Terms or your use of the Platform shall first be resolved through good-faith negotiation. If a dispute cannot be resolved through negotiation within 30 days, it shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association. You agree to waive your right to a jury trial and to participate in class action lawsuits.
      </p>

      <h2>13. Intellectual Property</h2>
      <p>
        The TORC name, logo, and all related content, features, and functionality of the Platform are owned by TORC and are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, or create derivative works from any part of the Platform without prior written consent.
      </p>

      <h2>14. Termination</h2>
      <p>
        TORC may suspend or terminate your account at any time, with or without cause or notice, including for violation of these Terms. Upon termination, your right to use the Platform ceases immediately. Any outstanding payment obligations survive termination.
      </p>

      <h2>15. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the State of Maryland, without regard to its conflict of law provisions.
      </p>

      <h2>16. Contact</h2>
      <p>
        If you have questions about these Terms, please contact us at{" "}
        <a href="mailto:support@torcapp.com">support@torcapp.com</a> or call{" "}
        <a href="tel:+12405052828">+1 (240) 505-2828</a>.
      </p>
    </>
  );
}

function ProviderTerms() {
  return (
    <>
      <h2>1. Acceptance of Terms</h2>
      <p>
        By registering as a service provider ("Provider") on the TORC platform (the "Platform"), you agree to be bound by these Provider Terms of Service. These terms govern your relationship with TORC as an independent service provider. If you do not agree, do not use the Platform as a Provider.
      </p>

      <h2>2. Independent Contractor Status</h2>
      <p>
        You acknowledge and agree that you are an independent contractor and not an employee, agent, or representative of TORC. Nothing in these Terms creates an employment, partnership, or joint venture relationship. You are solely responsible for your own taxes, insurance, and compliance with applicable laws and regulations.
      </p>
      <p>
        You have the right to accept or decline any service request at your discretion. TORC does not control the manner or method by which you perform services.
      </p>

      <h2>3. Provider Requirements</h2>
      <p>To register and maintain your account as a Provider, you must:</p>
      <ul>
        <li>Be at least 18 years of age</li>
        <li>Hold a valid driver's license</li>
        <li>Maintain adequate vehicle insurance as required by your state</li>
        <li>Provide accurate and current business and personal information</li>
        <li>Submit and maintain required documentation (license, insurance, certifications)</li>
        <li>Pass any verification or background checks required by TORC</li>
        <li>Maintain any professional licenses or certifications required for the services you offer</li>
      </ul>

      <h2>4. Onboarding and Verification</h2>
      <p>
        All Providers must complete TORC's onboarding process, which includes submitting identification documents, proof of insurance, and any applicable certifications. TORC reserves the right to approve or deny Provider applications at its sole discretion. Document expiration is monitored, and failure to maintain current documents may result in account suspension.
      </p>

      <h2>5. Service Standards</h2>
      <p>As a Provider, you agree to:</p>
      <ul>
        <li>Respond to accepted service requests promptly and professionally</li>
        <li>Provide services in a safe, competent, and workmanlike manner</li>
        <li>Maintain accurate real-time location sharing during active jobs</li>
        <li>Communicate with Customers through the Platform's messaging system</li>
        <li>Complete job status updates (en route, arrived, in progress, completed) accurately</li>
        <li>Treat all Customers with respect and professionalism</li>
        <li>Maintain your vehicle and equipment in safe working condition</li>
      </ul>

      <h2>6. Earnings and Payouts</h2>
      <p>
        Providers earn compensation for completed services as displayed in the Platform. TORC retains a platform fee (commission) from each completed service. The exact fee structure is disclosed during onboarding and within your Provider dashboard.
      </p>
      <p>
        Payouts are processed on a regular schedule (weekly) to your designated bank account or payout method. You are responsible for providing accurate banking information and for any taxes owed on your earnings. TORC may issue tax documentation (e.g., 1099 forms) as required by law.
      </p>

      <h2>7. Ratings and Reviews</h2>
      <p>
        After each completed service, Customers may rate and review your performance. Your rating is visible on your Provider profile and may affect your eligibility for future requests. TORC reserves the right to deactivate Providers who consistently receive low ratings or complaints.
      </p>

      <h2>8. Insurance and Liability</h2>
      <p>
        You are solely responsible for maintaining adequate insurance coverage for the services you provide, including general liability and automobile insurance. You agree to indemnify and hold harmless TORC from any claims, damages, or losses arising from your performance of services, your negligence, or your violation of any law or regulation.
      </p>

      <h2>9. Cancellation and No-Show</h2>
      <p>
        Once you accept a service request, you are expected to complete it. Excessive cancellations or no-shows after accepting requests may result in penalties, reduced job assignments, or account suspension. If you are unable to complete an accepted request, update the job status in the Platform immediately.
      </p>

      <h2>10. Prohibited Conduct</h2>
      <p>As a Provider, you may not:</p>
      <ul>
        <li>Solicit Customers for off-platform services or payments</li>
        <li>Collect payment outside the TORC Platform for services initiated through TORC</li>
        <li>Discriminate against Customers based on race, gender, religion, disability, or any protected class</li>
        <li>Operate under the influence of alcohol or controlled substances</li>
        <li>Use another person's Provider account or share your credentials</li>
        <li>Misrepresent your qualifications, experience, or the services you provide</li>
      </ul>

      <h2>11. Account Suspension and Termination</h2>
      <p>
        TORC may suspend or terminate your Provider account at any time for violation of these Terms, failure to maintain required documentation, consistently low ratings, Customer complaints, or any other reason at TORC's sole discretion. Upon termination, any pending payouts for completed services will be processed according to the standard payout schedule.
      </p>

      <h2>12. Intellectual Property</h2>
      <p>
        You may not use the TORC name, logo, or branding for any purpose outside of providing services through the Platform without prior written consent. Any content you submit to the Platform (photos, descriptions) grants TORC a non-exclusive license to use such content in connection with the Platform.
      </p>

      <h2>13. Dispute Resolution</h2>
      <p>
        Any disputes between you and TORC shall first be addressed through good-faith negotiation. Unresolved disputes shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association. You agree to waive your right to a jury trial and to participate in class action lawsuits against TORC.
      </p>

      <h2>14. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the State of Maryland, without regard to its conflict of law provisions.
      </p>

      <h2>15. Contact</h2>
      <p>
        If you have questions about these Provider Terms, please contact us at{" "}
        <a href="mailto:support@torcapp.com">support@torcapp.com</a> or call{" "}
        <a href="tel:+12405052828">+1 (240) 505-2828</a>.
      </p>
    </>
  );
}

export function Terms() {
  const [searchParams] = useSearchParams();
  const [audience, setAudience] = useState(() => (
    searchParams.get("role") === "provider" ? "provider" : "customer"
  ));
  const [dbContent, setDbContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAudience(searchParams.get("role") === "provider" ? "provider" : "customer");
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    loadPublicPlatformContent()
      .then((data) => {
        if (!active) return;
        const text = audience === "provider" ? data.terms_provider_text : data.terms_customer_text;
        if (text) setDbContent(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const hasDbContent = dbContent && (
    audience === "provider" ? dbContent.terms_provider_text : dbContent.terms_customer_text
  );

  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "720px" }}>
          <header className="page-header">
            <h1 className="page-title">Terms of Service</h1>
            <p className="page-intro">Effective Date: February 26, 2026</p>
          </header>

          <div className="audience-toggle" role="tablist" aria-label="Terms audience">
            <button
              className={`audience-toggle-btn ${audience === "customer" ? "active" : ""}`}
              onClick={() => setAudience("customer")}
            >
              Customer Terms
            </button>
            <button
              className={`audience-toggle-btn ${audience === "provider" ? "active" : ""}`}
              onClick={() => setAudience("provider")}
            >
              Provider Terms
            </button>
          </div>

          <div className="prose legal-content">
            {loading ? (
              <p>Loading terms...</p>
            ) : hasDbContent ? (
              <pre className="legal-pre">{hasDbContent}</pre>
            ) : audience === "provider" ? (
              <ProviderTerms />
            ) : (
              <CustomerTerms />
            )}
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
