// Minimal static site generator for Astro-Sociobiology.
// content/posts/*.md + content/pages/*.md  ->  dist/
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
const iso = d => d.toISOString().slice(0, 10);
const long = d => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const roman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'][n] || String(n);

function write(rel, content) {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data, content } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { file: f, slug: f.replace(/\.md$/, ''), data, content };
  });
}

// ---- load posts -----------------------------------------------------------
let posts = readDir(path.join(ROOT, 'content/posts'))
  .filter(p => !p.data.draft)
  .map(p => {
    const date = p.data.date instanceof Date ? p.data.date : new Date(p.data.date || Date.now());
    const kw = Array.isArray(p.data.keywords) ? p.data.keywords : String(p.data.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
      slug: p.slug, title: p.data.title || p.slug, date, type: p.data.type || 'Essay',
      abstract: p.data.abstract || '', keywords: kw, author: p.data.author || cfg.author,
      html: marked.parse(p.content),
      words: p.content.split(/\s+/).filter(Boolean).length,
    };
  })
  .sort((a, b) => a.date - b.date || a.slug.localeCompare(b.slug));

// volume = years since founding; article number = order within volume
const counters = {};
for (const p of posts) {
  p.year = p.date.getUTCFullYear();
  p.vol = Math.max(1, p.year - cfg.foundingYear + 1);
  counters[p.vol] = (counters[p.vol] || 0) + 1;
  p.no = counters[p.vol];
  p.url = `/posts/${p.slug}/`;
  p.cite = `${p.author}. (${p.year}). ${p.title}. <i>${esc(cfg.title)}</i>, ${p.vol}(${p.no}). ${cfg.url}${p.url}`;
}
const newestFirst = [...posts].reverse();

// ---- layout ---------------------------------------------------------------
function layout({ title, desc, url, body, type = 'website' }) {
  const full = title ? `${title} · ${cfg.title}` : `${cfg.title}: ${cfg.tagline}`;
  const d = desc || cfg.tagline;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${cfg.url}${url}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${cfg.url}${url}">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.title)}" href="/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="masthead">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-name">Astro&#8209;Sociobiology</span></a>
    <p class="tagline">${esc(cfg.tagline)}</p>
    <nav>
      <a href="/">Current</a>
      <a href="/archive/">Archive</a>
      <a href="/about/">About</a>
      <a href="/feed.xml">RSS</a>
    </nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="wrap foot">
  <p>${esc(cfg.title)} · ISSN pending · Volume ${roman(Math.max(1, new Date().getUTCFullYear() - cfg.foundingYear + 1))} · Articles are speculative essays, not peer-reviewed research.</p>
  <p>© ${new Date().getUTCFullYear()} ${esc(cfg.author)}</p>
</footer>
</body>
</html>`;
}

const tagLink = k => `<a href="/keywords/${slugify(k)}/">${esc(k)}</a>`;
const meta = p => `<p class="meta"><span class="type">${esc(p.type)}</span> · Vol. ${p.vol}, No. ${p.no} · <time datetime="${iso(p.date)}">${long(p.date)}</time></p>`;

function entry(p) {
  return `<article class="entry">
  ${meta(p)}
  <h2><a href="${p.url}">${esc(p.title)}</a></h2>
  <p class="by">${esc(p.author)}</p>
  ${p.abstract ? `<p class="abs">${esc(p.abstract)}</p>` : ''}
  <p class="kw">${p.keywords.map(tagLink).join(' · ')}</p>
</article>`;
}

// ---- pages ----------------------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
copyDir(path.join(ROOT, 'static'), DIST);
copyDir(path.join(ROOT, 'content/images'), path.join(DIST, 'images'));
write('admin/config.json', JSON.stringify(cfg.github));

// home
const latest = newestFirst[0];
const home = `
<section class="intro">
  <p class="eyebrow">An open journal of speculative science</p>
  <h1>What might advanced alien societies be like?</h1>
  <p class="lede">Astro-Sociobiology applies evolution, economics, ecology and sociology to a question science fiction usually answers with prosthetic foreheads: if we meet intelligent life that can reach the stars, what should we expect of it? New to the field? Start with the <a href="/posts/what-is-astro-sociobiology/">primer</a>.</p>
</section>
<section>
  <h2 class="section">Latest articles</h2>
  ${newestFirst.slice(0, 5).map(entry).join('\n')}
  <p class="more"><a href="/archive/">Browse the full archive →</a></p>
</section>`;
write('index.html', layout({ title: '', url: '/', body: home }));

// posts
posts.forEach((p, i) => {
  const prev = posts[i - 1], next = posts[i + 1];
  const body = `
<article class="article">
  <header>
    ${meta(p)}
    <h1>${esc(p.title)}</h1>
    <p class="by">${esc(p.author)}</p>
    ${p.abstract ? `<div class="abstract"><h2>Abstract</h2><p>${esc(p.abstract)}</p></div>` : ''}
    <p class="kw"><b>Keywords:</b> ${p.keywords.map(tagLink).join(', ')}</p>
  </header>
  <div class="prose">${p.html}</div>
  <footer class="cite">
    <h2>Cite this article</h2>
    <p>${p.cite}</p>
    <p class="small">${Math.max(1, Math.round(p.words / 220))} min read</p>
  </footer>
</article>
<nav class="pager">
  ${prev ? `<a class="prev" href="${prev.url}"><span>← Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
  ${next ? `<a class="next" href="${next.url}"><span>Next →</span>${esc(next.title)}</a>` : '<span></span>'}
</nav>`;
  write(`posts/${p.slug}/index.html`, layout({ title: p.title, desc: p.abstract, url: p.url, body, type: 'article' }));
});

// archive, grouped by volume
const vols = [...new Set(newestFirst.map(p => p.vol))];
const archive = `
<h1 class="pagetitle">Archive</h1>
<p class="lede">${posts.length} article${posts.length === 1 ? '' : 's'} across ${vols.length} volume${vols.length === 1 ? '' : 's'}. Browse by <a href="#keywords">keyword</a>.</p>
${vols.map(v => {
  const ps = newestFirst.filter(p => p.vol === v);
  return `<section class="volume"><h2 class="section">Volume ${roman(v)} <span>(${cfg.foundingYear + v - 1})</span></h2>
<ol class="toc" reversed>
${ps.map(p => `<li><span class="no">${p.no}</span><div><a href="${p.url}">${esc(p.title)}</a><span class="tocmeta">${esc(p.type)} · ${long(p.date)}</span></div></li>`).join('\n')}
</ol></section>`;
}).join('\n')}`;

// keywords
const kwMap = {};
for (const p of newestFirst) for (const k of p.keywords) (kwMap[slugify(k)] ||= { name: k, posts: [] }).posts.push(p);
const kwList = Object.entries(kwMap).sort((a, b) => a[1].name.localeCompare(b[1].name));
write('archive/index.html', layout({
  title: 'Archive', url: '/archive/',
  body: archive + `<section id="keywords"><h2 class="section">Keywords</h2><p class="kwcloud">${kwList.map(([s, k]) => `<a href="/keywords/${s}/">${esc(k.name)}</a> <sup>${k.posts.length}</sup>`).join(' · ')}</p></section>`,
}));
for (const [s, k] of kwList) {
  write(`keywords/${s}/index.html`, layout({
    title: `Keyword: ${k.name}`, url: `/keywords/${s}/`,
    body: `<h1 class="pagetitle">Keyword: ${esc(k.name)}</h1>${k.posts.map(entry).join('\n')}<p class="more"><a href="/archive/">← Archive</a></p>`,
  }));
}

// static pages
for (const pg of readDir(path.join(ROOT, 'content/pages'))) {
  const url = pg.slug === 'index' ? '/' : `/${pg.slug}/`;
  write(`${pg.slug}/index.html`, layout({ title: pg.data.title, url, body: `<div class="prose page"><h1 class="pagetitle">${esc(pg.data.title)}</h1>${marked.parse(pg.content)}</div>` }));
}

// 404, feed, sitemap, CNAME
write('404.html', layout({ title: 'Not found', url: '/404.html', body: `<h1 class="pagetitle">Signal lost</h1><p class="lede">That page isn't in the archive. Try the <a href="/archive/">archive</a>.</p>` }));
const rfc = d => d.toUTCString();
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(cfg.title)}</title><link>${cfg.url}</link><description>${esc(cfg.tagline)}</description>
${newestFirst.map(p => `<item><title>${esc(p.title)}</title><link>${cfg.url}${p.url}</link><guid>${cfg.url}${p.url}</guid><pubDate>${rfc(p.date)}</pubDate><description>${esc(p.abstract)}</description></item>`).join('\n')}
</channel></rss>`);
const urls = ['/', '/archive/', '/about/', ...posts.map(p => p.url), ...kwList.map(([s]) => `/keywords/${s}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${cfg.url}${u}</loc></url>`).join('\n')}\n</urlset>`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${cfg.url}/sitemap.xml\n`);
write('CNAME', new URL(cfg.url).hostname + '\n');

console.log(`Built ${posts.length} articles, ${kwList.length} keywords → dist/`);
