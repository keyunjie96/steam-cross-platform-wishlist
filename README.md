# Steam Cross-Platform Wishlist

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.6.2-blue.svg)](https://github.com/keyunjie96/steam-cross-platform-wishlist/releases)
[![Chrome MV3](https://img.shields.io/badge/manifest-v3-green.svg)]()

Shows which Steam wishlist games are also on Switch, PlayStation, Xbox, or Steam Deck. Plus HowLongToBeat times.

![Screenshot](assets/marketing/promo-tile-920x680.png)

## Why?

Steam's wishlist doesn't show platform availability. Checking manually means clicking through 4 storefronts per game. This extension does that lookup automatically using Wikidata (free, crowd-sourced) and shows icons inline.

No price history, no tracking, no telemetry. ~50KB, runs entirely client-side.

Built because I got tired of checking 4 storefronts manually. Open source because cross-platform info shouldn't require a subscription.

**Philosophy:** One tool, one job. No feature creep, no cloud sync, no accounts. Your wishlist data stays in your browser.

## Install

```bash
npm i && npm run build
```

Then `chrome://extensions` → Developer mode → Load unpacked → select this folder.

No backend. Everything runs client-side with a 7-day cache.

**Requirements:** Chrome 88+ (MV3). Firefox/Edge not supported yet.

## Features

- **Cross-platform icons** — Nintendo Switch, PlayStation, Xbox, Steam Deck status at a glance
- **Completion times** — HowLongToBeat data inline (when their API cooperates)
- **Direct store links** — Click any icon to jump to that platform's store page
- **No backend** — Runs entirely client-side with 7-day cache
- **No telemetry** — Wikidata queries only, nothing phoned home

## How it works

| Source | What | Catch |
|--------|------|-------|
| Wikidata SPARQL | Platform availability | Incomplete coverage (volunteer-maintained) |
| HLTB API | Completion times | Undocumented, breaks monthly |
| Steam SSR | Deck verified status | Requires page script injection¹ |

¹ MV3 content scripts can't access page JS context, so we inject `steamDeckPageScript.ts` to read Steam's SSR data.

When HLTB breaks, times disappear but platform icons still work.

**Why Wikidata?** Free, no API key, anyone can fix bad data. Coverage gaps are a data problem, not a code problem.

## Architecture

```
┌─────────────┐  message   ┌─────────────┐
│   content   │ ────────►  │  background │
│   script    │ ◄──────── │   worker    │
└──────┬──────┘  response  └──────┬──────┘
       │                          │
       ▼                          ▼
  DOM injection            ┌──────┴──────┐
  + page script            │   resolver  │
  (SSR data)               └──────┬──────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 cache       wikidata        hltb
```

See [CLAUDE.md](CLAUDE.md) for full architecture details and dev workflow.

## Limitations

- **Wikidata**: Many games missing platform data. You can [add them](https://www.wikidata.org/wiki/Wikidata:WikiProject_Video_games) yourself.
- **HLTB**: Fuzzy name matching misses some titles (especially indies). No official API.
- **Rate limits**: 500ms delay between Wikidata queries to avoid throttling.

## Troubleshooting

- **Icons not showing?** Check DevTools console for `[SCPW` messages
- **Times missing?** HLTB API probably changed again. Check network tab on howlongtobeat.com
- **Wrong platform data?** Wikidata issue — anyone can fix it at [wikidata.org](https://www.wikidata.org/)

## Development

```bash
npm run build          # TypeScript → dist/
npm run test:unit      # Jest + coverage
npm run test:integration  # Full E2E (slow)
```

## Contributing

PRs welcome. See [CLAUDE.md](CLAUDE.md) for architecture and dev workflow.

## Acknowledgments

- [Wikidata community](https://www.wikidata.org/wiki/Wikidata:WikiProject_Video_games) for maintaining game platform data
- [HowLongToBeat](https://howlongtobeat.com/) for completion times (undocumented API, but it works)
- Valve for SSR data we read via page script injection

## License

Apache 2.0
