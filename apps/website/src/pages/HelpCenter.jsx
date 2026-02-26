import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CircleHelp, Smartphone, MapPinned, DollarSign, Users, BadgeCheck, FileText } from "lucide-react";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { loadPublicPlatformContent } from "../lib/publicContent";

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

export function HelpCenter() {
  const [searchParams] = useSearchParams();
  const [audience, setAudience] = useState(() => (
    searchParams.get("role") === "provider" ? "provider" : "customer"
  ));
  const [content, setContent] = useState({
    help_customer_text: "",
    help_provider_text: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAudience(searchParams.get("role") === "provider" ? "provider" : "customer");
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    loadPublicPlatformContent()
      .then((data) => {
        if (!active) return;
        setContent((prev) => ({ ...prev, ...data }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const helpText = useMemo(() => (
    audience === "provider" ? content.help_provider_text : content.help_customer_text
  ), [audience, content.help_customer_text, content.help_provider_text]);

  const features = audience === "provider" ? PROVIDER_FEATURES : CUSTOMER_FEATURES;

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

          <div className="prose legal-content" style={{ marginTop: "2rem" }}>
            {loading ? (
              <p>Loading help content...</p>
            ) : (
              <pre className="legal-pre">{helpText || "Help content is not available yet."}</pre>
            )}
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
