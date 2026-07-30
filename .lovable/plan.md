## Worker Experience Audit — Skill Link

I audited every worker-facing route, the shared navigation, and the database functions behind them. Below is what already works, what is broken, and what is missing — followed by the build plan.

### Already working (do not touch)
- Auth: registration with worker role, login, forgot/reset password, session persistence, role-based redirect to `/worker/dashboard`.
- Verification lifecycle: pending / approved / rejected + rejection reason + resubmit button.
- Availability toggle, automatic Busy state from active bookings (race-safe DB trigger).
- Job marketplace browse + category matching, apply, edit application.
- Booking lifecycle: accept, decline with reason, estimate (versioned) + customer approval, on-the-way, arrived, start, complete with variance reason, dispute, canonical `/bookings/:id` page with timeline, chat.
- Notifications with realtime toast and deep links; support tickets.

### Gaps found
**Onboarding (blocking for Beta)**
- No Ghana Card image upload and no selfie upload anywhere in the app, although verification depends on them and admin already renders them.
- No portfolio image upload for workers (`worker_portfolio` table exists, unused on the worker side).
- No profile photo step inside worker onboarding.
- No professional-commitment acknowledgement step.

**Dashboard**
- Shows only Total / Pending / Done. Missing: today's jobs, upcoming jobs, pending applications count, unread messages, earnings summary, reviews, support tickets, profile-completion meter, return-job requests.

**Missing pages**
- `/worker/earnings` — no earnings or payment history anywhere.
- `/worker/reviews` — worker cannot see reviews received.
- `/worker/portfolio` — no portfolio management.
- Worker profile settings are split and partly unreachable (pricing/service area only editable through the onboarding form).

**Application flow**
- No Withdraw Application action (the `withdrawn` status exists in the database but is unreachable).

**Booking flow**
- No progress photos during work, no completion photos.
- No Pause / Resume work.
- Payment status is stored but never surfaced to the worker; no invoice view.

**Chat**
- No attachments/photos, no read status.

**Return Job — does not exist at all**
- No schema, no notifications, no reopening logic, no resolution review. This is the largest single piece of new work.

**Navigation**
- Worker bottom nav has no entry point to Applications, Earnings, Reviews or Notifications hub beyond the bell.
- `/worker/subscription` is effectively a dead page in free Beta.
- Some worker pages lack a Back button.

---

## Build plan

### Phase 1 — Onboarding completeness and identity uploads
Add a reusable secure image-upload control and wire it into worker onboarding: profile photo, Ghana Card, selfie, portfolio images, plus a professional-commitment checkbox. Split onboarding into clear sections with save-and-continue so a partially complete profile is never lost. Storage buckets stay private with owner/admin read policies.

### Phase 2 — Worker profile, portfolio, pricing and settings
A proper `/worker/profile` hub: edit bio, professions, service areas, pricing, availability, documents, verification status. Portfolio add/remove/reorder. Reachable from Profile and Dashboard.

### Phase 3 — Dashboard rebuild
Data-driven dashboard cards: verification, availability, today's jobs, upcoming jobs, pending applications, unread messages, unread notifications, earnings summary, completed jobs, average rating and latest reviews, open support tickets, profile-completion percentage, return-job requests.

### Phase 4 — Earnings, payments and reviews
- `/worker/earnings`: totals (paid, awaiting payment, this month), per-booking payment history, simple printable invoice per completed booking.
- `/worker/reviews`: all reviews received with rating breakdown.
- Payment status shown on the booking page for the worker.

### Phase 5 — Application and booking gaps
- Withdraw Application (RPC + button + customer notification).
- Progress photos during work and completion photos, stored on the booking and visible to both parties and admin.
- Pause / Resume work with timeline entries.
- Chat attachments (images) with read status.

### Phase 6 — Return Job
New `return_requests` table plus RPCs. Customer requests a return visit on a completed booking with an explanation and photos. Worker receives a notification and can Accept, Schedule, Request more information, or Decline with a reason. On acceptance the booking reopens, the worker becomes Busy, the original chat unlocks and the timeline continues. After completion the customer answers "Issue resolved? Completely / Partially / Not resolved", stored with the review.

### Phase 7 — Navigation and notification audit
Every worker page gets a Back button and a route home. Add Applications / Earnings / Reviews entry points. Remove or repurpose the dead subscription page. Verify every notification type produces a working deep link, and add notifications for the events currently missing them (payment, withdrawal, return job, portfolio/verification changes).

### Technical notes
- All new database work goes through migrations with explicit GRANTs and RLS; sensitive columns stay behind existing `SECURITY DEFINER` accessors.
- No mock data: everything reads from the existing schema.
- Existing RPCs and statuses are extended, never replaced, so current flows keep working.

Phases 1–5 and 7 are refinements of existing surfaces. Phase 6 is genuinely new product behaviour and carries most of the risk, so it runs last, after the rest of the worker journey is solid.
