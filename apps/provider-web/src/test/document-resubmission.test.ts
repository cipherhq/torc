import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/pages/provider/Documents.tsx'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), '../../supabase/migrations/20260926120000_secure_document_resubmission.sql'), 'utf8');

describe('provider document authority contract', () => {
  it('uses the server resubmission RPC and never clears review fields client-side', () => {
    expect(source).toContain("rpc('resubmit_provider_document'");
    expect(source).toContain("existingDocument?.status === 'rejected'");
    expect(source).not.toContain('reviewed_by: null');
    expect(source).not.toContain('reviewed_at: null');
  });

  it('sends provider-scoped storage paths and does not submit public URLs', () => {
    expect(source).toContain('p_file_path: storagePath');
    expect(source).toContain('p_file_url: null');
  });

  it('does not expose provider expiry mutation or optimistic false state', () => {
    expect(source).toContain('handleUpdateExpiry');
    expect(source).not.toContain(".update({ expires_at");
    expect(source).toContain('readOnly');
    expect(source).toContain('disabled');
    expect(source).toContain('expiry date (managed by TORC)');
  });
});

describe('document resubmission database contract', () => {
  it('covers pending upload, review-field protection, rejection, and clean resubmission', () => {
    expect(migration).toContain("NEW.status IS DISTINCT FROM 'pending'");
    expect(migration).toContain("NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by");
    expect(migration).toContain("v_document.status <> 'rejected'");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain('rejection_reason = NULL');
    expect(migration).toContain('reviewed_by = NULL');
    expect(migration).toContain('reviewed_at = NULL');
    expect(migration).toContain("ONLY_REJECTED_DOCUMENTS_CAN_BE_RESUBMITTED");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.resubmit_provider_document");
  });
});
