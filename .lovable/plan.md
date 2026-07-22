# Skill Link — Sprint 2A → 2B → 2C Plan

This is a very large scope (14 sections across 3 sprints, 37 test cases, multiple migrations). To keep changes safe and reviewable, I'll execute in **strict phases**, each ending with a testable checkpoint. I will NOT start 2B until 2A passes, and NOT start 2C until 2B is stable — as you requested.

Below is the execution order. Each phase is one focused batch of migrations + code + verification.

---

## SPRINT 2A — Critical fixes (in this order)

**Phase A1 — Worker job application flow (Section 1)**
- Migration: `worker_apply_to_job(_job_id, _proposed_amount, _estimated_start, _message, _note)` RPC — SECURITY DEFINER; validates auth, approved worker, category match, job open, no duplicate, not Busy. Emits exactly one customer notification.
- Migration: `customer_accept_job_application(_application_id)` RPC — atomic: assigns worker, closes job, creates linked booking, marks other applications `rejected`, notifies all parties.
- Add `assigned_worker_id`, `booking_id` columns to `job_requests` if missing; add `job_application_id` to `bookings`.
- Wire `jobs.$id.apply.tsx` Apply button to the new RPC (replace direct insert).
- Add "View Applicants" screen on `jobs.$id.tsx` for job owner with Accept button and applicant profile drawer.
- Withdraw uses RPC-safe update.

**Phase A2 — Direct booking accept via RPC (Section 2)**
- Migration: `worker_accept_booking(_booking_id)` RPC — validates worker, pending status, not busy, not expired; sets `accepted_at`.
- Migration: `worker_mark_on_the_way(_booking_id)` RPC.
- Update `worker.dashboard.tsx` and `worker.jobs.tsx` and `bookings.tsx` Accept/OnTheWay buttons to call RPCs. Direct table UPDATEs remain blocked by existing `guard_booking_worker_updates` trigger.
- Surface clear error toasts for each failure code.

**Phase A3 — Customer identity everywhere (Section 3)**
- Migration: `get_booking_counterparty(_booking_id)` RPC returning name, avatar_url, is_verified_customer for the *other* party (auth check inside).
- Migration: batched helper `get_profiles_for_bookings(_ids uuid[])` for lists — returns only rows caller is authorized for via existing counterparty policy.
- Replace all `.select("profiles(*)")` embeds in worker.dashboard, worker.jobs, bookings, chat header, admin views (where appropriate) with a single batched profile-map query keyed by counterparty id, showing real name + avatar + initials fallback + verified badge. "Skill Link Customer" only when profile row truly missing.

**Phase A4 — Booking response timer (Section 4)**
- Migration: add `response_window_minutes` to `worker_profiles` (default 60). Add `response_deadline_at`, `expired_at`, `worker_response_seconds` to `bookings`. On booking insert trigger, set `response_deadline_at = now() + interval`.
- Migration: `expire_stale_bookings()` RPC + `pg_cron` every 5 min to flip pending→`expired`, notify customer with options.
- Reject accept RPC if `now() > response_deadline_at`.
- Update `worker_accept_booking` to record `worker_response_seconds`.
- Add worker stats view: avg response, accept-rate, expired-count (guarded — hidden until N≥3 bookings).
- UI: countdown timer component (server-computed deadline) on worker dashboard "Awaiting your response". Worker profile settings adds response-window selector. Customer expiry screen with "Post to Job Board / Browse similar / Send to another worker" actions.

**Phase A5 — Busy state / one active job (Section 5)**
- Migration: update `worker_apply_to_job` and `worker_accept_booking` to reject when `get_worker_public_status = 'busy'`.
- Migration: RLS check function `worker_is_bookable(_worker_id)`.
- `book.$workerId.tsx` — hide/replace "Book Now" with Busy CTA + Save/Follow/Choose Another.
- Preserve manual `is_available` flag; Busy is derived, never overwrites.

**Phase A6 — Location & GPS (Section 6)**
- New reusable `<LocationPicker>` component: shows explainer, "Use my current location" button, handles denied/timeout/unsupported with clear fallback to manual entry (region, city, area, landmark, address, instructions). Never traps user.
- Add fields to `job_requests` and `bookings`: `region`, `area`, `landmark`, `location_instructions` (if not present).
- Public job cards on `jobs.index.tsx` show only city + area + landmark. `get_job_request_address` (already SECURITY DEFINER) continues to gate exact address to owner/admin; extend to include assigned worker post-acceptance.
- Update `jobs.new.tsx`, `jobs.$id.edit.tsx`, `book.$workerId.tsx` to use LocationPicker.

**Phase A7 — Phone release after acceptance (Section 7)**
- Migration: `get_counterparty_phone(_booking_id)` RPC — returns phone only when caller is assigned worker AND booking status in ('accepted','on_the_way','in_progress','awaiting_customer_confirmation'), or caller is customer of an accepted booking. Records `contact_released_at`.
- UI: tap-to-call button on accepted booking details for both sides; hidden otherwise.

**Phase A8 — Job duration (Section 8)**
- Compute in a `booking_duration_seconds` generated/derived helper using `started_at` → `customer_confirmed_at` (fallback `worker_completed_at`).
- Add formatter `formatDuration()` in `src/lib/utils.ts`. Display on completed booking cards in `bookings.tsx`, `worker.jobs.tsx` history, admin booking detail.

**Phase A9 — Customer & Worker history (Section 9)**
- `bookings.tsx`: default to a smart tab (first non-empty of Pending → Accepted → Completed). Add "Previous Bookings" section under current. Show full record fields listed.
- `worker.jobs.tsx`: separate `New Opportunities | Applications | Current Work | History` tabs. History includes completed, declined, expired, cancelled, disputed, unsuccessful applications.

**Phase A10 — Admin access recovery (Section 10)**
- Verify `/admin/login` exists (it does) + Forgot Password link (it does) + `/reset-password` route redirect.
- Migration: idempotent `ensure_founder_admin(_email text)` SECURITY DEFINER — grants admin role to founder email if account exists and lacks role; no-op otherwise. Founder runs via authenticated call.
- Verify Supabase auth `site_url` / redirect config includes preview + production domain (report exact steps — cannot expose secrets).
- Provide clear founder self-service steps in the report; never expose passwords.

**Phase A11 — Test pass** — run through 37-item checklist, report pass/fail. Fix regressions before 2B.

---

## SPRINT 2B — UX improvements (after 2A passes)

**Phase B1 — Notification drawer (Section 11)** — Sheet overlay from bell; blur backdrop; keeps user on page; mark-read; deep-link on tap; "View all" preserves existing `/notifications` route.

**Phase B2 — Worker professional dashboard card (Section 12)** — profile-card hero at top of `worker.dashboard.tsx`; big availability control (Available/Unavailable/On Vacation) with derived Busy chip; shrink counters.

**Phase B3 — Chat presence (Section 13)** — Supabase Realtime Presence channel per booking chat. Show Online/Active/Typing only from live presence, never from last_login. Handle disconnect/refresh.

**Phase B4 — Browse Pros categories (Section 14)** — `workers.index.tsx` opens with All selected; horizontal category chips (scroll-x on mobile); availability filter; rating sort; nearest sort when location available.

---

## SPRINT 2C — Skill Link Pro contract-jobs MVP (after 2B stable)

- New tables: `pro_contract_jobs`, `pro_contract_applications`, `pro_screening_questions`, `pro_screening_answers`.
- Route tree: `_authenticated/pro/*` for customer (post/manage/shortlist) and worker (browse/apply). "Pro" badge component.
- Admin moderation route under `_authenticated/admin/pro-jobs.tsx`.
- Multi-worker selection flow; screening questions; shortlist/reject.
- No paid subscription collection this sprint (per your instruction).

---

## Ground rules I'll follow
- No silent policy changes on existing working RLS. Any change is called out in migration description.
- Every migration includes correct GRANTs.
- Only additive schema changes where possible; no destructive data ops.
- Each phase ends with a build + targeted verification before moving on.
- Full implementation report at the end covering root causes, migrations, RPCs, RLS, cron, routes, tests passed/failed.

---

**Please approve this plan (or tell me to trim/reorder scope).** Once approved, I'll start with **Phase A1 (worker application flow)** since that's the highest-severity broken feature, and progress through 2A in order.