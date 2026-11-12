// Lightweight CMS: reads/writes content/ in the GitHub repo via the REST API.
// No server. The token lives only in this browser's localStorage.
(() => {
  const $ = id => document.getElementById(id);
  const API = 'https://api.github.com';
  const TOKEN_KEY = 'asb_token';
  let repo = null, token = null, current = null; // current = {path, sha, isNew}

  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} },
  };
  const show = id => { for (const s of ['login', 'list', 'editor']) $(s).hidden = s !== id; };
  const toast = (m, ms = 3000) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
  const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // UTF-8 safe base64
  const b64enc = str => { const b = new TextEncoder().encode(str); let s = ''; b.forEach(x => s += String.fromCharCode(x)); return btoa(s); };
  const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

  async function gh(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
    if (!r.ok) {
      let msg = r.statusText; try { msg = (await r.json()).message || msg; } catch {}
      const e = new Error(`${r.status}: ${msg}`); e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  const base = () => `/repos/${repo.owner}/${repo.repo}/contents`;

  // ---- front matter ----
  function parseFM(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { data: {}, body: text };
    const data = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/); if (!kv) continue;
      let v = kv[2].trim();
      if (v.startsWith('[')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); } }
      else if (v.startsWith('"')) { try { v = JSON.parse(v); } catch {} }
      else if (v.startsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
      else if (v === 'true' || v === 'false') v = v === 'true';
      data[kv[1]] = v;
    }
    return { data, body: m[2] };
  }
  function buildFM(d, body) {
    const lines = ['---', `title: ${JSON.stringify(d.title)}`, `date: ${d.date}`, `type: ${JSON.stringify(d.type)}`];
    if (d.author) lines.push(`author: ${JSON.stringify(d.author)}`);
    if (d.abstract) lines.push(`abstract: ${JSON.stringify(d.abstract)}`);
    lines.push(`keywords: ${JSON.stringify(d.keywords)}`);
    if (d.draft) lines.push('draft: true');
    lines.push('---', '', body.trim(), '');
    return lines.join('\n');
  }

  // ---- list ----
  async function loadList() {
    show('list'); $('listMsg').textContent = 'Loading…';
    const tb = $('posts').querySelector('tbody'); tb.innerHTML = '';
    try {
      const files = (await gh(`${base()}/content/posts?ref=${repo.branch}`)).filter(f => f.name.endsWith('.md'));
      const rows = await Promise.all(files.map(async f => {
        const j = await gh(`${base()}/${f.path}?ref=${repo.branch}`);
        const { data } = parseFM(b64dec(j.content));
        return { path: f.path, slug: f.name.replace(/\.md$/, ''), ...data };
      }));
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      tb.innerHTML = rows.map(r => `<tr><td><a href="#" data-p="${esc(r.path)}">${esc(r.title || r.slug)}</a>${r.draft ? '<span class="badge">draft</span>' : ''}</td><td>${esc(r.type || '')}</td><td>${esc(String(r.date).slice(0, 10))}</td><td><a href="/posts/${esc(r.slug)}/" target="_blank">view ↗</a></td></tr>`).join('');
      $('listMsg').textContent = rows.length ? '' : 'No articles yet.';
    } catch (e) {
      $('listMsg').textContent = ''; handleErr(e);
    }
  }
  $('posts').addEventListener('click', e => { const a = e.target.closest('a[data-p]'); if (a) { e.preventDefault(); openPost(a.dataset.p); } });

  // ---- editor ----
  function fill(d, body) {
    $('title').value = d.title || ''; $('type').value = d.type || 'Essay';
    $('date').value = String(d.date || new Date().toISOString()).slice(0, 10);
    $('author').value = d.author || ''; $('abstract').value = d.abstract || '';
    $('keywords').value = (d.keywords || []).join(', '); $('draft').checked = !!d.draft;
    $('body').value = body || ''; setTab('write'); $('editMsg').textContent = '';
    delete $('slug').dataset.touched;
  }
  function newPost() {
    current = { path: null, sha: null, isNew: true };
    fill({ type: 'Essay', draft: true }, ''); $('slug').value = ''; $('slug').disabled = false; $('delete').hidden = true; show('editor');
  }
  async function openPost(path) {
    try {
      const j = await gh(`${base()}/${path}?ref=${repo.branch}`);
      const { data, body } = parseFM(b64dec(j.content));
      current = { path, sha: j.sha, isNew: false };
      fill(data, body); $('slug').value = path.split('/').pop().replace(/\.md$/, ''); $('slug').disabled = true; $('delete').hidden = false; show('editor');
    } catch (e) { handleErr(e); }
  }
  $('title').addEventListener('input', () => { if (current?.isNew && !$('slug').dataset.touched) $('slug').value = slugify($('title').value); });
  $('slug').addEventListener('input', () => $('slug').dataset.touched = '1');

  async function save() {
    const title = $('title').value.trim(); if (!title) return toast('Add a title first');
    const slug = slugify($('slug').value || title); if (!slug) return toast('Add a slug');
    const d = { title, type: $('type').value, date: $('date').value, author: $('author').value.trim(), abstract: $('abstract').value.trim(), keywords: $('keywords').value.split(',').map(s => s.trim()).filter(Boolean), draft: $('draft').checked };
    const path = current.path || `content/posts/${slug}.md`;
    const btn = $('save'); btn.disabled = true; $('editMsg').textContent = 'Saving…';
    try {
      const res = await gh(`${base()}/${path}`, { method: 'PUT', body: JSON.stringify({ message: `${current.isNew ? 'Add' : 'Update'} article: ${title}`, content: b64enc(buildFM(d, $('body').value)), branch: repo.branch, ...(current.sha ? { sha: current.sha } : {}) }) });
      current = { path, sha: res.content.sha, isNew: false }; $('slug').disabled = true; $('delete').hidden = false;
      $('editMsg').textContent = d.draft ? 'Saved as draft (not shown on the site).' : 'Saved. The site will update in about a minute.';
      toast('Saved ✓');
    } catch (e) {
      $('editMsg').textContent = ''; if (e.status === 422 || e.status === 409) toast('Conflict: file changed elsewhere or slug already exists. Reload the article.', 6000); else handleErr(e);
    } finally { btn.disabled = false; }
  }
  async function del() {
    if (!current?.path || !confirm('Delete this article permanently? (It stays recoverable in git history.)')) return;
    try {
      await gh(`${base()}/${current.path}`, { method: 'DELETE', body: JSON.stringify({ message: `Delete article: ${$('title').value}`, sha: current.sha, branch: repo.branch }) });
      toast('Deleted'); loadList();
    } catch (e) { handleErr(e); }
  }

  // ---- images ----
  $('img').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    if (f.size > 5e6) return toast('Image over 5 MB; please shrink it first', 5000);
    const name = Date.now().toString(36) + '-' + f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    toast('Uploading…');
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      await gh(`${base()}/content/images/${name}`, { method: 'PUT', body: JSON.stringify({ message: `Add image ${name}`, content: data, branch: repo.branch }) });
      const ta = $('body'), s = ta.selectionStart, alt = f.name.replace(/\.[^.]+$/, '');
      ta.setRangeText(`\n\n![${alt}](/images/${name})\n\n`, s, ta.selectionEnd, 'end'); toast('Image inserted (live after next build)');
    } catch (e) { handleErr(e); }
  });

  // ---- tabs / preview ----
  function setTab(t) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('body').hidden = t !== 'write'; $('preview').hidden = t !== 'preview';
    if (t === 'preview') $('preview').innerHTML = window.marked ? marked.parse($('body').value) : '<p>Preview unavailable offline.</p>';
  }
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.t));

  // ---- auth / boot ----
  function handleErr(e) {
    if (e.status === 401) { store.del(TOKEN_KEY); token = null; show('login'); $('loginErr').textContent = 'Token rejected or expired. Please sign in again.'; }
    else if (e.status === 403 || e.status === 404) toast(`GitHub says ${e.message}. Check the token has Contents: Read and write on ${repo.owner}/${repo.repo}.`, 7000);
    else toast(e.message, 5000);
  }
  $('loginForm').addEventListener('submit', async ev => {
    ev.preventDefault(); token = $('token').value.trim(); $('loginErr').textContent = '';
    try { const r = await gh(`/repos/${repo.owner}/${repo.repo}`); if (!r.permissions?.push) throw new Error('403: token cannot write to this repository'); store.set(TOKEN_KEY, token); $('logout').hidden = false; $('token').value = ''; loadList(); }
    catch (e) { $('loginErr').textContent = 'Could not connect: ' + e.message; token = null; }
  });
  $('logout').onclick = () => { store.del(TOKEN_KEY); token = null; $('logout').hidden = true; show('login'); };
  $('newPost').onclick = newPost; $('back').onclick = () => { if (!$('delete').hidden || !$('body').value || confirm('Leave without saving?')) loadList(); };
  $('save').onclick = save; $('delete').onclick = del;
  window.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 's' && !$('editor').hidden) { e.preventDefault(); save(); } });

  (async () => {
    try { repo = await (await fetch('config.json')).json(); } catch { return document.body.insertAdjacentHTML('beforeend', '<main><p class="err">Missing admin/config.json</p></main>'); }
    $('repoName').textContent = `${repo.owner}/${repo.repo}`;
    $('actionsLink').href = `https://github.com/${repo.owner}/${repo.repo}/actions`;
    token = store.get(TOKEN_KEY);
    if (token) { $('logout').hidden = false; loadList(); } else show('login');
  })();
})();
