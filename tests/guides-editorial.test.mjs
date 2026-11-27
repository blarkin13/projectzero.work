import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/projectzero-guides/worker.mjs';

const catalog={schema:1,providers:[{"name":"Cloudflare","category":"hosting","url":"https://dash.cloudflare.com/"},{"name":"Vercel","category":"hosting","url":"https://vercel.com/"},{"name":"Netlify","category":"hosting","url":"https://www.netlify.com/"},{"name":"DigitalOcean","category":"hosting","url":"https://www.digitalocean.com/"},{"name":"AWS","category":"hosting","url":"https://aws.amazon.com/"},{"name":"Render","category":"hosting","url":"https://render.com/"},{"name":"Railway","category":"hosting","url":"https://railway.com/"},{"name":"Hostinger","category":"hosting","url":"https://www.hostinger.com/"},{"name":"Cloudflare Registrar","category":"domains","url":"https://www.cloudflare.com/products/registrar/"},{"name":"Namecheap","category":"domains","url":"https://www.namecheap.com/"},{"name":"Porkbun","category":"domains","url":"https://porkbun.com/"},{"name":"GoDaddy","category":"domains","url":"https://www.godaddy.com/"},{"name":"Cloudflare D1","category":"database","url":"https://developers.cloudflare.com/d1/"},{"name":"Supabase","category":"database","url":"https://supabase.com/"},{"name":"Neon","category":"database","url":"https://neon.com/"},{"name":"Firebase","category":"database","url":"https://firebase.google.com/"},{"name":"Cloudflare R2","category":"storage","url":"https://developers.cloudflare.com/r2/"},{"name":"Amazon S3","category":"storage","url":"https://aws.amazon.com/s3/"},{"name":"Backblaze B2","category":"storage","url":"https://www.backblaze.com/cloud-storage"},{"name":"Supabase Storage","category":"storage","url":"https://supabase.com/storage"},{"name":"Cloudflare Access","category":"identity","url":"https://www.cloudflare.com/zero-trust/products/access/"},{"name":"Clerk","category":"identity","url":"https://clerk.com/"},{"name":"Auth0","category":"identity","url":"https://auth0.com/"},{"name":"Supabase Auth","category":"identity","url":"https://supabase.com/auth"},{"name":"Firebase Authentication","category":"identity","url":"https://firebase.google.com/products/auth"},{"name":"Stripe","category":"payments","url":"https://stripe.com/"},{"name":"Paddle","category":"payments","url":"https://www.paddle.com/"},{"name":"Lemon Squeezy","category":"payments","url":"https://www.lemonsqueezy.com/"},{"name":"PayPal","category":"payments","url":"https://www.paypal.com/"},{"name":"Resend","category":"email","url":"https://resend.com/"},{"name":"Postmark","category":"email","url":"https://postmarkapp.com/"},{"name":"SendGrid","category":"email","url":"https://sendgrid.com/"},{"name":"Amazon SES","category":"email","url":"https://aws.amazon.com/ses/"},{"name":"Google Workspace","category":"email","url":"https://workspace.google.com/"},{"name":"Cloudflare Email Routing","category":"email","url":"https://developers.cloudflare.com/email-routing/"},{"name":"SiteAPT","category":"analytics","url":"https://siteapt.app/"},{"name":"Google Analytics","category":"analytics","url":"https://marketingplatform.google.com/about/analytics/"},{"name":"Plausible","category":"analytics","url":"https://plausible.io/"},{"name":"Cloudflare Web Analytics","category":"analytics","url":"https://www.cloudflare.com/web-analytics/"},{"name":"Google Search Console","category":"analytics","url":"https://search.google.com/search-console"},{"name":"Matomo","category":"analytics","url":"https://matomo.org/"},{"name":"Sentry","category":"monitoring","url":"https://sentry.io/"},{"name":"Better Stack","category":"monitoring","url":"https://betterstack.com/"},{"name":"UptimeRobot","category":"monitoring","url":"https://uptimerobot.com/"},{"name":"Cloudflare Observability","category":"monitoring","url":"https://developers.cloudflare.com/workers/observability/"},{"name":"GitHub Actions","category":"ci","url":"https://github.com/features/actions"},{"name":"GitLab CI/CD","category":"ci","url":"https://about.gitlab.com/"},{"name":"Cloudflare Workers Builds","category":"ci","url":"https://developers.cloudflare.com/workers/ci-cd/builds/"},{"name":"Shopify","category":"commerce","url":"https://www.shopify.com/"},{"name":"WooCommerce","category":"commerce","url":"https://woocommerce.com/"},{"name":"Printify","category":"commerce","url":"https://printify.com/"},{"name":"GitHub Releases","category":"distribution","url":"https://docs.github.com/en/repositories/releasing-projects-on-github"},{"name":"Apple Developer","category":"distribution","url":"https://developer.apple.com/"},{"name":"Google Play Console","category":"distribution","url":"https://play.google.com/console/"},{"name":"Microsoft Partner Center","category":"distribution","url":"https://partner.microsoft.com/"},{"name":"Google Ads","category":"marketing","url":"https://ads.google.com/"},{"name":"Google AdSense","category":"marketing","url":"https://adsense.google.com/"},{"name":"Mailchimp","category":"marketing","url":"https://mailchimp.com/"},{"name":"Kit","category":"marketing","url":"https://kit.com/"},{"name":"Help Scout","category":"support","url":"https://www.helpscout.com/"},{"name":"Freshdesk","category":"support","url":"https://www.freshworks.com/freshdesk/"},{"name":"Zendesk","category":"support","url":"https://www.zendesk.com/"},{"name":"GitHub","category":"assistants","url":"https://github.com/"},{"name":"ChatGPT","category":"assistants","url":"https://chatgpt.com/"},{"name":"Claude","category":"assistants","url":"https://claude.ai/"}].map(p=>({...p,pricing_url:p.url,pricing:'Fixture price',benefits:'Fixture benefits',best_for:'Fixture audience',tradeoffs:'Fixture tradeoffs',verified_at:'2020-01-01'}))};
const paths=["/how-to/shopify-store-setup","/how-to/shopify-print-on-demand","/how-to/shopify-custom-domain","/how-to/shopify-seo","/how-to/cloudflare-pages-website","/how-to/digitalocean-droplet","/how-to/custom-domain-dns","/how-to/google-search-console","/how-to/stripe-subscription-checkout","/how-to/transactional-email-domain","/how-to/website-uptime-monitoring","/how-to/website-analytics-setup","/how-to/github-actions-ci","/how-to/database-backup-restore","/how-to/private-file-downloads","/how-to/secure-google-login","/how-to/website-launch-checklist","/how-to/online-store-profit-margin","/how-to/shopify-test-checkout"];
const affiliate='https://shopify.pxf.io/rEMmK5';

test('provider guide editorial coverage, new how-to pages, canonical sitemap and affiliate disclosures',async()=>{
 const prior=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
 const env={GUIDES:{get:async()=>({json:async()=>catalog})}},ctx={waitUntil(){}};
 const get=path=>worker.fetch(new Request('https://guides.projectzero.work'+path),env,ctx);
 try {
  const xml=await(await get('/sitemap.xml')).text();
  const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
  assert.equal(new Set(urls).size,urls.length);
  assert.ok(urls.includes('/how-to'));
  for(const p of paths)assert.ok(urls.includes(p),p);
  let providerCount=0,affiliateCount=0;
  for(const path of urls){
   const response=await get(path);assert.equal(response.status,200,path);
   const html=await response.text();
   assert.ok(html.includes('rel="canonical" href="https://guides.projectzero.work'+path+'"'),path);
   assert.doesNotMatch(html,/undefined/);
   if(path.startsWith('/platforms/')){
    providerCount++;assert.match(html,/Common problems and how to fix them/);assert.match(html,/Budget and cost planning/);
   }
   if(paths.includes(path)){
    assert.equal((html.match(/class="tutorial-step"/g)||[]).length,5,path);
    assert.match(html,/Verify your work/);assert.match(html,/Official resources/);
   }
   if(html.includes(affiliate)){
    affiliateCount++;
    assert.ok(['/platforms/shopify','/how-to/shopify-store-setup','/how-to/shopify-print-on-demand'].includes(path),path);
    assert.match(html,/rel="sponsored"/);assert.match(html,/may earn a commission/);
    assert.equal(html.split(affiliate).length,2);
   }
   for(const m of html.matchAll(/href="(\/how-to(?:\/[a-z0-9-]+)?)"/g))assert.ok(urls.includes(m[1]),path+' broken '+m[1]);
  }
  assert.equal(providerCount,65);assert.equal(affiliateCount,3);assert.equal((await get('/how-to/not-real')).status,404);
 }finally{if(prior===undefined)delete globalThis.caches;else globalThis.caches=prior;}
});
