-- Temporarily disable the trigger
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_role_self_escalation;

-- Update the role
UPDATE public.profiles SET role = 'provider' WHERE id = '5fa95faf-d73c-4420-963e-e655de376f8c';

-- Re-enable the trigger  
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_role_self_escalation;
