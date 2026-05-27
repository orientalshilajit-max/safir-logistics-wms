-- Preserve incoming shipment item/tracking row identity while editing.
-- Edits should update existing rows by id, insert only truly new rows, and
-- remove omitted unposted tracking rows without creating duplicate history.

alter table public.incoming_tracking_boxes
drop constraint if exists incoming_tracking_boxes_shipment_tracking_key;

create unique index if not exists incoming_tracking_boxes_active_tracking_key
on public.incoming_tracking_boxes (shipment_id, tracking_number)
where deleted_at is null;

create or replace function public.update_incoming_shipment_client_limited(
  p_shipment_id uuid,
  p_carrier text,
  p_tracking_rows jsonb,
  p_item_notes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_client_id uuid;
  shipment_status text;
  v_tracking_numbers text[];
  v_first_tracking text;
  v_total_boxes integer;
  retained_box_ids uuid[];
  row_record jsonb;
  row_box_id uuid;
  item_record jsonb;
begin
  select shipment.client_id, status.name
  into shipment_client_id, shipment_status
  from public.incoming_shipments shipment
  join public.statuses status on status.id = shipment.status_id
  where shipment.id = p_shipment_id
    and shipment.deleted_at is null
    and shipment.archived_at is null;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found';
  end if;

  if shipment_client_id <> public.current_client_id() then
    raise exception 'Not allowed to edit this incoming shipment';
  end if;

  if shipment_status not in ('Arrived') then
    raise exception 'Limited shipment edits are only allowed after arrival';
  end if;

  select
    coalesce(array_agg(row_value ->> 'tracking_number') filter (where length(btrim(row_value ->> 'tracking_number')) > 0), '{}'::text[]),
    coalesce(sum(coalesce(nullif(row_value ->> 'box_count', '')::integer, 1)), 0),
    coalesce(array_agg(nullif(row_value ->> 'id', '')::uuid) filter (where nullif(row_value ->> 'id', '') is not null), '{}'::uuid[])
  into v_tracking_numbers, v_total_boxes, retained_box_ids
  from jsonb_array_elements(coalesce(p_tracking_rows, '[]'::jsonb)) row_value
  where nullif(row_value ->> 'box_count', '') is null
    or nullif(row_value ->> 'box_count', '')::integer >= 1;

  v_first_tracking := v_tracking_numbers[1];

  update public.incoming_shipments
  set
    carrier = btrim(coalesce(p_carrier, '')),
    master_tracking_number = v_first_tracking,
    tracking_numbers = v_tracking_numbers,
    number_of_boxes = v_total_boxes,
    updated_at = now()
  where id = p_shipment_id;

  for item_record in select * from jsonb_array_elements(coalesce(p_item_notes, '[]'::jsonb))
  loop
    update public.incoming_items
    set notes = nullif(btrim(coalesce(item_record ->> 'notes', '')), '')
    where id = nullif(item_record ->> 'id', '')::uuid
      and shipment_id = p_shipment_id
      and deleted_at is null;
  end loop;

  update public.incoming_tracking_boxes
  set deleted_at = now()
  where shipment_id = p_shipment_id
    and inventory_posted_at is null
    and deleted_at is null
    and not (id = any(retained_box_ids));

  for row_record in select * from jsonb_array_elements(coalesce(p_tracking_rows, '[]'::jsonb))
  loop
    if length(btrim(coalesce(row_record ->> 'tracking_number', ''))) > 0 then
      row_box_id := nullif(row_record ->> 'id', '')::uuid;

      if row_box_id is not null then
        update public.incoming_tracking_boxes
        set
          tracking_number = btrim(row_record ->> 'tracking_number'),
          carrier = nullif(btrim(coalesce(p_carrier, '')), ''),
          box_count = coalesce(nullif(row_record ->> 'box_count', '')::integer, 1),
          notes = nullif(btrim(coalesce(row_record ->> 'notes', '')), ''),
          deleted_at = null
        where id = row_box_id
          and shipment_id = p_shipment_id
          and inventory_posted_at is null;
      else
        insert into public.incoming_tracking_boxes (
          shipment_id,
          tracking_number,
          carrier,
          box_count,
          notes
        )
        values (
          p_shipment_id,
          btrim(row_record ->> 'tracking_number'),
          nullif(btrim(coalesce(p_carrier, '')), ''),
          coalesce(nullif(row_record ->> 'box_count', '')::integer, 1),
          nullif(btrim(coalesce(row_record ->> 'notes', '')), '')
        );
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.update_incoming_shipment_client_limited(uuid, text, jsonb, jsonb) to authenticated;
