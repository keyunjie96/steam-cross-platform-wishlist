# Chrome Web Store Listing

Copy-paste ready content for Chrome Web Store submission.

---

## Product Details

**Name:**
```
Steam Cross-Platform Wishlist
```

**Summary (132 char max):**
```
See which Steam wishlist games are on Switch, PlayStation, Xbox & Steam Deck. Plus HowLongToBeat completion times.
```

**Description:**
```
Your Steam wishlist doesn't tell you if games are on other platforms. So you end up clicking through Nintendo, PlayStation, and Xbox stores one by one. Tedious.

This extension fixes that. It adds platform icons right on your wishlist page—Switch, PlayStation, Xbox, and Steam Deck verification status. Click any icon to go straight to that store.

Also shows HowLongToBeat completion times because why not.

How it works:
- Platform data from Wikidata (free, crowd-sourced)
- Steam Deck status from Steam's own data
- Completion times from HowLongToBeat

No account needed. No tracking. Everything runs locally with a 7-day cache. About 70KB total.

Fair warning: Wikidata coverage isn't perfect—it's volunteer-maintained. If a game is missing, you can actually fix it yourself at wikidata.org.

Source code: https://github.com/keyunjie96/steam-cross-platform-wishlist
```

**Category:** `Games`

**Language:** `English (United States)`

---

## Graphic Assets

| Field | File | Size |
|-------|------|------|
| Store icon | `assets/icons/icon128.png` | 128x128 |
| Screenshot | `assets/marketing/promo-tile-1280x800.png` | 1280x800 |
| Small promo tile | `assets/marketing/promo-tile-440x280.png` | 440x280 |
| Marquee promo tile | `assets/marketing/promo-tile-1400x560-v2.png` | 1400x560 |

---

## Privacy Tab

### Single Purpose

**Single purpose description:**
```
Display cross-platform availability icons (Nintendo Switch, PlayStation, Xbox, Steam Deck) and game completion times on Steam wishlist pages.
```

### Permission Justifications

**storage justification:**
```
Caches game platform data locally for 7 days to avoid repeated API requests to Wikidata and HowLongToBeat. Cache is stored only on the user's device using chrome.storage.local. No data is synced or transmitted elsewhere.
```

**declarativeNetRequest justification:**
```
Used to modify request headers when validating store URLs. When checking if a game's PlayStation/Nintendo/Xbox store link is valid, we need to set appropriate headers to avoid being blocked. No user data is collected or modified.
```

**Host permission justification:**
```
- store.steampowered.com: Read wishlist page to extract game IDs and inject platform icons into the DOM
- query.wikidata.org: Query the public Wikidata SPARQL API to fetch game platform availability data
- howlongtobeat.com: Fetch game completion time estimates from their API
- store.playstation.com, www.nintendo.com, www.xbox.com: Validate that store links are active before displaying them to users (HEAD requests only)

All requests are read-only. No user data is sent to any of these services—only game names and IDs.
```

### Remote Code

**Are you using remote code?** `No`

### Data Usage

**What user data do you plan to collect?**
- Check NONE of the boxes (no data collected)

**Certifications (check all three):**
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy Policy

**Privacy policy URL:**
```
https://github.com/keyunjie96/steam-cross-platform-wishlist/blob/main/PRIVACY.md
```

---

## Support Tab

**Homepage URL:**
```
https://github.com/keyunjie96/steam-cross-platform-wishlist
```

**Support URL:**
```
https://github.com/keyunjie96/steam-cross-platform-wishlist/issues
```
