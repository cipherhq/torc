import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CircleHelp, Smartphone, MapPinned, DollarSign, Users, BadgeCheck, FileText } from "lucide-react";
import { WebsiteLayout } from "../components/WebsiteLayout";

const CUSTOMER_FEATURES = [
  { icon: Smartphone, title: "Request in Seconds", description: "Open the app, pick a service, and submit your request." },
  { icon: MapPinned, title: "Live Tracking", description: "Track provider ETA and location in real time." },
  { icon: DollarSign, title: "Transparent Billing", description: "See fees clearly and receive post-service receipts." },
  { icon: CircleHelp, title: "In-App Support", description: "Submit support requests directly from your profile." },
];

const PROVIDER_FEATURES = [
  { icon: Users, title: "Job Dispatch", description: "Accept nearby jobs and update status from one workflow." },
  { icon: FileText, title: "Document Uploads", description: "Upload and manage licensing and insurance documents." },
  { icon: DollarSign, title: "Earnings & Payouts", description: "Track completed earnings and weekly payout status." },
  { icon: BadgeCheck, title: "Verification", description: "Complete onboarding and keep credentials current." },
];

const CUSTOMER_FAQ = [
  {
    q: "How do I request roadside assistance?",
    a: "Open the TORC app, select the service you need (towing, fuel delivery, jump-start, lockout, or tire assistance), confirm your location, and submit your request. You'll be matched with a nearby provider within minutes.",
  },
  {
    q: "What services does TORC offer?",
    a: "TORC offers towing, fuel delivery, jump-start and battery assistance, lockout support, and flat tire assistance. All services are available 24/7.",
  },
  {
    q: "How much does it cost?",
    a: "Pricing varies by service type, distance, and your location. You'll see a clear price estimate before confirming your request. There are no hidden fees — what you see is what you pay.",
  },
  {
    q: "Can I request help for someone else?",
    a: "Yes! When creating a service request, select \"Someone Else\" on the \"Who Needs Help\" screen. Enter the person's name and phone number, and they'll receive an SMS notification when a provider is on the way.",
  },
  {
    q: "How do I track my provider?",
    a: "Once a provider accepts your request, you can track their location in real time on the map. You'll also receive updates when they're en route, arriving, and when the job is in progress.",
  },
  {
    q: "What payment methods do you accept?",
    a: "TORC accepts all major credit and debit cards through our secure payment processor (Stripe). You can manage your payment methods in the app under Profile > Payment Methods.",
  },
  {
    q: "How do I cancel a request?",
    a: "You can cancel a request from the active job screen. If a provider hasn't been dispatched yet, there's no charge. If a provider is already en route, a cancellation fee may apply.",
  },
  {
    q: "What if I'm not satisfied with the service?",
    a: "After each service, you can rate your provider and leave a review. If you have a concern, contact our support team through the app (Profile > Help & Support) or email support@torcapp.com.",
  },
  {
    q: "Is my personal information safe?",
    a: "Yes. We use industry-standard encryption and security measures. Your payment information is processed by Stripe and never stored on our servers. See our Privacy Policy for full details.",
  },
  {
    q: "How do I delete my account?",
    a: "To delete your account, go to Profile > Account Security or contact us at support@torcapp.com. We'll process your deletion request within 30 days.",
  },
];

const PROVIDER_FAQ = [
  {
    q: "How do I become a TORC provider?",
    a: "Download the TORC Provider app and complete the sign-up process. You'll need to submit your driver's license, proof of insurance, and any applicable certifications. Once your documents are verified, you can start accepting jobs.",
  },
  {
    q: "What documents do I need?",
    a: "You'll need a valid driver's license, proof of vehicle insurance, and any professional certifications relevant to the services you offer (e.g., towing certification). All documents must be current and unexpired.",
  },
  {
    q: "How long does verification take?",
    a: "Document verification typically takes 1-3 business days. You'll receive a notification once your account is approved and you can start accepting jobs.",
  },
  {
    q: "How do I accept jobs?",
    a: "When a nearby customer requests a service you offer, you'll receive a job notification with details including service type, location, and estimated pay. Tap to accept or decline. Once accepted, navigate to the customer's location using the in-app directions.",
  },
  {
    q: "How do I get paid?",
    a: "Earnings from completed jobs are tracked in your Provider dashboard. Payouts are processed weekly to your linked bank account. You can view your earnings history and payout status in the app under Earnings.",
  },
  {
    q: "How do I set up my payout method?",
    a: "Go to your Provider dashboard, navigate to Payout Setup, and enter your bank account information. Make sure your details are accurate to avoid payout delays.",
  },
  {
    q: "What happens if I need to cancel an accepted job?",
    a: "If you're unable to complete an accepted job, update the status in the app immediately so the customer can be matched with another provider. Excessive cancellations may affect your account standing and rating.",
  },
  {
    q: "How are ratings calculated?",
    a: "Your rating is based on customer reviews after completed services. Factors include punctuality, professionalism, and service quality. Maintaining a high rating helps you receive more job requests.",
  },
  {
    q: "What if my documents expire?",
    a: "TORC monitors document expiration dates. You'll receive a notification before your documents expire. If expired documents are not renewed promptly, your account may be temporarily suspended until updated documents are submitted.",
  },
  {
    q: "Who do I contact for support?",
    a: "Provider support is available through the app (Profile > Help & Support) or by emailing support@torcapp.com. You can also call us at +1 (240) 505-2828.",
  },
];

export function HelpCenter() {
  const [searchParams] = useSearchParams();
  const [audience, setAudience] = useState(() => (
    searchParams.get("role") === "provider" ? "provider" : "customer"
  ));

  useEffect(() => {
    setAudience(searchParams.get("role") === "provider" ? "provider" : "customer");
  }, [searchParams]);

  const features = audience === "provider" ? PROVIDER_FEATURES : CUSTOMER_FEATURES;
  const faqs = audience === "provider" ? PROVIDER_FAQ : CUSTOMER_FAQ;

  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container">
          <header className="page-header">
            <h1 className="page-title">Help Center</h1>
            <p className="page-intro">Product walkthroughs and support guidance for both customers and providers.</p>
          </header>

          <div className="audience-toggle" role="tablist" aria-label="Help center audience">
            <button
              className={`audience-toggle-btn ${audience === "customer" ? "active" : ""}`}
              onClick={() => setAudience("customer")}
            >
              Customer Guide
            </button>
            <button
              className={`audience-toggle-btn ${audience === "provider" ? "active" : ""}`}
              onClick={() => setAudience("provider")}
            >
              Provider Guide
            </button>
          </div>

          <div className="help-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="service-card">
                  <div className="service-card-body">
                    <div className="service-card-icon-wrap">
                      <Icon className="service-card-icon" />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="faq-section" style={{ maxWidth: "720px", margin: "2rem auto 0" }}>
            <h2 className="section-title">Frequently Asked Questions</h2>
            <div className="faq-list">
              {faqs.map((faq, i) => (
                <details key={i} className="faq-item">
                  <summary className="faq-question">{faq.q}</summary>
                  <p className="faq-answer">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="hero-actions" style={{ marginTop: "2rem" }}>
            <a href="mailto:support@torcapp.com" className="btn-primary">Contact Support</a>
            <a href="https://www.torcapp.com" className="btn-outline">Open App</a>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
