# BIMI Visual Trust Integration

Enable verified brand logo display in Gmail, Apple Mail, and Yahoo Mail for `globalstrategic.tech` outbound email. When a recipient receives an email from GST, the delta icon appears as the sender avatar — a visual trust signal before the email is even opened.

**Status**: Stage 1 Complete (DNS hardened), Stage 2 Ready
**Priority**: Medium — high-leverage brand trust signal for advisory communications
**Effort**: Small (30 min code + DNS record paste + 1-48 hour propagation)
**Last Updated**: April 6, 2026

---

## Why This Matters

When sending sensitive technical diligence reports, investment memos, or advisory outreach:

1. **Immediate Identity** — the GST delta logo appears in the recipient's inbox before the email is opened
2. **Anti-Spoofing** — BIMI requires DMARC enforcement, making it mathematically impossible for a scammer to spoof the GST brand mark
3. **Deliverability** — verified domains are prioritized by Google's high-trust filters, reducing the chance of advisory notes hitting Promotions or Spam
4. **Operational Maturity Signal** — in enterprise M&A and technical diligence, a verified brand mark in a CTO's inbox signals operational discipline

---

## Certificate Strategy: CMC vs VMC

| Option                   | CMC (Common Mark Certificate)   | VMC (Verified Mark Certificate) |
| ------------------------ | ------------------------------- | ------------------------------- |
| **Requirements**         | 12 months of logo usage history | Registered trademark (USPTO)    |
| **Cost**                 | ~$100-300/year                  | ~$1,500/year                    |
| **Gmail Blue Checkmark** | No (logo only)                  | Yes (verified checkmark)        |
| **Apple Mail / Yahoo**   | Logo displayed                  | Logo displayed + verified       |
| **Timeline**             | Days (if DMARC ready)           | Weeks (trademark verification)  |

### Practical Recommendation

1. **Now**: Implement BIMI with CMC path (~$100-300/year, no trademark needed). Logo displays in recipient inboxes immediately after DNS propagation. This delivers 90% of the value — visual brand identity, anti-spoofing, and deliverability boost.
2. **In parallel**: File USPTO trademark registration for the GST delta icon. This takes 8-12 months (see Trademark Registration section below), so start early.
3. **After trademark granted**: Upgrade from CMC to VMC (~$1,500/year) for the Gmail blue verified checkmark. Same infrastructure, different CA verification.

The blue checkmark is a prestige upgrade, not a functional requirement. The CMC logo display provides the primary value for advisory communications.

### USPTO Trademark Registration (for future VMC upgrade)

| Item               | Details                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **What**           | Register the GST delta icon as a trademark with the US Patent & Trademark Office                                       |
| **Filing fee**     | $250-350 per class (online TEAS filing)                                                                                |
| **Classes needed** | Class 35 (business consulting/advisory) and/or Class 42 (technology services)                                          |
| **Timeline**       | 8-12 months from filing to registration (USPTO backlog)                                                                |
| **Process**        | File application → USPTO examiner reviews (3-4 months) → Published for opposition (30 days) → Registration issued      |
| **Requirements**   | Proof the mark is in use in commerce (website screenshots, client communications)                                      |
| **Self-file?**     | Yes, via [teas.uspto.gov](https://teas.uspto.gov). Attorney optional but recommended (~$500-1,500 for a simple filing) |
| **Not needed for** | CMC certificate or initial BIMI logo display — only for VMC blue checkmark                                             |

---

## Current State (Verified April 6, 2026)

| Component           | Status                                                             | Details                                                                                         |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **DNS**             | Cloudflare                                                         | Active, records editable                                                                        |
| **Hosting**         | Astro / Vercel                                                     | SVG served from `public/` static assets                                                         |
| **DMARC**           | `p=quarantine; pct=100`                                            | **Hardened** — meets BIMI requirement. Reporting to Cloudflare DMARC Management                 |
| **SPF**             | `v=spf1 include:_spf.google.com -all`                              | **Hard fail** — only Google Workspace authorized. Verified clean in Cloudflare reports (7 days) |
| **DKIM**            | RSA key published, active                                          | **Verified** — signing via Google Workspace                                                     |
| **Email provider**  | Google Workspace                                                   | Sole sender for `@globalstrategic.tech`                                                         |
| **DMARC reports**   | Clean                                                              | No authentication failures in monitoring period                                                 |
| **Brand Logo**      | Exists (`public/images/logo/gst-delta-icon-teal-stroke-thick.svg`) | Must be converted to SVG Tiny PS profile                                                        |
| **vercel.json**     | Does not exist                                                     | Must be created for Content-Type header on BIMI SVG                                             |
| **USPTO Trademark** | Not filed                                                          | Required only for VMC (blue checkmark), not for CMC (logo display)                              |

**Assessment**: All DNS prerequisites are met. Ready to proceed with code implementation (Stage 2) and BIMI DNS record (Stage 3).

---

## Implementation Plan

### Step 1: Logo Preparation (SVG Tiny PS)

**What**: Convert the existing GST delta icon to the SVG Tiny Portable/Secure (Tiny PS) profile required by BIMI.

**Source**: `public/images/logo/gst-delta-icon-teal-stroke-thick.svg`
**Destination**: `public/branding/logo-bimi.svg`

**SVG Tiny PS Requirements**:

- 1:1 square aspect ratio (current: 64x64 -- already compliant)
- `version="1.2"` and `baseProfile="tiny-ps"` attributes on `<svg>` tag
- No `<script>`, `<style>`, `<image>`, or external references
- No `xlink:href` attributes
- Must be under 32KB (current SVG is ~300 bytes -- well under)
- Background should be filled (not transparent) for best rendering in dark/light mail clients

**Implementation**:

```xml
<svg version="1.2" baseProfile="tiny-ps"
     xmlns="http://www.w3.org/2000/svg"
     width="512" height="512" viewBox="0 0 512 512">
  <!-- Solid background for mail client rendering -->
  <rect width="512" height="512" fill="#0a0a0a"/>
  <!-- GST Delta Triangle -->
  <path d="M256 96 L416 416 L96 416 Z"
        fill="none"
        stroke="#00D9B5"
        stroke-width="48"
        stroke-linejoin="miter"/>
</svg>
```

**Notes**:

- Scaled to 512x512 for high-DPI mail clients
- Dark background chosen for contrast in both light and dark mail themes
- Consider alternatives: white background, teal-filled delta, composite GST wordmark
- The final logo should be visually tested at 48x48px (Gmail avatar size) to ensure legibility

**Claude Code Task**: Create `public/branding/logo-bimi.svg` with the SVG Tiny PS profile. Validate structure (no `<script>`, `<style>`, correct attributes).

---

### Step 2: Vercel Deployment & Headers

**What**: Ensure the BIMI SVG is served with the correct MIME type and no redirects.

**File**: Create `vercel.json` in the project root:

```json
{
  "headers": [
    {
      "source": "/branding/logo-bimi.svg",
      "headers": [
        {
          "key": "Content-Type",
          "value": "image/svg+xml"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=86400"
        }
      ]
    }
  ]
}
```

**Verification**: After deployment, confirm:

- `curl -I https://globalstrategic.tech/branding/logo-bimi.svg` returns `HTTP/2 200` with `Content-Type: image/svg+xml`
- No 301/302 redirects in the response chain

**Claude Code Task**: Create `vercel.json` with the header configuration. Verify no existing Vercel config conflicts.

---

### Step 3: DMARC Hardening — COMPLETE

**Status**: Done (April 6, 2026)

DMARC hardened from `p=none` to `p=quarantine; pct=100`. SPF hardened from `~all` (soft-fail) to `-all` (hard-fail). Verified via Cloudflare DMARC Management dashboard:

- DMARC policy: **Quarantine**
- SPF policy: **Fail** (hard reject unauthorized senders)
- DKIM in use: **Yes**
- DMARC reports: **Clean** (no authentication failures)

Current DNS records:

```
_dmarc.globalstrategic.tech TXT "v=DMARC1; p=quarantine; pct=100; rua=mailto:65d22352f4884af2ba1ce20f66bcf437@dmarc-reports.cloudflare.net; adkim=r; aspf=r;"
globalstrategic.tech TXT "v=spf1 include:_spf.google.com -all"
```

---

### Step 4: BIMI DNS Record

#### Manual Step (Cloudflare DNS)

Add a new TXT record:

| Field       | Value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| **Type**    | TXT                                                                   |
| **Name**    | `default._bimi`                                                       |
| **Content** | `v=BIMI1; l=https://globalstrategic.tech/branding/logo-bimi.svg; a=;` |
| **TTL**     | Auto (or 3600)                                                        |

**Notes**:

- `l=` points to the logo URL (must be HTTPS, must return 200 with correct Content-Type)
- `a=` is empty for now — this is where the CMC/VMC certificate URL goes when purchased
- The `default` selector applies to all email from the domain
- DNS propagation takes up to 48 hours, but typically 1-4 hours with Cloudflare

---

### Step 5: CMC Certificate (Optional — Future Enhancement)

When ready to purchase a CMC:

1. Choose a CA that issues CMC certificates (DigiCert, Entrust)
2. Provide proof of 12 months of logo usage (website, social media, business cards)
3. Receive a `.pem` certificate file
4. Host the certificate at a stable HTTPS URL (e.g., `https://globalstrategic.tech/branding/gst-bimi.pem`)
5. Update the BIMI DNS record to include the certificate URL:

```
v=BIMI1; l=https://globalstrategic.tech/branding/logo-bimi.svg; a=https://globalstrategic.tech/branding/gst-bimi.pem;
```

**VMC Upgrade Path**: After USPTO trademark registration (~8-12 months), upgrade from CMC to VMC for the Gmail blue verified checkmark. Same infrastructure, different CA verification. See "USPTO Trademark Registration" section above for filing details.

---

### Step 6: Validation

Test the implementation with these tools:

1. **BIMI Inspector** — [bimigroup.org/bimi-generator](https://bimigroup.org/bimi-generator/) — validates DNS record, logo format, DMARC alignment
2. **MXToolbox BIMI Lookup** — [mxtoolbox.com/bimi.aspx](https://mxtoolbox.com/bimi.aspx) — checks DNS, SVG accessibility, DMARC enforcement
3. **Google Admin Toolbox** — [toolbox.googleapps.com/apps/checkmx](https://toolbox.googleapps.com/apps/checkmx/) — verifies MX, SPF, DKIM, DMARC configuration
4. **Manual Test** — send an email from `@globalstrategic.tech` to a Gmail account and check for logo display (may take 24-48 hours after DNS propagation)

---

## Manual Steps Checklist

### Stage 1: DNS Hardening — COMPLETE

- [x] **Verify current DMARC policy**: `p=quarantine; pct=100` confirmed
- [x] **Verify SPF record**: `v=spf1 include:_spf.google.com -all` confirmed
- [x] **Verify DKIM**: RSA key published, signing active via Google Workspace
- [x] **Update DMARC record in Cloudflare**: hardened from `p=none` to `p=quarantine; pct=100`
- [x] **Update SPF record**: hardened from `~all` to `-all`
- [x] **Monitor DMARC reports**: clean — no authentication failures

### Stage 2: Code Implementation — READY

- [ ] **Create `public/branding/logo-bimi.svg`**: SVG Tiny PS conversion (Claude Code)
- [ ] **Create `vercel.json`**: Content-Type header for BIMI SVG path (Claude Code)
- [ ] **Deploy to Vercel**: push to dev → merge to master → verify `curl -I` returns 200

### Stage 3: BIMI DNS Record — AFTER STAGE 2 DEPLOYED

- [ ] **Add BIMI TXT record in Cloudflare**: `default._bimi` → `v=BIMI1; l=https://globalstrategic.tech/branding/logo-bimi.svg; a=;`
- [ ] **Wait for DNS propagation**: 1-48 hours
- [ ] **Validate with BIMI Inspector**: [bimigroup.org/bimi-generator](https://bimigroup.org/bimi-generator/)
- [ ] **Send test email to Gmail**: verify logo renders in inbox

### Stage 4: CMC Certificate — FUTURE

- [ ] **Purchase CMC certificate**: DigiCert or Entrust, ~$100-300/year
- [ ] **Host certificate**: `https://globalstrategic.tech/branding/gst-bimi.pem`
- [ ] **Update BIMI DNS `a=` tag** with certificate URL

### Stage 5: VMC Upgrade — FUTURE (requires trademark)

- [ ] **File USPTO trademark**: $250-350/class, 8-12 month timeline
- [ ] **After registration**: upgrade CMC to VMC (~$1,500/year) for Gmail blue checkmark

---

## Claude Code Tasks (Automatable)

These steps can be executed by Claude Code when ready:

1. Create `public/branding/logo-bimi.svg` — SVG Tiny PS conversion from existing delta icon
2. Create `vercel.json` — Content-Type header for the BIMI SVG path
3. Verify SVG compliance — no `<script>`, `<style>`, correct `version`/`baseProfile` attributes
4. Generate the exact DNS record values for copy-paste into Cloudflare
5. Add print/deploy verification to CI if desired

---

## Files Created/Modified

| File                            | Action | Notes                                              |
| ------------------------------- | ------ | -------------------------------------------------- |
| `public/branding/logo-bimi.svg` | Create | SVG Tiny PS profile, 512x512, delta icon           |
| `vercel.json`                   | Create | Content-Type header for BIMI SVG                   |
| Cloudflare DNS                  | Manual | `_dmarc` TXT update + `default._bimi` TXT addition |

---

## Related

- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand identity and logo usage rules
- [Google Analytics Setup](../analytics/GOOGLE_ANALYTICS.md) — Email tracking context
- [BIMI Group](https://bimigroup.org/) — Official BIMI specification and tools
- [DMARC.org](https://dmarc.org/) — DMARC specification and deployment guides
