-- Keep account-role conversion server-authoritative and preserve dependent data.
CREATE OR REPLACE FUNCTION public.admin_change_profile_role(p_user_id uuid, p_new_role text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old text; v_active integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN RETURN json_build_object('success',false,'error','UNAUTHORIZED'); END IF;
  IF p_new_role NOT IN ('customer','provider') THEN RETURN json_build_object('success',false,'error','INVALID_ROLE'); END IF;
  SELECT role::text INTO v_old FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','PROFILE_NOT_FOUND'); END IF;
  IF v_old = p_new_role THEN RETURN json_build_object('success',true,'changed',false,'role',v_old); END IF;
  IF v_old IN ('admin','support') THEN RETURN json_build_object('success',false,'error','TEAM_ROLE_REQUIRED'); END IF;
  IF v_old = 'provider' AND p_new_role = 'customer' THEN
    SELECT count(*) INTO v_active FROM public.jobs WHERE provider_id=p_user_id AND status NOT IN ('completed','cancelled','expired');
    IF v_active > 0 THEN RETURN json_build_object('success',false,'error','ACTIVE_JOBS','message','Provider has active jobs'); END IF;
    UPDATE public.provider_profiles SET is_online=false, is_verified=false, updated_at=now() WHERE id=p_user_id;
  ELSIF v_old = 'customer' AND p_new_role = 'provider' THEN
    INSERT INTO public.provider_profiles (id,is_verified,is_online,services,created_at,updated_at) VALUES (p_user_id,false,false,'{}',now(),now()) ON CONFLICT (id) DO NOTHING;
  END IF;
  UPDATE public.profiles SET role=p_new_role, updated_at=now() WHERE id=p_user_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,details) VALUES (v_actor,'change_profile_role','profile',p_user_id,jsonb_build_object('previous_role',v_old,'new_role',p_new_role));
  RETURN json_build_object('success',true,'changed',true,'role',p_new_role);
END; $$;
REVOKE ALL ON FUNCTION public.admin_change_profile_role(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_profile_role(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_change_profile_role(uuid,text) TO authenticated;
