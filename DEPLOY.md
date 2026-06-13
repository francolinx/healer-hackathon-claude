# Deploying VisitPulse to Vercel + pitch-slide QR

The app is a static Vite build, so any static host works. Vercel is preconfigured
(`vercel.json`: framework `vite`, build `npm run build`, output `dist`).

## Option A - GitHub integration (recommended; runs under your account)
1. Go to https://vercel.com/new and import `francolinx/healer-hackathon-claude`.
2. Vercel auto-detects the Vite preset from `vercel.json` - no settings to change.
3. Deploy. Copy the production URL (e.g. `https://<project>.vercel.app`).

## Option B - Vercel CLI from a local checkout
```bash
npm i -g vercel
vercel login
vercel --prod      # from the repo root
```

## Optional: enable the feedback flywheel
In the Vercel project settings add env vars (see `.env.example`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and optionally
`VITE_SUPABASE_FEEDBACK_TABLE`). Unset = the app runs fully offline; feedback
stays in local state and the demo never breaks.

## Generate the QR code for the pitch slide
Once you have the production URL:
```bash
npm run qr -- https://your-production-url.vercel.app visitpulse-qr
```
Writes `visitpulse-qr.png` (1000x1000) and `visitpulse-qr.svg` in teal (#0f766e).
