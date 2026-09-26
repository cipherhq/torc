-- Align ticket reply RLS and sender identity with the Support staff role.
-- Support may work tickets, but does not receive unrelated admin privileges.

DO $$
BEGIN
  IF to_regclass('public.ticket_replies') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.ticket_replies
    DROP CONSTRAINT IF EXISTS ticket_replies_sender_role_check;
  ALTER TABLE public.ticket_replies
    ADD CONSTRAINT ticket_replies_sender_role_check
    CHECK (sender_role IN ('admin', 'support', 'customer', 'provider'));
END $$;

DROP POLICY IF EXISTS "Admins have full access to ticket_replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Support staff can read ticket replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Support staff can send ticket replies" ON public.ticket_replies;
DROP POLICY IF EXISTS "Users can read replies on own tickets" ON public.ticket_replies;
DROP POLICY IF EXISTS "Users can reply to own tickets" ON public.ticket_replies;

CREATE POLICY "Admins have full access to ticket_replies"
  ON public.ticket_replies FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ))
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Support staff can read ticket replies"
  ON public.ticket_replies FOR SELECT TO authenticated
  USING (
    public.is_support_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_replies.ticket_id
    )
  );

CREATE POLICY "Support staff can send ticket replies"
  ON public.ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'support'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'support'
    )
    AND EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_replies.ticket_id
    )
  );

CREATE POLICY "Users can read replies on own tickets"
  ON public.ticket_replies FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE support_tickets.id = ticket_replies.ticket_id
      AND support_tickets.requester_id = auth.uid()
  ));

CREATE POLICY "Users can reply to own tickets"
  ON public.ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_replies.ticket_id
        AND support_tickets.requester_id = auth.uid()
        AND ticket_replies.sender_role = support_tickets.requester_role
    )
  );
