-- LIBRE femme
-- Migration: import expenses and deterministic landed-cost allocation.
-- Review and test before applying to Supabase.

begin;

create table public.purchase_expenses (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  category text not null
    check (category in ('agency', 'freight', 'customs', 'other')),
  description text not null,
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  allocation_method text not null
    check (allocation_method in ('purchase_value', 'weight', 'quantity')),
  created_at timestamptz not null default now(),
  constraint purchase_expenses_description_not_blank
    check (length(trim(description)) > 0)
);

create index purchase_expenses_purchase_id_idx
  on public.purchase_expenses(purchase_id);

create table public.purchase_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.purchase_expenses(id) on delete restrict,
  purchase_item_id uuid not null references public.purchase_items(id) on delete restrict,
  allocated_amount_usd numeric(14,2) not null check (allocated_amount_usd >= 0),
  created_at timestamptz not null default now(),
  constraint purchase_expense_allocation_once unique (expense_id, purchase_item_id)
);

create index purchase_expense_allocations_item_idx
  on public.purchase_expense_allocations(purchase_item_id);

create or replace function public.guard_purchase_expense_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_purchase_id uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    parent_purchase_id := old.purchase_id;
  else
    parent_purchase_id := new.purchase_id;
  end if;

  if tg_op = 'UPDATE' and new.purchase_id is distinct from old.purchase_id then
    raise exception 'An expense cannot be moved to another purchase';
  end if;

  select p.status into parent_status
  from public.purchases p
  where p.id = parent_purchase_id
  for update;

  if parent_status is null then
    raise exception 'Purchase not found for expense';
  end if;
  if parent_status not in ('draft', 'ordered') then
    raise exception 'Expenses can only change while purchase is draft or ordered';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger purchase_expenses_guard_insert
before insert on public.purchase_expenses
for each row execute function public.guard_purchase_expense_write();

create trigger purchase_expenses_guard_update
before update on public.purchase_expenses
for each row execute function public.guard_purchase_expense_write();

create trigger purchase_expenses_guard_delete
before delete on public.purchase_expenses
for each row execute function public.guard_purchase_expense_write();

create or replace function public.allocate_purchase_expenses(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase_status text;
  expense_row record;
  item_row record;
  total_weight numeric;
  allocation_weight numeric;
  allocated_so_far numeric(14,2);
  allocation_amount numeric(14,2);
  last_item_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can allocate purchase expenses';
  end if;

  select p.status into purchase_status
  from public.purchases p
  where p.id = p_purchase_id
  for update;

  if purchase_status is null then
    raise exception 'Purchase not found';
  end if;
  if purchase_status not in ('draft', 'ordered') then
    raise exception 'Costs can only be allocated before purchase receipt';
  end if;
  if not exists (
    select 1 from public.purchase_items pi where pi.purchase_id = p_purchase_id
  ) then
    if exists (select 1 from public.purchase_expenses pe where pe.purchase_id = p_purchase_id) then
      raise exception 'Add purchase items before allocating expenses';
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.purchase_expenses pe
    join public.purchase_items pi on pi.purchase_id = pe.purchase_id
    join public.product_variants pv on pv.id = pi.variant_id
    where pe.purchase_id = p_purchase_id
      and pe.allocation_method = 'weight'
      and (pv.weight_lb is null or pv.weight_lb <= 0)
  ) then
    raise exception 'Weight-based allocation requires a positive weight for every purchase item';
  end if;

  delete from public.purchase_expense_allocations ea
  using public.purchase_expenses pe
  where ea.expense_id = pe.id
    and pe.purchase_id = p_purchase_id;

  update public.purchase_items pi
  set allocated_cost_usd = 0
  where pi.purchase_id = p_purchase_id;

  for expense_row in
    select pe.id, pe.amount_usd, pe.allocation_method
    from public.purchase_expenses pe
    where pe.purchase_id = p_purchase_id
    order by pe.id
  loop
    select sum(
      case expense_row.allocation_method
        when 'purchase_value' then pi.line_total * p.exchange_rate_to_usd
        when 'weight' then pi.quantity * pv.weight_lb
        when 'quantity' then pi.quantity::numeric
      end
    )
    into total_weight
    from public.purchase_items pi
    join public.product_variants pv on pv.id = pi.variant_id
    join public.purchases p on p.id = pi.purchase_id
    where pi.purchase_id = p_purchase_id;

    if total_weight is null or total_weight <= 0 then
      raise exception 'Cannot allocate expense % because total allocation weight is zero', expense_row.id;
    end if;

    select pi.id into last_item_id
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
    order by pi.id desc
    limit 1;

    allocated_so_far := 0;

    for item_row in
      select pi.id,
        case expense_row.allocation_method
          when 'purchase_value' then pi.line_total * p.exchange_rate_to_usd
          when 'weight' then pi.quantity * pv.weight_lb
          when 'quantity' then pi.quantity::numeric
        end as item_weight
      from public.purchase_items pi
      join public.product_variants pv on pv.id = pi.variant_id
      join public.purchases p on p.id = pi.purchase_id
      where pi.purchase_id = p_purchase_id
      order by pi.id
    loop
      allocation_weight := item_row.item_weight;
      if allocation_weight is null or allocation_weight < 0 then
        raise exception 'Invalid allocation weight for purchase item %', item_row.id;
      end if;

      if item_row.id = last_item_id then
        allocation_amount := expense_row.amount_usd - allocated_so_far;
      else
        allocation_amount := trunc(expense_row.amount_usd * allocation_weight / total_weight, 2);
        allocated_so_far := allocated_so_far + allocation_amount;
      end if;

      insert into public.purchase_expense_allocations (
        expense_id, purchase_item_id, allocated_amount_usd
      ) values (expense_row.id, item_row.id, allocation_amount);
    end loop;
  end loop;

  update public.purchase_items pi
  set allocated_cost_usd = coalesce((
    select sum(ea.allocated_amount_usd)
    from public.purchase_expense_allocations ea
    where ea.purchase_item_id = pi.id
  ), 0)
  where pi.purchase_id = p_purchase_id;
end;
$$;

revoke all on function public.allocate_purchase_expenses(uuid) from public, anon;
grant execute on function public.allocate_purchase_expenses(uuid) to authenticated;

-- Recalculate automatically before the existing receipt trigger values the stock.
create or replace function public.prepare_purchase_costs_before_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'received' and new.status = 'received' then
    perform public.allocate_purchase_expenses(new.id);
  end if;
  return new;
end;
$$;

create trigger purchases_prepare_costs
before update of status on public.purchases
for each row execute function public.prepare_purchase_costs_before_receipt();

alter table public.purchase_expenses enable row level security;
alter table public.purchase_expense_allocations enable row level security;

create policy purchase_expenses_admin_all on public.purchase_expenses
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy purchase_expense_allocations_admin_read on public.purchase_expense_allocations
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.purchase_expenses, public.purchase_expense_allocations
  from anon, authenticated;

grant select, insert, update, delete on public.purchase_expenses to authenticated;
grant select on public.purchase_expense_allocations to authenticated;

commit;
