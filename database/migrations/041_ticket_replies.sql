-- Ticket replies: allow admin to respond to support tickets
-- and users to see/reply back.

CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'customer', 'provider')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket_id
  ON public.ticket_replies(ticket_id, created_at ASC);

-- Enable RLS
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ticket_replies'
      AND policyname = 'Admins have full access to ticket_replies'
  ) THEN
    CREATE POLICY "Admins have full access to ticket_replies"
      ON public.ticket_replies FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- Users can read replies on their own tickets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ticket_replies'
      AND policyname = 'Users can read replies on own tickets'
  ) THEN
    CREATE POLICY "Users can read replies on own tickets"
      ON public.ticket_replies FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.support_tickets
          WHERE support_tickets.id = ticket_replies.ticket_id
            AND support_tickets.requester_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Users can insert replies on their own tickets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ticket_replies'
      AND policyname = 'Users can reply to own tickets'
  ) THEN
    CREATE POLICY "Users can reply to own tickets"
      ON public.ticket_replies FOR INSERT
      WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
          SELECT 1 FROM public.support_tickets
          WHERE support_tickets.id = ticket_replies.ticket_id
            AND support_tickets.requester_id = auth.uid()
        )
      );
  END IF;
END $$;
