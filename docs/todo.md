# Non-Development TODOs

These must be completed alongside development — all have waiting periods (verification delays, DNS propagation). Start them immediately, not after the code is ready.

---

## 1. Stripe — Register & Verify (2–5 business days)

- [ ] Go to stripe.com and create an account
- [ ] Register as a business: **HGD Sveta Cecilija**
- [ ] Submit Croatian business documents for verification
- [ ] Once verified, retrieve: **Publishable Key**, **Secret Key**, **Webhook Secret**
- [ ] Set Stripe to EUR currency

> Stripe verification is the longest external dependency. Start today.

---

## 2. Resend — Create Account & Verify Domain (up to 24 hours)

- [ ] Go to resend.com and create an account
- [ ] Add domain: `moreska.eu`
- [ ] Add the DNS records Resend provides (SPF, DKIM, DMARC) to your domain registrar
- [ ] Wait for verification (up to 24 hours)
- [ ] Set default sending address: `info@moreska.eu`
- [ ] Once verified, retrieve: **API Key**

---

## 3. info@moreska.eu — Set Up Email Receiving

- [ ] Set up email forwarding or hosting for `info@moreska.eu` so contact form submissions and admin notifications are received
- [ ] Options: Zoho Mail (free), Google Workspace (€6/month), or simple forwarding via your registrar

> Can wait until week 2 but must be done before going live.

---

## 4. Infrastructure — Step-by-Step Guide

Complete steps 4a → 4b → 4c → 4d in order. Total time: 2–4 hours (plus DNS propagation).

### 4a. Create a DigitalOcean Droplet

1. Log in to DigitalOcean → **Create → Droplets**
2. Choose image: **Ubuntu 22.04 LTS**
3. Choose plan: **Basic → Regular → 4 GB RAM / 2 vCPU** ($18/month)
4. Choose datacenter region: **Frankfurt (FRA1)** — closest to Croatia
5. Authentication: add your SSH public key (preferred) or set a root password
6. Click **Create Droplet**
7. Copy the Droplet's **public IP address** — you will need it in every step below

### 4b. Install Coolify on the Droplet

1. Open your terminal and SSH into the Droplet:
   ```
   ssh root@<droplet-ip>
   ```
2. Run the Coolify installer:
   ```
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
3. Wait for installation to complete (2–5 minutes)
4. Open your browser: `http://<droplet-ip>:8000`
5. Create your Coolify admin account (email + password)
6. Complete the onboarding wizard — choose **"I want to use a single server"**

### 4c. Connect GitHub Repository to Coolify

1. In Coolify dashboard → **Sources → Add → GitHub App**
2. Follow the GitHub OAuth flow to install the Coolify GitHub App on your account
3. Select the repository: `jivancevic/sveta-cecilija-web`
4. Go to **Projects → New Project** → name it `moreska-eu`
5. Add a new **Resource → Application**
6. Select your GitHub source, choose the `main` branch
7. Set build pack: **Nixpacks** (auto-detects Next.js)
8. Set **Port**: `3000`
9. Add environment variables (leave empty for now — you will fill these in during development):
   - `DATABASE_URL`
   - `PAYLOAD_SECRET`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PUBLISHABLE_KEY`
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_BASE_URL`
10. Click **Save** — do not deploy yet

### 4d. Configure DNS and SSL for moreska.eu

**Step 1 — Add domain to DigitalOcean DNS:**
1. In DigitalOcean → **Networking → Domains → Add Domain**
2. Enter `moreska.eu` and click **Add Domain**
3. Add an **A record**:
   - Hostname: `@`
   - Will direct to: your Droplet IP
   - TTL: 3600
4. Add another **A record**:
   - Hostname: `www`
   - Will direct to: your Droplet IP
   - TTL: 3600

**Step 2 — Point nameservers at your domain registrar:**
1. Log in to wherever you registered `moreska.eu`
2. Find the nameserver settings and replace them with:
   - `ns1.digitalocean.com`
   - `ns2.digitalocean.com`
   - `ns3.digitalocean.com`
3. Save — propagation takes up to 48 hours (usually 1–4 hours)

**Step 3 — Configure domain in Coolify:**
1. In Coolify → your application → **Domains**
2. Add domain: `https://moreska.eu`
3. Add domain: `https://www.moreska.eu`
4. Enable **Let's Encrypt SSL** — Coolify will auto-provision the certificate once DNS propagates
5. Set `https://moreska.eu` as the primary domain

**Step 4 — Deploy:**
1. Once DNS has propagated (verify with `dig moreska.eu` — should return your Droplet IP)
2. In Coolify → your application → **Deploy**
3. Watch the build logs — Next.js should build and start on port 3000
4. Visit `https://moreska.eu` — the site should be live with a valid SSL certificate

---

## Order of Operations

Start **1 (Stripe)** and **2 (Resend)** today — they have the longest verification times.  
Start **4a–4b (Droplet + Coolify)** immediately after — takes 1 hour and unblocks everything else.  
Start **4c–4d (DNS + deploy)** in parallel with development — DNS can take up to 48 hours.  
**3 (email receiving)** can wait until week 2 but must be done before going live.

All of these can be completed while development is in progress.
