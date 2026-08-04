// Provider-web email service.
//
// Welcome and documents_pending are admin-only templates. They should be
// triggered by server-side processes (admin actions, database triggers,
// or Edge Functions), NOT from the provider client app.
//
// The old sendWelcomeEmail/sendDocumentsPendingEmail client-side functions
// are removed. The send-email Edge Function rejects admin-only templates
// from non-admin callers (403 Forbidden).
//
// No client-invocable email functions remain for the provider app.
// Provider completion emails are sent from the customer app's JobContext
// after job completion, using the jobId-based contract.
