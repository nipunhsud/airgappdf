# PDFRage — Business Plan (revised after market research)

Hosting cost is ~$0 (static site, client-side processing), so any revenue is near-pure
margin. But research (see git history for the full report) showed: head SEO terms are
unwinnable vs iLovePDF (264M visits/mo), closed-source privacy-PDF clones flop at launch
(ihatepdf: 12 PH upvotes), and the one breakout in this niche won via open source
(Stirling PDF: 73K stars → commercial company). Ads on utility traffic run $1–5 RPM.
Plan accordingly: **open source is the distribution engine; the business is Phase 3.**

## Phase 1 — Distribution (months 0–6)  ← current

Goal: stars, users, self-host deployments. Not revenue.

- MIT-licensed public repo, Docker one-liner, README that leads with the trust argument.
- Launch: Show HN → r/selfhosted → r/privacy (drafts in LAUNCH.md). PH optional.
- Long-tail SEO pages only ("delete pdf pages without uploading") — never head terms.
- Everything free, including BYO-key AI chat. No paywalls: a gate would kill the launch
  and gates nothing that costs us money.

## Phase 2 — Self-serve revenue + lead capture (months 6–18)

Everything here must sell via a Stripe link with zero sales conversations:

- **Hosted AI Pro (~$8–10/mo):** chat/summarize without an API key — we hold the key
  behind a ~30-line Cloudflare Worker proxy. The one thing BYO-key can't serve.
- **Desktop app ($29 one-time):** Tauri wrapper, same codebase. "No internet at all."
- **Lead capture for Phase 3:** "Team / compliance license — talk to us" CTA on every
  page. A law firm's IT person self-deploying the Docker image is a Phase 3 lead.

Realistic ceiling: hundreds to low thousands $/mo. Real output: the lead list.

## Phase 3 — Compliance vertical (18+ months)

The actual business. Legal/medical/finance teams that *cannot* upload documents — the
only buyers whose willingness-to-pay attaches to the privacy property. Open source is
the prerequisite: "audit the source" is the only privacy claim a security review accepts.

- Open-core, Stirling-style: free repo; paid SSO/SAML, audit logging, support SLA,
  deployment help, managed instance.
- High-touch: outbound to Phase 2 hand-raisers, partnerships. SOC2-adjacent trust work
  only once revenue justifies it. Not a Stripe-link motion — plan sales time.

## What NOT to build (still)

- No accounts/auth before Phase 2 payments demand it.
- No RAG/vector store — PDFs fit in Claude's context window; send directly.
- No PDF↔Word conversion until Search Console proves demand (needs LibreOffice-WASM,
  and it's the one place client-side quality is hard to match).
- No donations line item — GitHub Sponsors is beer money, not a plan.
