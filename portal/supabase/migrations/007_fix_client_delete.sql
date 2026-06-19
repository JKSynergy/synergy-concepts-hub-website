-- Fix "Database error deleting user" when deleting client accounts.
-- Storage objects owned by a user block auth.users deletion unless removed first.

CREATE OR REPLACE FUNCTION public.purge_user_storage(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects WHERE owner = target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_storage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_user_storage(uuid) TO service_role;
