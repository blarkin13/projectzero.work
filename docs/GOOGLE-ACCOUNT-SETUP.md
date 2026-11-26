# Project Zero account and Google OAuth

Public information and OAuth registration URLs:

- Application homepage: https://www.projectzero.work/
- Authorized JavaScript origin: https://account.projectzero.work
- Authorized redirect URI: https://account.projectzero.work/auth/google/callback
- Privacy Policy: https://www.projectzero.work/privacy
- Terms of Service: https://www.projectzero.work/terms
- Support email: support@projectzero.work

The consent-screen domain is projectzero.work. The canonical legal pages on the marketing site contain no workspace records, scripts, tracking or customer registration. The privacy and legal mail aliases are configured. The account hostname serves the isolated sign-in surface, is not indexable, and permanently redirects historical legal and sitemap paths to the public website. The main sitemap at https://www.projectzero.work/sitemap.xml lists the canonical website pages and all public guide catalog URLs, including guide privacy, comparisons, categories, tutorials and calculators. It obtains the live guide sitemap through the GUIDE_SITEMAP Worker service binding (service projectzero-guides). The guide hostname retains its automatically generated hostname-only feed for crawler discovery until the full domain is verified in Search Console. No manual parallel URL inventory is maintained. No private dashboard binding or access configuration is modified.

## Owner access

Public registration and billing remain closed. The owner signs in directly with Google at https://account.projectzero.work/auth/login. The Worker uses CUSTOMER_ACCESS=enabled, GOOGLE_LOGIN_MODE=owner_only, OWNER_EMAIL (the authorized Gmail account), PZW_GOOGLE_CLIENT_ID, PZW_GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_STATE_KEY and AUTH_RATE_LIMIT. The signed Google identity is verified with PKCE, nonce and one-time state, and the stable subject is pinned on first successful owner authentication. No unapproved identities are provisioned. The existing private portfolio dashboard remains independently protected.
