# Fountain of Life School Student Photo Gallery

Online gallery for the student photography workshop at the Fountain of Life School, Juan Tomás, Dominican Republic.

The full build specification is in [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md).

## Photo storage (one-time setup)

Photos live in the R2 bucket `fol-gallery-photos`, bound to the Worker as `PHOTOS` in `wrangler.jsonc`. Create the bucket once before the first deploy that includes it:

```
npx wrangler r2 bucket create fol-gallery-photos
```

or in the Cloudflare dashboard under R2 > Create bucket, with that exact name. Keep it private (no public access); the Worker serves the images and checks who may see unapproved ones.

## Email notices (optional)

The site emails Phillip when a student changes their password, chooses photos, or submits an artist statement. It uses [Resend](https://resend.com) (free plan: 3,000 emails a month). Until the key is set, nothing is sent and the site works the same.

1. Sign up at resend.com with the address that should receive the notices (phillip@insightful.media).
2. In Resend, create an API key with "Sending access".
3. In the Cloudflare dashboard, open Workers & Pages > `folstudentphotos` > Settings > Variables and Secrets, and add a **Secret** named `RESEND_API_KEY` with that key.

Notices go to `ADMIN_EMAIL` (or `NOTIFY_TO` if set). Without a verified domain in Resend, they come from Resend's test sender, which only delivers to the Resend account's own address. Once a custom domain is verified in Resend, set `NOTIFY_FROM` (for example `Gallery <gallery@yourdomain>`).
