# BIMI Visual Trust Integration

Enable verified brand logo display in Gmail, Apple Mail, and Yahoo Mail for `globalstrategic.tech` outbound email. When a recipient receives an email from GST, the delta icon appears as the sender avatar — a visual trust signal before the email is even opened.

**Status**: Not Started
**Priority**: Medium — high-leverage brand trust signal for advisory communications
**Effort**: Small (1-2 hours implementation + DNS propagation wait)
**Last Updated**: April 3, 2026

---

## Why This Matters

When sending sensitive technical diligence reports, investment memos, or advisory outreach:

1. **Immediate Identity** — the GST delta logo appears in the recipient's inbox before the email is opened
2. **Anti-Spoofing** — BIMI requires DMARC enforcement, making it mathematically impossible for a scammer to spoof the GST brand mark
3. **Deliverability** — verified domains are prioritized by Google's high-trust filters, reducing the chance of advisory notes hitting Promotions or Spam
4. **Operational Maturity Signal** — in enterprise M&A and technical diligence, a verified brand mark in a CTO's inbox signals operational discipline

---

## Certificate Strategy: CMC vs VMC

| Option | CMC (Common Mark Certificate) | VMC (Verified Mark Certificate) |
|---|---|---|
| **Requirements** | 12 months of logo usage history | Registered trademark (USPTO/EUIPO) |
| **Cost** | ~$100-300/year | ~$1,500/year |
| **Gmail Blue Checkmark** | No (logo only) | Yes (verified checkmark) |
| **Apple Mail / Yahoo** | Logo displayed | Logo displayed + verified |
| **Timeline** | Days (if DMARC ready) | Weeks (trademark verification) |

**Recommendation**: Start with **CMC** unless the GST trademark is already finalized. The logo display provides the primary value; the blue checkmark is a future upgrade path.

---

## Current State

| Component | Status | Notes |
|---|---|---|
| **DNS** | Cloudflare | Manual DNS record updates required |
| **Hosting** | Astro / Vercel | SVG served from `public/` static assets |
| **DMARC** | `p=none` (assumed) | Must harden to `p=quarantine` or `p=reject` for BIMI |
| **SPF** | Likely configured | Verify via `dig TXT globalstrategic.tech` |
| **DKIM** | Likely configured | Depends on email provider (Google Workspace, etc.) |
| **Brand Logo** | Exists (`public/images/logo/gst-delta-icon-teal-stroke-thick.svg`) | Must be converted to SVG Tiny PS profile |
| **vercel.json** | Does not exist | Must be created for Content-Type header on BIMI SVG |

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

### Step 3: DMARC Hardening

**What**: Transition DMARC policy from `p=none` (monitoring) to `p=quarantine` (enforcement). BIMI requires `p=quarantine` or `p=reject`.

#### Manual Step (Cloudflare DNS)

Update the existing `_dmarc.globalstrategic.tech` TXT record:

**Current** (assumed):
```
v=DMARC1; p=none; rua=mailto:dmarc@globalstrategic.tech;
```

**Target**:
```
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@globalstrategic.tech; adkim=r; aspf=r;
```

**Risk Mitigation**:
1. Before changing, verify SPF and DKIM are correctly configured for all sending sources (Google Workspace, Calendly, Vercel, any transactional email services)
2. Consider a phased rollout: `pct=25` for 1 week, then `pct=50`, then `pct=100`
3. Monitor DMARC aggregate reports (`rua`) for authentication failures during transition
4. If legitimate email is being quarantined, add the sending source to SPF or configure DKIM

**Pre-Flight Checks**:
- `dig TXT globalstrategic.tech` — verify SPF record includes all sending IPs
- `dig TXT _dmarc.globalstrategic.tech` — verify current DMARC policy
- Send test emails from all GST email addresses and verify they pass SPF + DKIM alignment
- Check DMARC aggregate reports for any existing failures before hardening

---

### Step 4: BIMI DNS Record

#### Manual Step (Cloudflare DNS)

Add a new TXT record:

| Field | Value |
|---|---|
| **Type** | TXT |
| **Name** | `default._bimi` |
| **Content** | `v=BIMI1; l=https://globalstrategic.tech/branding/logo-bimi.svg; a=;` |
| **TTL** | Auto (or 3600) |

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

**VMC Upgrade Path**: If/when the GST trademark is registered, upgrade from CMC to VMC for the Gmail blue verified checkmark. Same process, different CA verification requirements.

---

### Step 6: Validation

Test the implementation with these tools:

1. **BIMI Inspector** — [bimigroup.org/bimi-generator](https://bimigroup.org/bimi-generator/) — validates DNS record, logo format, DMARC alignment
2. **MXToolbox BIMI Lookup** — [mxtoolbox.com/bimi.aspx](https://mxtoolbox.com/bimi.aspx) — checks DNS, SVG accessibility, DMARC enforcement
3. **Google Admin Toolbox** — [toolbox.googleapps.com/apps/checkmx](https://toolbox.googleapps.com/apps/checkmx/) — verifies MX, SPF, DKIM, DMARC configuration
4. **Manual Test** — send an email from `@globalstrategic.tech` to a Gmail account and check for logo display (may take 24-48 hours after DNS propagation)

---

## Manual Steps Checklist

These steps cannot be automated by Claude Code and must be performed manually:

- [ ] **Verify current DMARC policy**: `dig TXT _dmarc.globalstrategic.tech`
- [ ] **Verify SPF record**: `dig TXT globalstrategic.tech` — confirm all sending sources are included
- [ ] **Verify DKIM**: send a test email and check headers for `dkim=pass`
- [ ] **Update DMARC record in Cloudflare**: change `p=none` to `p=quarantine; pct=100;`
- [ ] **Monitor DMARC reports**: watch for authentication failures for 1-2 weeks after hardening
- [ ] **Add BIMI TXT record in Cloudflare**: `default._bimi` with the generated value
- [ ] **Wait for DNS propagation**: 1-48 hours
- [ ] **Validate with BIMI Inspector**: confirm logo appears correctly
- [ ] **Send test email to Gmail**: verify logo renders in inbox
- [ ] **Purchase CMC certificate** (when ready): DigiCert or Entrust, ~$100-300/year
- [ ] **Upload certificate and update DNS `a=` tag** with certificate URL

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

| File | Action | Notes |
|---|---|---|
| `public/branding/logo-bimi.svg` | Create | SVG Tiny PS profile, 512x512, delta icon |
| `vercel.json` | Create | Content-Type header for BIMI SVG |
| Cloudflare DNS | Manual | `_dmarc` TXT update + `default._bimi` TXT addition |

---

## Related

- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand identity and logo usage rules
- [Google Analytics Setup](../analytics/GOOGLE_ANALYTICS.md) — Email tracking context
- [BIMI Group](https://bimigroup.org/) — Official BIMI specification and tools
- [DMARC.org](https://dmarc.org/) — DMARC specification and deployment guides
