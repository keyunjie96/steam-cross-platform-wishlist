# Privacy Policy

**Steam Cross-Platform Wishlist** is committed to protecting your privacy. This document explains what data the extension accesses, how it's used, and what we don't do.

## Summary

- **No account required**
- **No personal data collected**
- **No analytics or tracking**
- **No data sent to third parties**
- **All cached data stored locally on your device**

## Data We Access

### Steam Wishlist Page

The extension reads the Steam wishlist page you're viewing to:
- Extract game names and Steam App IDs
- Inject platform availability icons
- Display completion time badges

**This data is processed locally and never transmitted elsewhere.**

### External Data Sources

The extension queries these services to retrieve game information:

| Service | Data Requested | Purpose |
|---------|----------------|---------|
| [Wikidata](https://www.wikidata.org) | Game platform availability | Show Nintendo/PlayStation/Xbox icons |
| [HowLongToBeat](https://howlongtobeat.com) | Game completion times | Display time-to-beat badges |
| Platform stores (Nintendo, PlayStation, Xbox) | URL validation only | Verify store links are active |

**Only game names and IDs are sent — never your Steam account info, wishlist contents, or personal data.**

## Data We Store

The extension caches game platform data in `chrome.storage.local`:
- Platform availability (Nintendo, PlayStation, Xbox)
- Steam Deck verification status
- Completion time estimates
- Store URLs

**Cache characteristics:**
- Stored locally on your device only
- Automatically expires after 7 days
- Can be cleared manually via extension settings
- Never synced to cloud or transmitted anywhere

## Data We DON'T Collect

- No Steam account credentials
- No Steam login cookies
- No personal information
- No browsing history
- No analytics or telemetry
- No crash reports
- No usage statistics

## Host Permissions Explained

The extension requests permission to access these domains:

| Domain | Why It's Needed |
|--------|-----------------|
| `store.steampowered.com` | Read wishlist page, inject icons |
| `query.wikidata.org` | Query open platform database |
| `howlongtobeat.com` | Fetch game completion times |
| `store.playstation.com` | Validate PlayStation store links |
| `www.nintendo.com` | Validate Nintendo eShop links |
| `www.xbox.com` | Validate Xbox store links |

## Third-Party Services

### Wikidata

Wikidata is a free, open knowledge base maintained by the Wikimedia Foundation. Our queries are anonymous and only request game platform information.

[Wikidata Privacy Policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy)

### HowLongToBeat

We query HowLongToBeat's API to retrieve game completion time estimates. Only game names are sent.

[HowLongToBeat Privacy Policy](https://howlongtobeat.com/privacy)

## Your Rights

Since we don't collect personal data, there's nothing to delete or export. You can:
- **Clear local cache**: Via extension settings
- **Uninstall**: Removes all extension data from your browser
- **Disable features**: Toggle off any feature in extension settings

## Open Source

This extension is open source. You can review the code to verify our privacy practices:

[GitHub Repository](https://github.com/keyunjie96/steam-cross-platform-wishlist)

## Changes to This Policy

If we make changes to this privacy policy, we'll update this document and the extension version.

## Contact

For privacy concerns or questions, please open an issue on our GitHub repository.

---

**Last updated:** January 2026
**Extension version:** 0.6.2
