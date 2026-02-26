import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { loadPublicPlatformContent } from "../lib/publicContent";

export function Terms() {
  const [searchParams] = useSearchParams();
  const [audience, setAudience] = useState(() => (
    searchParams.get("role") === "provider" ? "provider" : "customer"
  ));
  const [content, setContent] = useState({
    terms_version: "v1.0.0",
    terms_last_updated: "2026-02-26",
    terms_customer_text: "",
    terms_provider_text: "",
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

  const termsText = useMemo(() => (
    audience === "provider" ? content.terms_provider_text : content.terms_customer_text
  ), [audience, content.terms_customer_text, content.terms_provider_text]);

  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "720px" }}>
          <header className="page-header">
            <h1 className="page-title">Terms of Service</h1>
            <p className="page-intro">Version {content.terms_version} · Last updated: {content.terms_last_updated}</p>
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
            ) : (
              <pre className="legal-pre">{termsText || "Terms content is not available yet."}</pre>
            )}
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
