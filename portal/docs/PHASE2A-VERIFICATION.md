# Phase 2A verification (browser)

Method: the real portal (`next dev`) driven in Chromium (Playwright) against a local stand-in for Supabase Auth and PostgREST with admin, staff and client test accounts and sample data. The cloud sandbox cannot reach the real Supabase, so this proves UI, routing and navigation, NOT database RLS (covered by the 88 PGlite tests). Fonts (Google Fonts) were blocked in the sandbox, so typography fell back to system fonts.

Defects found and fixed in this pass
1. Login brand headline was invisible (navy on navy).
2. Dialogs did not take focus, ignored Escape, had no Tab trap and did not return focus. All dialogs now use one shared `Dialog`.
3. Closed mobile drawer stayed in the tab order; now hidden until opened.
4. Project header status rendered as a label; project staff name showed "Unknown" when the embed returned an object.
5. Staff opening /admin/staff was sent to /client; now /admin.
6. Section headings inside the bridged project sections were inconsistent.

Still open (not fixed here): open mobile drawer has no focus trap; legacy pages sit under a light tab bar; client dashboard labels and currency are still the old ones.
