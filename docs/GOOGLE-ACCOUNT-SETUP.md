# Project Zero account and Google OAuth

Public information and OAuth registration URLs:

- Application homepage: https://www.projectzero.work/
- Authorized JavaScript origin: https://account.projectzero.work
- Authorized redirect URI: https://account.projectzero.work/auth/google/callback
- Privacy Policy: https://www.projectzero.work/privacy
- Terms of Service: https://www.projectzero.work/terms
- Support email: support@projectzero.work

The consent-screen domain is projectzero.work. The canonical legal pages on the marketing site contain no workspace records, scripts, tracking or customer registration. The privacy and legal mail aliases are configured. The account hostname serves the isolated sign-in surface, is not indexable, and permanently redirects historical legal and sitemap paths to the public website. The main sitemap at https://www.projectzero.work/sitemap.xml lists the canonical website pages and all public guide catalog URLs, including guide privacy, comparisons, categories, tutorials and calculators. It obtains the live guide sitemap through the GUIDE_SITEMAP Worker service binding (service projectzero-guides). The guide hostname retains its automatically generated hostname-only feed for crawler discovery until the full domain is verified in Search Console. No manual parallel URL inventory is maintained. No private dashboard binding or access configuration is modified.

## Secure activation
Direct Google sign-in is at https://account.projectzero.work/auth/login. No invitation, email code, or tester program is active. The commercial Worker requires CUSTOMER_ACCESS=enabled, GOOGLE_LOGIN_MODE=authorized, OWNER_EMAIL, AUTH_RATE_LIMIT, COMMERCIAL_DB and the PZW_GOOGLE_CLIENT_ID, PZW_GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_STATE_KEY secrets. The verified Google subject is pinned. Only the configured owner's authoritative Google identity may create a new isolated account; existing authorized identities may return. Public sign-up and billing remain closed. No private business dashboard access or data is granted.
The exact OAuth callback above must be registered. No Google access/refresh token is persisted. Never publish credentials. Keep the existing state/nonce/PKCE and identity checks.
To disable sign-in set CUSTOMER_ACCESS=disabled. Do not alter the private owner dashboard or other domains.
