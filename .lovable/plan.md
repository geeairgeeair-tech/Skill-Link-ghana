
# Sprint 2A — Critical Workflow Corrections

Single focused checkpoint. Preserves all existing auth, notifications, chat, reviews, payments, disputes, admin tools. No A3/timers/Pro/subscriptions/dashboard redesign.

I'll run this as **three sequential migration batches**, each followed by UI wiring, then a final typecheck. Enum changes must be committed before code paths reference them, so batches are split.

---

## Batch 1 — Booking lifecycle DB (adds `arrived` status + arrived_at, hardens RPCs)

Migration:
- Add `arrived` to `booking_status` enum (idempotent).
- Add `bookings.arrived_at timestamptz`, `on_the_way_at`, `accepted_at` (if missing).
- Rewrite RPCs (all `SECURITY DEFINER`, existing sig preserved where possible):
  - `worker_accept_booking(_booking_id)` — auth + assigned worker + status=pending + not-expired + not-busy → status=accepted, accepted_at=now(), notify customer once.
  - `worker_mark_on_the_way(_booking_id)` — status=accepted → on_the_way, on_the_way_at=now(), notify.
  - `worker_mark_arrived(_booking_id)` — NEW; status=on_the_way → arrived, arrived_at=now(), notify.
  - `worker_start_booking(_booking_id)` — **change guard from `accepted` to `arrived`** → in_progress, started_at=now(), notify. Root cause of the "Only accepted bookings can be started" error.
  - `worker_mark_booking_completed(...)` — keep existing; require status=in_progress.
- Update `get_worker_public_status` busy set to include `arrived`.
- Update `notify_booking_events` trigger to skip status changes now handled inside RPCs (avoid duplicate notifications) — RPCs insert notifications directly; trigger keeps INSERT/decline/customer-cancel paths only.

## Batch 2 — Job edit / cancel / DOB / support DB

Migration:
- `customer_update_job_request(...)` RPC — owner + status='open' + no assigned_worker_id → update fields, bump updated_at, notify existing applicants when material fields (budget, preferred_at, category_id, city/area/landmark) change.
- `customer_cancel_job_request(_job_id, _reason)` RPC — owner + status in ('open','draft') + no assigned worker → status='cancelled', cancelled_at, cancel_reason; notify pending applicants; if assigned worker exists, raise error directing to booking cancel.
- Add columns `job_requests.cancelled_at`, `cancel_reason`, `region`, `area`, `landmark`, `location_instructions` (if missing).
- DOB: already required by `validate_worker_dob` trigger; add `profiles`-level nothing. Keep private (already gated via `get_worker_identity`).
- Support: `support_tickets` table already exists — add `ticket_ref text unique` generated column + `admin_reply_support_ticket(_id, _reply, _new_status)` RPC that notifies user. Add `submit_support_ticket(_topic, _message, _contact_email)` RPC.

## Batch 3 — UI wiring (no DB)

Files edited:
- `src/routes/_authenticated/worker.jobs.tsx` — button visibility rules per status; add "I've Arrived" button; Start Job only on `arrived`; Mark Completed only on `in_progress`; remove any direct-update Accept paths.
- `src/routes/_authenticated/worker.dashboard.tsx` — same button rules; ensure Accept uses RPC.
- `src/routes/_authenticated/bookings.tsx` — timeline shows Requested/Accepted/On the way/Arrived/Started/Worker completed/Customer confirmed with timestamps; human status labels.
- `src/routes/_authenticated/jobs.$id.apply.tsx` — friendly error surfacing (map RPC error messages), Applied state, no silent fail.
- `src/routes/_authenticated/jobs.$id.tsx` — ApplicantsPanel: list applicants w/ profile link, Hire button calling `customer_accept_job_application`.
- `src/routes/_authenticated/jobs.$id.edit.tsx` — wire to `customer_update_job_request` RPC; load fields; validate required.
- `src/routes/_authenticated/jobs.mine.tsx` — Cancel Job button → confirm modal → `customer_cancel_job_request`.
- `src/routes/_authenticated/support.tsx` — form (topic/email/message) → RPC → ticket ref shown; history list.
- `src/routes/_authenticated/admin.support.tsx` — reply box wired to `admin_reply_support_ticket`.
- `src/routes/_authenticated/worker.onboarding.tsx` — DOB required; validation.
- `src/routes/_authenticated/worker.dashboard.tsx` — DOB-missing banner (already present, verify).
- `src/routes/_authenticated/admin.tsx` / `admin.users.$userId.tsx` — require reason on reject/suspend (already required in `admin_reject_worker`); confirm notification path.

## Deferred (explicitly per instructions)
- Section 4 response timers, A3 counterparty batching, Pro contract jobs, subscriptions, dashboard redesign, email provider integration (in-app ack only; email marked "deferred").

## Testing
Typecheck + build + smoke on: apply → hire → accept → on_the_way → arrived → start → complete → confirm. Report pass/fail against the 40-item list.

---

**Approve to proceed with Batch 1.** If you'd rather I trim (e.g. skip Sections 15 Support or 9-10 Edit/Cancel this turn), say which sections to defer and I'll shrink accordingly.
