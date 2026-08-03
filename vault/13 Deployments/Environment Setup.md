---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every variable, and what it does
related:
  - [[Security]]
  - [[04 Providers/Index|Providers]]
tags:
  - deployment
---

# Environment Setup

> [!danger] Never
> Never paste a key into a chat, a commit or an issue. Nothing below is prefixed
> `NEXT_PUBLIC_` except the two Supabase values, which are public by design —
> [[Row Level Security]] is the protection, not obscurity.

```bash
# Database and auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Model
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5        # optional

# Narration
VOICE_PROVIDER=elevenlabs
VOICE_PROVIDER_API_KEY=
VOICE_ID=
VOICE_MODEL=eleven_multilingual_v2       # optional

# Images
IMAGE_PROVIDER=openai
IMAGE_PROVIDER_API_KEY=
IMAGE_MODEL=gpt-image-1                  # optional

# Stock — no key needed
STOCK_PROVIDER=openverse

# Publishing and analytics
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_CATEGORY_ID=27                   # optional

# Mode override — only when inference cannot see the truth
COMMAND_CENTRE_MODE=development          # optional
DISABLE_SIMULATED_MEDIA=true             # optional
```

See [[04 Providers/Index|Providers]] for what each costs.
