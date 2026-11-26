# Project Zero account and Google OAuth

Public information and OAuth registration URLs:

- Application homepage: https://www.projectzero.work/
- Authorized JavaScript origin: https://account.projectzero.work
- Authorized redirect URI: https://account.projectzero.work/auth/google/callback
- Privacy Policy: https://www.projectzero.work/privacy
- Terms of Service: https://www.projectzero.work/terms
- Support email: support@projectzero.work

The consent-screen domain is projectzero.work. The canonical legal pages on the marketing site contain no workspace records, scripts, tracking or customer registration. The privacy and legal mail aliases are configured. The account hostname serves the isolated sign-in surface, is not indexable, and permanently redirects historical legal and sitemap paths to the public website. The main sitemap at https://www.projectzero.work/sitemap.xml lists the canonical website pages and all public guide catalog URLs, including guide privacy, comparisons, categories, tutorials and calculators. It obtains the live guide sitemap through the GUIDE_SITEMAP Worker service binding (service projectzero-guides). The guide hostname retains its automatically generated hostname-only feed for crawler discovery until the full domain is verified in Search Console. No manual parallel URL inventory is maintained. No private dashboard binding or access configuration is modified.

## Secure activation (owner Google sign-in for free beta; commercial invite-only remains separate)

Approved testers use a one-time email-bound invitation with Google or verified email sign-in. The configured owner uses Google at https://account.projectzero.work/auth/login and can manage invitations at /admin/beta. See FREE-BETA.md. Google credentials are held in PZW_GOOGLE_CLIENT_ID and PZW_GOOGLE_CLIENT_SECRET; GOOGLE_OAUTH_STATE_KEY is independent; Google login in beta is enabled only with GOOGLE_LOGIN_MODE=beta_invite and EMAIL_LOGIN_MODE=invite_only.

The Google callback returns a closed response while CUSTOMER_ACCESS=disabled. In beta, the configured OWNER_EMAIL can sign in without an invitation; first-time testers need an unredeemed personal code for their authoritative Google email. The verified Google subject is pinned on first login and never linked by email. A returning approved user need not reenter their code. Do not enable public Google signup or paid billing.

Future invitation-only testing requires a Google web OAuth client with the exact redirect URI, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and an independently generated 32-byte base64url GOOGLE_OAUTH_STATE_KEY stored as Worker bindings/secrets, AUTH_RATE_LIMIT binding, and GOOGLE_LOGIN_MODE=invite_only. Enable CUSTOMER_ACCESS only after owner approval, production rate-limit and security review, a private authorized test identity/workspace, and verification of expired/invalid/replayed and cross-tenant requests. The provider secret and state encryption key must never be stored in source control or a chat message. No Google access/refresh token is persisted. Google sign-in uses only openid and email. A verified Google subject must already be associated with a permitted user and active workspace membership; no email-only auto-link or self-service registration.

The legal pages disclose only current and intended invite-only functionality. Review the privacy and terms for actual business entity, jurisdiction, retention/deletion processes and any future commercial service before a broader launch. The public marketing site's existing optional analytics notice is incorporated into the canonical privacy policy. The account homepage links directly to canonical legal pages; its OAuth origin and callback stay on the account hostname. Internal schema readiness checks belong to privileged deployment tooling, not the public internet.

Rollback: restore the prior Worker version if required; account endpoints will become unavailable, while CUSTOMER_ACCESS remains disabled. Remove only the new custom hostname if rollback requires it. Do not alter the private owner dashboard or other domains.

