import { WebsiteLayout } from "../components/WebsiteLayout";

export function DeleteAccount() {
  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "720px" }}>
          <header className="page-header">
            <h1 className="page-title">Delete Your Account</h1>
            <p className="page-intro">
              We're sorry to see you go. You can request permanent deletion of
              your TORC account and associated data.
            </p>
          </header>

          <div className="prose legal-content">
            <h2>How to Delete Your Account</h2>

            <h3>Option 1: In the App</h3>
            <ol>
              <li>Open the TORC app and sign in</li>
              <li>Go to <strong>Profile</strong> &gt; <strong>Account &amp; Security</strong></li>
              <li>Scroll down and tap <strong>Request Account Deletion</strong></li>
              <li>Enter a reason (optional) and confirm</li>
            </ol>

            <h3>Option 2: By Email</h3>
            <p>
              If you cannot access the app, send an email to{" "}
              <a href="mailto:support@torcapp.com">support@torcapp.com</a> with
              the subject line <strong>"Account Deletion Request"</strong>.
              Include the email address associated with your account so we can
              verify ownership.
            </p>

            <h2>What Happens When You Delete Your Account</h2>
            <ul>
              <li>
                Your account will be deactivated immediately and scheduled for
                permanent deletion.
              </li>
              <li>
                All personal data (name, email, phone number, profile photo)
                will be permanently deleted within <strong>30 days</strong>.
              </li>
              <li>
                Payment information is managed by Stripe and will be removed
                from our systems. You may also contact Stripe directly.
              </li>
              <li>
                Service history and receipts will be anonymized and retained for
                legal and financial record-keeping purposes.
              </li>
              <li>
                Any active service requests will be cancelled.
              </li>
            </ul>

            <h2>Data We May Retain</h2>
            <p>
              In accordance with legal obligations, we may retain certain data
              for a limited period after account deletion:
            </p>
            <ul>
              <li>
                Transaction records (anonymized) &mdash; retained for tax and
                financial compliance
              </li>
              <li>
                Fraud prevention data &mdash; retained as required by law
              </li>
            </ul>

            <h2>Questions?</h2>
            <p>
              If you have questions about account deletion or your data, contact
              us at{" "}
              <a href="mailto:support@torcapp.com">support@torcapp.com</a> or
              visit our{" "}
              <a href="/privacy">Privacy Policy</a> for more details.
            </p>
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}
