-- Requests are the primary warehouse workflow. Add simplified request statuses
-- while preserving existing historical statuses.

alter table public.service_requests
drop constraint if exists service_requests_status_check;

alter table public.service_requests
add constraint service_requests_status_check check (
  status in (
    'Draft',
    'Submitted',
    'Pending Approval',
    'Approved',
    'In Progress',
    'Waiting Labels',
    'Labels Uploaded',
    'Ready to Pack',
    'Ready for Prep',
    'Prep in Progress',
    'QC Check',
    'Packing',
    'Ready to Ship',
    'Shipped',
    'Completed',
    'Issue / On Hold',
    'On Hold',
    'Need Client Action',
    'Cancelled',
    'Rejected'
  )
);

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('service_request', 'In Progress', 'blue', 55, true, true),
  ('service_request', 'Issue / On Hold', 'rose', 90, true, true),
  ('service_request', 'Cancelled', 'slate', 100, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();
