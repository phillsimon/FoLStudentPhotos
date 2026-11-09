# Build Prompt: Fountain of Life School Student Photo Gallery

## Project summary

Build a bilingual online photo gallery that displays in English or Spanish based on the visitor's country, with a button to switch languages, for a high school photography workshop I taught at the Fountain of Life School in Juan Tomás, Dominican Republic. Each student has their own page with a grid of their photographs, their first name, and a brief artist statement. Visitors browse low-resolution web images. Students with accounts I create can sign in and download full-resolution files of their own photographs for printing. I am the super admin and manage all content.

The site must run entirely on the **Cloudflare free tier**.

Deploy first to the free `workers.dev` address (Worker name: `folstudentphotos`). A custom domain will be added later, so nothing in the code may hard-code the hostname; build all URLs relative to the request.

## Tech stack

- **Hosting/runtime:** Cloudflare Workers with static assets (single Worker serving the frontend and the API). Configure with `wrangler.jsonc`.
- **Frontend:** React + Vite + TypeScript. Plain CSS with custom properties for theming (no heavy UI framework).
- **API:** Hono running in the Worker.
- **Database:** Cloudflare D1 (SQLite). Migrations live in `worker/schema.js`, and the Worker applies them itself on first use.
- **File storage:** Cloudflare R2, one private bucket. Nothing in the bucket is publicly listable.
- **Translation:** Workers AI, `@cf/meta/m2m100-1.2b` (English ↔ Spanish, both directions).
- **Auth:** Built in-house. Passwords hashed with PBKDF2 via WebCrypto. Sessions stored in D1, sent as HttpOnly, Secure, SameSite=Lax cookies. No third-party auth service.
- **Do not use** Cloudflare Images, Cloudflare Stream, or any paid service.

## Image pipeline (important: keep within free tier)

Every photo is stored as three files in R2:

| Variant | Spec | Access |
|---|---|---|
| `original` | File exactly as exported from Lightroom | Private. Only via authenticated download route |
| `web` | Long edge 2048px, JPEG quality ~82 (WebP optional with JPEG fallback) | Public via Worker route, long cache headers |
| `thumb` | Long edge 600px, JPEG quality ~78 | Public via Worker route, long cache headers |

Generate `web` and `thumb` **in the admin's browser** at upload time using `createImageBitmap` + `OffscreenCanvas` (with canvas fallback), honoring EXIF orientation. Upload all three variants to the Worker, which writes them to R2. This avoids server-side image processing entirely.

R2 key structure: `students/{studentSlug}/{photoId}/original.jpg`, `.../web.jpg`, `.../thumb.jpg`, plus `site/` for the logo and homepage hero image.

Read metadata from each file with `exifr` at upload: Title, Caption/Description, capture date, width, height. Store in D1.

## Lightroom upload workflow

There is no Lightroom-to-Cloudflare plugin. The workflow is:

1. I create one Lightroom Classic export preset: JPEG, sRGB, quality 85–90, long edge up to 4000px (or full size), metadata "All except camera & Camera Raw info" so Title and Caption are included.
2. I export each student's selects into a folder.
3. In the admin, I open a student's page and **drag the whole folder (or a multi-file selection) onto a drop zone**.

The admin uploader must:
- Accept drag-and-drop of many files at once (100+), and a standard file picker.
- Show a per-file progress list, process files with limited concurrency (e.g. 3 at a time), and retry failed uploads.
- Skip and flag duplicates (same filename + size already on that student).
- Default sort order by capture date, then filename. I can reorder afterward.
- Warn if a single original is over 50 MB.

## Data model (D1)

- `students`: id, slug, first_name, statement_en, statement_es (the approved, public versions), statement_draft, statement_draft_lang (`en` | `es`), statement_status (`none` | `draft` | `submitted` | `changes_requested` | `approved`), statement_review_note, statement_submitted_at, statement_reviewed_at, cover_photo_id, sort_order, is_published, created_at, updated_at
- `photos`: id, student_id, title, caption, text_updated_by (user id), text_updated_at, capture_date, width, height, original_bytes, original_key, web_key, thumb_key, sort_order, is_published, created_at
- `users`: id, login, password_hash, display_name, role (`superadmin` | `student`), student_slug (the gallery they own), must_change, temp_issued_at, password_changed_at, last_login_at, created_at
- `sessions`: id, user_id, expires_at
- `site_content`: key, value_en, value_es (for workshop description, homepage headings, footer text)
- `site_settings`: key, value (logo key, hero image key, brand colors, whether students may download any photo or only their own)

Seed the super admin account from Worker secrets (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) on first run.

## Public pages

### Homepage
- Branded with Fountain of Life School logo and colors (see Branding below).
- Hero image: group photo of the workshop participants and me (uploaded through admin).
- Workshop description, shown in the visitor's current language.
- Grid of student cards: each card shows the student's approved card photo (or their first approved photo) and first name, links to their page.
- Light/dark mode toggle in the header.

### Student page
- URL: `/estudiantes/<first-name>`.
- Student's first name as the page heading.
- Artist statement, shown in the visitor's current language.
- Photo grid of `thumb` images. Use a justified or masonry layout that preserves each photo's aspect ratio (no cropping). Lazy-load images.
- Previous/next student navigation at the bottom.

### Lightbox / slideshow
- Clicking any photo opens it enlarged (the `web` variant) in a full-screen overlay.
- Navigate with on-screen arrows, keyboard left/right, and touch swipe. Esc or close button exits.
- Show counter ("12 / 48"), and title/caption if present.
- Preload the adjacent images.
- Update the URL (e.g. `?photo=ID`) so a specific photo can be linked and the browser back button closes the lightbox.
- If the signed-in user is allowed to download this photo, show a **"Download full resolution"** / **"Descargar en alta resolución"** button (label in the current language).
- Optional play/pause autoplay slideshow mode.

## Student accounts and downloads

- No public registration. Every student has an account, and their login is their first name. I create a temporary password on the Accounts screen in `/admin`; it is shown only once so I can send it.
- At first login the student must choose a new password (at least 8 characters) before doing anything else. The server enforces this.
- Sign in link is in the footer. No email sending; if a student forgets their password, I issue a new temporary one, which also signs them out everywhere.
- My login is `phillip@insightful.media`, created from the `ADMIN_EMAIL` var and the `ADMIN_PASSWORD` secret.
- Download route: `GET /api/photos/:id/download`. The Worker verifies the session, verifies the user owns the photo's student gallery (or that the site setting allows any student to download any photo), then streams the original from R2 with `Content-Disposition: attachment; filename="{FirstName}_{originalFilename}"`.
- Originals must never be reachable without this check. No public R2 URLs for originals.
- Rate-limit login attempts per IP and per login (store counters in D1).

### Choosing which photos go public
- I upload all of a student's photos. They start private: only the student and I can see them.
- The student opens "Elegir mis fotos" on their page and ticks the photos they want shown, and taps a star to pick the photo for their card on the homepage. Ticks are sent to me for review; nothing a student picks is public before I approve it. A student can take a photo down at any time without review.
- In `/admin`, "Photos to review" lists every picked photo grouped by student with a checkbox on each. I tick one or many (or a whole student, or select all) and approve or decline them together. Declined photos show "Not approved" to the student, who can pick them again.
- The student's card photo pick also waits for my approval ("Card photos to review"). Approving it also approves that photo if it's still waiting.
- I can tick, untick and star photos myself in the same pop-up on any student page, and my changes publish immediately.
- Until a student has at least one approved photo, their page and card keep showing the placeholder images.

### Editing: pencils and pop-ups
- When signed in, a **pencil icon** appears next to anything the person may edit. Clicking it opens a pop-up with that content. Visitors never see pencils. There is no separate "My photos" page.
- **Line breaks in any editor become paragraph breaks** on the site.
- Pop-ups must work well on a phone (full screen, large tap targets). The photo pop-up has "Save and next" for captioning many photos quickly.
- **Students:** their own statement, and their own photo titles and captions.
- **Me:** all of the above on every student page, plus the workshop text on the home page. My edits publish immediately.

### Titles and captions
- Limits: title up to 100 characters, caption up to 500. Plain text only. Live character count.
- Display exactly as written in both English and Spanish views. Changes go live immediately. Record who changed them and when, and list student edits in `/admin`.

### Artist statements
- Students write in Spanish, up to 1,500 characters, and see only the Spanish version of their statement.
- A student's pencil saves the text and submits it for my review. The current approved version stays live until I publish the new one. Nothing a student writes in a statement is public before I publish it.
- Status shown: Waiting for review or Changes requested. If I request changes, the student sees my note and can edit and resubmit.
- My pop-up shows Spanish and English side by side, with an English draft from Workers AI, and I can edit both. Publish needs both languages. If translation fails, I can write the English by hand.

## Super admin

Accessible at `/admin`, superadmin role only. Must be usable on a laptop and a tablet.

- **Students:** create, edit, delete, reorder, publish/unpublish. Edit first name, choose cover photo.
- **Artist statement review:** a review queue lists every submitted statement, with a count badge in the admin navigation. For each one I can:
  - **Approve.** Each queue entry links to the student's page, where the pencil opens both languages side by side with an AI English draft. I can edit either, then publish.
  - **Request edits.** I write a note to the student (with a translate button so I can write it in English and send it in Spanish), and the statement goes back to them with status "Changes requested".
  - I can still write or edit any statement directly myself, bypassing the student workflow (for example, for a student who doesn't register).
- **Photos:** bulk upload (see workflow above), edit title/caption (I can override anything a student wrote; show a "Student edited" badge with the date on photos a student has changed, and a filter to list them), reorder by drag-and-drop, move to another student, publish/unpublish, delete (deletes all three R2 variants and the D1 row, with a confirmation).
- **Homepage:** upload/replace logo and hero image, edit workshop description using the same English → Spanish translate-and-edit flow.
- **Accounts:** list each student's login and status, and issue temporary passwords.
- **Settings:** brand colors, download policy (own photos only vs. all photos).
- **Storage meter:** show total R2 bytes used (sum of stored sizes in D1) against the 10 GB free allowance, so I know where I stand.

## Branding and theming

- School name: **Centro Educativo Manantial de Vida** (English: Fountain of Life School). Lead with Spanish on the site and branding; the crest text stays Spanish in both languages.
- Logo: the Manantial de Vida crest (SVG, in `src/components/Crest.jsx`).
- Colors: primary blue **#1F7CC2** (the crest's bright blue), navy **#23317A**, red accent **#D9332B**. Headings in Nunito. Make colors editable in admin settings.
- Define colors as CSS custom properties on `:root`. Provide a light theme and a dark theme.
- For dark mode, use a near-black neutral background (not a tinted brand color) so photos read accurately; apply brand colors to the header, accents and links. For light mode, use an off-white neutral background.
- Theme toggle: defaults to the visitor's system preference, remembers their choice in localStorage (wrapped in try/catch).
- Typography: a clean, readable sans-serif; let photos dominate.

## Language

The whole site (interface labels, artist statements, workshop description, messages) displays in **one language at a time**, English or Spanish.

**Default language by country of origin:**
- Detect the visitor's country in the Worker with `request.cf.country` (free, no geolocation service needed).
- **Spanish** for the Dominican Republic and other Spanish-speaking countries: DO, ES, MX, GT, HN, SV, NI, CR, PA, CU, PR, CO, VE, EC, PE, BO, CL, AR, UY, PY, GQ.
- **English** for the United States and all other countries, and as the fallback if the country can't be determined.

**Language switch button:**
- A clearly visible button in the header, on every page including the admin, that switches to the other language. Label it in the language it switches *to*: "Español" when viewing English, "English" when viewing Spanish.
- Switching is instant, with no page reload and no loss of place (an open lightbox stays open on the same photo).
- The visitor's choice overrides country detection and is remembered in a cookie (`lang=en|es`, 1 year) so the Worker serves the right language on the first render of later visits.
- Priority order: saved choice → country → English.

**Implementation:**
- Keep all interface strings in two translation files (`en.json`, `es.json`). No hard-coded UI text in components.
- The API returns both `statement_en` and `statement_es`; the frontend displays the one matching the current language.
- If a Spanish text field is empty, fall back to the English text rather than showing a blank.
- Set `<html lang>` to the current language and update it when the visitor switches.

## Privacy and safety (students are minors)

- Display first names only. Never display student emails anywhere public.
- Strip GPS location data from the `web` and `thumb` variants (canvas re-encoding does this automatically; confirm no EXIF is carried over to public variants).
- Add `<meta name="robots" content="noindex">` as a setting I can toggle, defaulting to on.
- There is no public registration. Only I can issue student logins.

## Accessibility and performance

- Alt text on every image (title or caption if present, otherwise "Photograph by {FirstName}").
- Full keyboard navigation, visible focus states, focus trapped in the lightbox.
- Responsive from 360px phones to large desktop monitors; no horizontal scroll.
- Thumbnails lazy-loaded; public image routes return `Cache-Control: public, max-age=31536000, immutable`.
- Keep Worker CPU usage low: no image processing on the server.

## Deliverables

1. Complete source code in a Git repository structure.
2. `wrangler.jsonc` with D1, R2 and Workers AI bindings.
3. D1 migrations in `worker/schema.js`.
4. A `README.md` with step-by-step setup: creating the R2 bucket and D1 database, setting secrets, running locally with `wrangler dev`, deploying with `wrangler deploy`, and connecting a custom domain.
5. A short section in the README documenting the Lightroom Classic export preset settings.

Build the public gallery and lightbox first, then the admin upload pipeline, then auth and downloads, then student editing (captions and artist statements) with the review queue, then the translation feature.
