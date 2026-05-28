-- =============================================================================
-- "I'm Back" — coach returns from travel.
--
-- A read-only coach cannot update coach_availability or insert notifications
-- under RLS (see 20250528120100_rls_policies.sql). This SECURITY DEFINER
-- function performs the exact, scoped return-from-travel operation on their
-- behalf so we never have to loosen those policies:
--   1. Removes the travel block for the given week by flipping the coach's own
--      `traveling` availability rows to `available` (we never delete records —
--      the row is preserved with a return note for the history trail).
--   2. Alerts every active admin with a notification.
--
-- Source of truth: CURSOR_CONTEXT.md "Key Business Logic" — Im Back button.
-- =============================================================================

create or replace function public.coach_im_back(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id        uuid;
  v_coach_name      text;
  v_blocks_cleared  int := 0;
  v_admins_notified int := 0;
begin
  v_coach_id := public.current_coach_id();
  if v_coach_id is null then
    raise exception 'No coach is linked to the current user.';
  end if;

  select full_name into v_coach_name from public.coaches where id = v_coach_id;

  -- 1. Remove the travel block: deactivate (never delete) the traveling rows.
  update public.coach_availability
     set status = 'available',
         notes  = trim(both ' ' from
                    coalesce(notes, '') ||
                    ' [Returned via I''m Back on ' || to_char(now(), 'YYYY-MM-DD') || ']')
   where coach_id        = v_coach_id
     and week_start_date = p_week_start
     and status          = 'traveling';
  get diagnostics v_blocks_cleared = row_count;

  -- 2. Alert every active admin that the coach is back and needs assigning.
  insert into public.notifications (recipient_coach_id, type, message)
  select c.id,
         'coach_returned',
         coalesce(v_coach_name, 'A coach') ||
           ' pressed "I''m Back" for the week of ' ||
           to_char(p_week_start, 'Mon DD, YYYY') ||
           '. Travel block cleared — please assign their week.'
    from public.coaches c
   where c.is_admin = true
     and c.is_active = true;
  get diagnostics v_admins_notified = row_count;

  return jsonb_build_object(
    'blocks_cleared',  v_blocks_cleared,
    'admins_notified', v_admins_notified
  );
end;
$$;

-- This function mutates data, so it must never be reachable by the anon role
-- (Supabase grants EXECUTE to anon/authenticated by default on public funcs).
revoke all on function public.coach_im_back(date) from public;
revoke execute on function public.coach_im_back(date) from anon;
grant execute on function public.coach_im_back(date) to authenticated;
