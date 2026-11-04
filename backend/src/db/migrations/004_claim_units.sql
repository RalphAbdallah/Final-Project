-- One person per unit (team decision, 3 November 2026): claims on an item can never add
-- up to more than its quantity. Three phones claim at once at the table, so the check and
-- the write happen together: the item row is locked first, then the other claims are
-- counted (each statement here sees what committed before the lock was granted).
-- Returns false, and changes nothing, when there aren't enough units left.
create function claim_units(p_item uuid, p_member uuid, p_units integer) returns boolean
language plpgsql
as $$
declare
  available integer;
begin
  select quantity into available from items where id = p_item for update;
  if not found then
    return false;
  end if;

  select available - coalesce(sum(units), 0) into available
  from item_claims
  where item_id = p_item and member_id <> p_member;

  if p_units > available then
    return false;
  end if;

  insert into item_claims (item_id, member_id, units) values (p_item, p_member, p_units)
  on conflict (item_id, member_id) do update set units = excluded.units;
  return true;
end;
$$;

-- Only the backend calls this; keep it out of Supabase's public API.
revoke execute on function claim_units(uuid, uuid, integer) from public, anon, authenticated;
