# Fountain of Life School Student Photo Gallery

Online gallery for the student photography workshop at the Fountain of Life School, Juan Tomás, Dominican Republic.

The full build specification is in [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md).

## Photo storage (one-time setup)

Photos live in the R2 bucket `fol-gallery-photos`, bound to the Worker as `PHOTOS` in `wrangler.jsonc`. Create the bucket once before the first deploy that includes it:

```
npx wrangler r2 bucket create fol-gallery-photos
```

or in the Cloudflare dashboard under R2 > Create bucket, with that exact name. Keep it private (no public access); the Worker serves the images and checks who may see unapproved ones.
