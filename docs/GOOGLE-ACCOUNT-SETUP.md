# Project Zero account and Google OAuth

Public information and OAuth registration URLs:

- Application homepage: https://www.projectzero.work/
- Authorized JavaScript origin: https://account.projectzero.work
- Authorized redirect URI: https://account.projectzero.work/auth/google/callback
- Privacy Policy: https://www.projectzero.work/privacy
- Terms of Service: https://www.projectzero.work/terms
- Support email: support@projectzero.work

The consent-screen domain is projectzero.work. The canonical legal pages on the marketing site contain no workspace records, scripts, tracking or customer registration. The privacy and legal mail aliases are configured. The account hostname serves the isolated sign-in surface, is not indexable, and permanently redirects historical legal and sitemap paths to the public website. The main sitemap at https://www.projectzero.work/sitemap.xml lists the canonical website pages and all public guide catalog URLs, including guide privacy, comparisons, categories, tutorials and calculators. It obtains the live guide sitemap through the GUIDE_SITEMAP Worker service binding (service projectzero-guides). The guide hostname retains its automatically generated hostname-only feed for crawler discovery until the full domain is verified in Search Console. No manual parallel URL inventory is maintained. No private dashboard binding or access configuration is modified.

## Google-only invitation beta

Customer authentication uses the Google authorization-code flow with PKCE, one-time state, nonce, signature verification, and an HTTPS-only session. Customer access is beta, and the Google mode is beta_invite. Existing encrypted PZW_GOOGLE_CLIENT_ID and PZW_GOOGLE_CLIENT_SECRET bindings are used; legacy GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are supported for the closed invite-only mode. GOOGLE_OAUTH_STATE_KEY is a randomly generated 32-byte base64url secret, and BETA_AUTH_LIMIT provides server-side abuse protection. EMAIL_LOGIN_MODE is disabled; Cloudflare email codes and Turnstile are not presented to customers.

The configured OWNER_EMAIL is preapproved for a separate ordinary beta workspace. For future testers, add approved addresses to the comma-separated GOOGLE_BETA_INVITES Worker variable; the request invitation link points to contact@projectzero.work. New accounts require explicitly accepted terms, an authoritative verified Google email, and a matching approved address. Returning users are linked by their stable Google subject with their original email, active beta account, workspace membership and entitlement. No existing non-Google account is automatically linked by email. Initial beta capacity and project limits remain in force; the private owner dashboard is unaffected. No billing, public automatic signup, payment collection, or assistant credentials are enabled.

The Google OAuth callback must be registered exactly as listed above. No Google access/refresh token is persisted; requested scopes are only openid and email. Secret values must not be put in source control, logs or chat. Account access remains independent of the owner dashboard. Restore the prior version if rollback is required; it restores the previous email-beta configuration. Review legal and security requirements before any broader or paid release.
