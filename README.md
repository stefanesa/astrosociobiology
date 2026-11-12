# Astro-Sociobiology

Source for [astrosociobiology.com](https://astrosociobiology.com): a lightweight, academic-journal-style blog about the speculative science of what advanced alien societies might be like.

- **No framework, no database.** `build.js` (about 200 lines, deps: `marked`, `gray-matter`) turns Markdown in `content/` into static HTML in `dist/`.
- **Hosting:** GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main`.
- **CMS:** `/admin/` is a small browser editor that commits Markdown to this repo through the GitHub API. Saving an article triggers a rebuild; it's live in about a minute.

## Writing articles

### Option A: the web editor
1. Go to `https://astrosociobiology.com/admin/`.
2. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new) restricted to this repo with **Contents: Read and write**, and paste it in. (It's stored only in your browser's localStorage.)
3. Write, preview, upload images, tick *Draft* to keep something hidden, and press **Save & publish** (⌘/Ctrl-S).

### Option B: files
Add `content/posts/my-slug.md`:

```markdown
---
title: "My Title"
date: 2025-05-01
type: Essay            # Essay | Primer | Field Note | Response | Review
abstract: "One to three sentences."
keywords: [evolution, economics]
draft: false           # true hides it from the site
---

Markdown body…
```

Volume = year since `foundingYear` in `site.config.json` (2025 = Vol. I); article number = order within the volume. Both are computed, so you never number anything by hand.

## Local development

```sh
npm install
npm run serve     # builds and serves http://localhost:8080
```

## Layout

```
content/posts/   articles (Markdown + front matter)
content/pages/   static pages (about)
content/images/  uploaded images -> /images/
static/          style.css, favicon, admin/ (the CMS)
site.config.json title, author, domain, GitHub repo
build.js         the generator
```

## Custom domain
`CNAME` is generated from `site.config.json`. At your DNS provider, point `astrosociobiology.com` at GitHub Pages (four `A` records: `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`; optional `www` CNAME to `stefanesa.github.io`), then enable *Enforce HTTPS* in the repo's Pages settings.
