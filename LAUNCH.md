# Phase 1 Launch Playbook

Order matters: HN first (biggest upside, one shot), Reddit the following week
(one subreddit at a time — cross-posting the same day reads as spam), PH last
(lowest expected value in this niche; ihatepdf got 12 upvotes there).

Before posting anywhere: repo public, README screenshot renders, Docker one-liner
works, site deployed on a real domain (GitHub Pages is fine and free).

---

## Show HN

**Title:** Show HN: AirgapPDF – PDF tools with no server, files never leave your browser

**Text:**

> I got tired of "free PDF tools" that upload your documents to someone's server,
> so I built the version with nothing to trust: a static site where merge, split,
> compress, rotate, etc. all run client-side via pdf-lib and pdf.js. There is no
> backend at all — you can audit every line, or self-host it with one Docker
> command, and the tools keep working offline after first load.
>
> The one network feature is opt-in: "chat with PDF" sends the document straight
> from your browser to the Claude API with your own key.
>
> MIT licensed. Adding a tool is one HTML page + one function, so PRs for new
> tools are easy. Happy to answer anything about the WASM/browser constraints —
> compression was the interesting one (currently rasterize-to-JPEG; Ghostscript-WASM
> is the upgrade path).

Notes: reply fast for the first 2 hours; the licensing question will come (answer:
MIT, deps are MIT/Apache); the "why not Stirling PDF" question will come (answer:
Stirling is server-side self-hosted, this is zero-server — different trust model).

---

## r/selfhosted

**Title:** AirgapPDF — open-source PDF toolkit that's not just self-hosted, it's server-less (all client-side)

**Text:**

> Stirling PDF is great but still processes files on the server you host. AirgapPDF
> is the other end of the spectrum: a static site where everything (merge, split,
> compress, rotate, page numbers…) runs in the browser. Host it on nginx, a Pi, or
> GitHub Pages — the "server" only ever serves static files, so there's nothing to
> secure and it runs on anything. `docker run -p 8080:80` and you're done. MIT.

---

## r/privacy

**Title:** I made an open-source PDF tool where files literally cannot leave your browser

**Text:**

> Every online PDF converter says "we delete your files after 2 hours." You can't
> verify that. AirgapPDF removes the claim entirely: it's a static page, processing
> happens in-browser via pdf-lib, and you can confirm there's no upload in DevTools
> or read the source (MIT, no build step — the code that runs is the code in the
> repo). Works offline after first load. Self-hostable in one Docker command.

---

## Product Hunt (optional, low expectations)

**Tagline:** Free PDF tools with no server — your files never leave your browser
**First comment:** the Show HN text, minus the HN-isms.

---

## After launch

- Pin a "good first tool" issue (e.g. "add watermark tool — copy rotate.html,
  ~40 lines") to convert stars into contributors.
- Add the GitHub star count badge to the site header once it's non-embarrassing.
- Track which tool pages get organic search impressions (Search Console) and add
  neighboring long-tail tools first.
