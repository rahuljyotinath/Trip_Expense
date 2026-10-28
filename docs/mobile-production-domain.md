# Production URL (Phase 0)

Tripzy mobile (PWA, Capacitor, universal links) needs a **stable HTTPS origin**.

## Vercel custom domain

1. Vercel project → **Settings** → **Domains** → add e.g. `tripzy.app` or `app.yourdomain.com`.
2. DNS: follow Vercel records (A/CNAME).
3. Set **`NEXT_PUBLIC_APP_URL`** in Vercel env to `https://your-domain` (no trailing slash).
4. Redeploy **main**.

## Local / Capacitor

- `.env.local`: `NEXT_PUBLIC_APP_URL=http://127.0.0.1:43217`
- `apps/mobile`: set `CAPACITOR_SERVER_URL` to production URL before `cap sync` (see [apps/mobile/README.md](../apps/mobile/README.md)).

## Verify

```bash
curl -sS "$NEXT_PUBLIC_APP_URL/api/health" | jq '{ mode, connected }'
```

Join links must use this origin: [`docs/mobile-deeplinks.md`](mobile-deeplinks.md).
