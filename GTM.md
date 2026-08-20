# PDFRage — Go-To-Market: from OSS users to Phase 3 customers

The funnel this doc operates:

```
OSS users & self-hosters  →  identified hand-raisers  →  paid pilots  →  team licenses
   (Phase 1, volume)            (Phase 2, leads)           (Phase 3, revenue)
```

Guiding constraint: the Phase 3 buyer is **high-touch**. A Stripe link will not close a
law firm. Every Phase 1/2 activity below is judged by one question: *does it produce a
named human at a regulated organization we can talk to?* Stars, traffic, and upvotes
only count insofar as they produce those humans.

---

## 1. ICP — who actually pays for "files can't leave the device"

Willingness-to-pay attaches to the privacy property only where uploading is a *policy
violation*, not a preference:

| Segment | Why they can't upload | Buyer | Trigger event |
|---|---|---|---|
| Law firms, 10–200 attorneys | Client confidentiality, malpractice exposure | Managing partner / firm IT (often outsourced) | Associate caught using iLovePDF; client security questionnaire |
| Clinics & healthcare admin | HIPAA — online converters aren't BAA-covered | Practice manager / compliance officer | HIPAA audit prep; new EHR workflows |
| Accounting / wealth advisory | Client financials, IRS §7216, GLBA | Partner / ops manager | Tax season tooling review |
| Gov / defense contractors | CUI handling rules, air-gapped networks | IT lead | Contract clause forbidding third-party processors |
| MSPs serving all of the above | They *are* the IT buyer for small firms | MSP owner/engineer | A client asks "is this PDF site safe?" |

MSPs are both a segment and the channel (see §5). Ignore enterprise (>500 seats) —
their procurement needs SOC2 on day one; come back in Phase 3 proper.

## 2. Lead capture instrumentation (build now, all static-site compatible)

The site has no backend, so capture uses hosted forms and repo signals:

- **"Team / compliance deployment — talk to us"** link in the site footer and README.
  Points to a hosted form (Tally/Google Form): name, org, segment, "what's blocking you
  from using free tools today?" — that last answer is the discovery call pre-work.
- **`SECURITY.md` + threat-model page** in the repo: how client-side processing works,
  what leaves the browser (nothing except opt-in AI chat), dependency list. This is the
  document a firm's IT person forwards to their boss — make it forwardable. Cost: an
  afternoon. This is the Phase-1-appropriate trust signal; SOC2 is not (see §6).
- **Self-host guide for regulated networks**: "Deploy PDFRage on an internal server /
  air-gapped network" doc. Ends with the talk-to-us CTA. Self-hosters who read this
  page are the highest-intent visitors the site will ever have.
- **GitHub as lead surface**: watch issues/discussions for `.gov`, `.law`, health-system
  email domains and "can we use this internally?" questions. Answer publicly, follow up
  privately. Enable GitHub Discussions with a "Deployments" category to draw these out.
- **Newsletter (optional, cheap)**: "privacy-first document workflows" — a Buttondown
  embed. Only worth it if §4 content ships regularly.

What NOT to instrument: analytics that undermine the pitch. No trackers. A privacy tool
running Google Analytics gets flamed in the exact communities we launched in. Use
server-log-free basics (GitHub traffic tab, Search Console) and accept the blindness.

## 3. Inbound engine — compliance-intent SEO (the long game)

Head terms are unwinnable (iLovePDF, 264M visits/mo). Compliance-intent long-tail is
winnable and pre-qualifies the visitor:

- **Question pages** (blog or /guides/): "Is iLovePDF HIPAA compliant?" · "Can I upload
  client documents to online PDF converters?" (answer for legal ethics rules) · "PDF
  tools for air-gapped networks" · "What does a BAA cover for document tools?"
  Each answers honestly, then presents the client-side alternative. These are low-volume,
  high-intent queries with weak competition — the opposite profile of "merge pdf".
- **Comparison pages**: "PDFRage vs Stirling PDF" (zero-server vs self-hosted server),
  "PDFRage vs iLovePDF" (trust model). Comparison searchers are late-funnel.
- **Lead magnet**: a one-page "Online PDF tool risk checklist" PDF (ironic, effective)
  gated behind the newsletter form. IT people forward checklists.

Cadence: one page per week, 25+ pages before judging results. Expect first meaningful
Search Console impressions at month 3–6, leads from this channel month 6+. Anyone
promising faster is selling something.

## 4. Outbound — the motion that actually fills Phase 3

Start only after there's something to point at (live site, SECURITY.md, ideally one
testimonial). Sequence:

1. **Warm network first.** Every lawyer, doctor, accountant, or IT person you know gets
   the 3-sentence version and one ask: "who handles document tooling at your firm?"
   Warm intros close pilots; cold email mostly doesn't at this stage.
2. **Self-host follow-ups.** Anyone who filed an issue, asked a deployment question, or
   appeared in §2 signals. These are the only "cold" emails with real hit rates.
3. **Genuine cold outbound** (later, Phase 2→3 transition): target MSPs and firm
   administrators, not partners/doctors. Realistic math: 2–5% reply rate on a
   well-personalized 50-email/week motion → 1–2 conversations/week → sales cycles of
   **3–9 months** for regulated orgs. Budget accordingly; don't start this while the
   product is pre-pilot.

**The pilot offer** (bridge from free to Phase 3): "Supported deployment — we install
PDFRage on your infrastructure, configure it for your team, 90 days of support —
$1–2K flat." Small enough to skip procurement at small firms, real enough to prove
willingness-to-pay, and every pilot generates the case study the next ten sales need.

## 5. Channel — MSPs and legal-tech ecosystem

- **MSPs**: one MSP serving 30 law firms is 30 deployments. Offer: free for their own
  use, reseller margin (30–40%) on supported deployments. Find them in r/msp and local
  IT-provider directories. This is the highest-leverage outbound target on this page.
- **Legal-tech communities**: ILTA (International Legal Technology Association) forums,
  legal-tech newsletters (LawSites, Legaltech News) — pitch the *story* ("open-source
  answer to the confidentiality problem with online PDF tools"), not the product.
- **Bar associations / practice-management advisors**: many state bars publish tech
  guidance for small firms; getting listed as a privacy-safe tool is a durable citation.

## 6. Trust milestones — sequenced by revenue, not aspiration

| Milestone | Cost | When |
|---|---|---|
| SECURITY.md + threat model + dependency audit page | ~1 day | **Now** |
| Signed releases, pinned CDN dependency hashes (SRI) | ~1 day | Now — cheap and visible |
| Public pen-test of the static site (community/discounted) | ~$0–5K | After first paid pilot |
| SOC2 Type I / formal audits | $20–60K + ongoing | **Only after recurring team revenue demands it** — a Phase 3 milestone, never earlier |

Small-firm pilots close on the SECURITY.md + open-source combination. SOC2 is for the
enterprise tier that is explicitly out of scope until Phase 3 has paying references.

## 7. Metrics that matter (and ones that don't)

Track weekly, one row per week in a spreadsheet:

- **Hand-raisers**: talk-to-us form submissions + deployment-intent GitHub threads. The
  only Phase 2 KPI. Target: first one by month 3 post-launch; 2–4/month by month 9.
- **Pilot conversations → paid pilots**: expect 20–30% of qualified conversations to
  pilot; 3–9 month cycles.
- Supporting: compliance-page impressions (Search Console), self-host signals (Docker
  pulls once published to Docker Hub, clone counts), stars (vanity, but feeds channel
  credibility — "73K stars" is why Stirling gets enterprise calls).
- **Ignore**: PH ranking, ad revenue, raw traffic. None of them produce named humans.

## 8. Operating cadence (solo, ~4 hrs/week)

- **Weekly**: 1 compliance SEO page (§3) · answer all repo issues/discussions same-week
  (responsiveness is a trust signal regulated buyers check) · log metrics row.
- **Monthly**: 10 warm-network touches (§4.1) · follow up every §2 signal · one
  community post where the ICP lives (r/msp, r/sysadmin, legal-tech forum) that helps
  first and mentions PDFRage second.
- **Quarterly**: reread this doc against the metrics; kill channels with zero
  hand-raisers after two quarters, double the one that produced any.

## 9. Honest failure criteria

If by month 12 post-launch there are zero paid pilots and fewer than 5 lifetime
hand-raisers, the compliance thesis is wrong for this product — revert to side-project
mode (Phase 1 maintenance, ads, no sales time) rather than escalating spend on outbound
or certifications. The research already showed the consumer play caps at side-project
money; this doc exists to test the one thesis with a real business behind it, cheaply.
