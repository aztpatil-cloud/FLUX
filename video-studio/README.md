# Flux Video Studio

A dedicated reference-analysis workspace for Flux. This app lives in the `video-studio/` folder so it can be deployed independently while sharing the existing Flux Supabase project.

## Included in v0.1
- Supabase email magic-link sign-in
- Video project creation
- Private upload of reference videos, stock footage, images and audio
- Asset list and project overview
- Style Library and API usage dashboard shells

## Environment
Copy `.env.example` to `.env.local` and set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase publishable key)

The Supabase migration `create_flux_video_studio` creates the isolated video tables and private `flux-video-assets` bucket with owner-scoped RLS policies.

## Next integration
The FFmpeg/PySceneDetect processing worker and Claude API analysis pipeline are intentionally not represented as active yet. The dashboard currently stores uploads and metadata; analysis and rendering are the next implementation milestone.

Run locally with `npm install` and `npm run dev`.
