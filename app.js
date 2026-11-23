(() => {
  const CATS = {
    product:   { th: 'สินค้าใหม่',      color: 'var(--c-product)',   hex: '#1f4e79' },
    corporate: { th: 'องค์กร / M&A',    color: 'var(--c-corporate)', hex: '#6b4c9a' },
    financial: { th: 'ผลประกอบการ',     color: 'var(--c-financial)', hex: '#2f6b2a' },
    rfid:      { th: 'RFID',            color: 'var(--c-rfid)',      hex: '#b8741a' },
    market:    { th: 'ตลาด / เทรนด์',    color: 'var(--c-market)',    hex: '#5d6b73' },
    standards: { th: 'มาตรฐาน',          color: 'var(--c-standards)', hex: '#17171b' },
    sea:       { th: 'ไทย & อาเซียน',    color: 'var(--c-sea)',       hex: '#d8291f' },
  };
  const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtDate = (d) => { const [y,m,dd] = d.split('-').map(Number); return `${dd} ${TH_MONTH[m-1]} ${String(y).slice(2)}`; };
  const catTag = (c) => { const k = CATS[c] || CATS.market; return `<span class="tag"><i style="background:${k.color}"></i>${k.th}</span>`; };
  const TODAY = new Date().toISOString().slice(0,10);
  const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : '#';

  let DATA = { news: [], vendors: [], market: [] };
  const state = { q: '', cat: '', vendor: '' };

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== `panel-${name}`);
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));

  // ---------- Feed item ----------
  function item(n, compact) {
    const vendors = (n.vendors || []).slice(0, 3).map(v => `<span class="vtag">${esc(v)}</span>`).join(' · ');
    return `<li data-testid="news-${esc(n.id)}">
      <span class="date">${fmtDate(n.date)}</span>
      <div>
        <h3><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${esc(n.title_th || n.title_en)}</a></h3>
        ${n.summary_th ? `<p>${esc(n.summary_th)}</p>` : ''}
        <div class="meta">${n.date > TODAY ? '<span class="tag" style="border-color:var(--laser);color:var(--laser)">กำหนดการ</span>' : ''}${catTag(n.category)}${vendors ? `<span>${vendors}</span>` : ''}${n.region && n.region !== 'Global' ? `<span>${esc(n.region)}</span>` : ''}<span class="src">${esc(n.source_name)}</span></div>
      </div></li>`;
  }

  // ---------- Overview ----------
  function renderOverview() {
    const news = DATA.news;
    const latestDate = news[0]?.date;
    const ref = latestDate ? new Date(DATA.updated_at || latestDate) : new Date();
    const d30 = new Date(ref); d30.setDate(d30.getDate() - 30);
    const last30 = news.filter(n => new Date(n.date) >= d30).length;
    const sea = news.filter(n => n.category === 'sea').length;
    const std = news.filter(n => n.category === 'standards').length;
    $('#kpis').innerHTML = `
      <div class="kpi accent" data-testid="kpi-news"><p class="k-label">ข่าวในฐานข้อมูล</p><p class="k-val">${news.length}</p><p class="k-note">30 วันล่าสุด ${last30} ข่าว</p></div>
      <div class="kpi" data-testid="kpi-vendors"><p class="k-label">แบรนด์ที่ติดตาม</p><p class="k-val">${DATA.vendors.length}</p><p class="k-note">สแกนเนอร์ · พรินเตอร์ · RFID · Vision</p></div>
      <div class="kpi" data-testid="kpi-sea"><p class="k-label">ข่าวไทย &amp; อาเซียน</p><p class="k-val">${sea}</p><p class="k-note">ตลาดที่ ACS ขายโดยตรง</p></div>
      <div class="kpi" data-testid="kpi-std"><p class="k-label">มาตรฐาน &amp; เทรนด์</p><p class="k-val">${std}</p><p class="k-note">GS1 Sunrise 2027 · Digital Link · DPP</p></div>`;
    $('#latest-feed').innerHTML = news.slice(0, 7).map(n => item(n, true)).join('') || '<li><span></span><p class="muted">ยังไม่มีข่าว</p></li>';

    // market
    const mk = DATA.market || [];
    $('#market-list').innerHTML = mk.length ? mk.map(m => {
      const base = m.base_value_usd_bn != null ? `$${+(+m.base_value_usd_bn).toFixed(2)}B (${m.base_year ?? '–'})` : '';
      const fc = m.forecast_value_usd_bn != null ? ` → $${+(+m.forecast_value_usd_bn).toFixed(2)}B (${m.forecast_year ?? '–'})` : '';
      return `<div class="mk"><div><div class="seg">${esc(m.segment_th)}</div><div class="scope">${esc(m.scope)}</div></div>
        <div><div class="val">${esc(base + fc) || '–'}</div>${m.cagr_pct != null ? `<div class="cagr">CAGR ${m.cagr_pct}%</div>` : ''}</div>
        <div class="pub"><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.publisher)}</a>${m.published ? ` · ${esc(m.published)}` : ''}</div></div>`;
    }).join('') : '<p class="muted">ยังไม่มีข้อมูล</p>';

    if (!window.Chart) return;
    Chart.defaults.font.family = "'IBM Plex Sans Thai', sans-serif";
    Chart.defaults.color = '#6d6b66';
    // monthly stacked
    const months = [...new Set(news.map(n => n.date.slice(0, 7)))].sort().slice(-8);
    const cats = Object.keys(CATS);
    const ds = cats.map(c => ({ label: CATS[c].th, backgroundColor: CATS[c].hex, borderRadius: 2,
      data: months.map(m => news.filter(n => n.category === c && n.date.startsWith(m)).length) })).filter(d => d.data.some(Boolean));
    new Chart($('#chart-monthly'), { type: 'bar', data: { labels: months.map(m => { const [y, mm] = m.split('-'); return `${TH_MONTH[+mm-1]} ${y.slice(2)}`; }), datasets: ds },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 }, grid: { color: '#e7e3da' } } } } });
    // vendors
    const counts = {};
    news.forEach(n => (n.vendors || []).forEach(v => counts[v] = (counts[v] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    new Chart($('#chart-vendors'), { type: 'bar', data: { labels: top.map(t => t[0]), datasets: [{ data: top.map(t => t[1]), backgroundColor: top.map((_, i) => i === 0 ? '#d8291f' : '#17171b'), borderRadius: 2, barThickness: 14 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { precision: 0 }, grid: { color: '#e7e3da' } }, y: { grid: { display: false } } } } });
  }

  // ---------- News ----------
  function renderNewsFilters() {
    const used = [...new Set(DATA.news.map(n => n.category))];
    $('#cat-chips').innerHTML = [`<button class="chip" aria-pressed="true" data-cat="" data-testid="chip-all">ทั้งหมด</button>`]
      .concat(Object.keys(CATS).filter(c => used.includes(c)).map(c => `<button class="chip" aria-pressed="false" data-cat="${c}" data-testid="chip-${c}"><i style="background:${CATS[c].color}"></i>${CATS[c].th}</button>`)).join('');
    $('#cat-chips').addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.cat = b.dataset.cat;
      document.querySelectorAll('#cat-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      renderNews();
    });
    const vs = [...new Set(DATA.news.flatMap(n => n.vendors || []))].sort();
    $('#news-vendor').insertAdjacentHTML('beforeend', vs.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join(''));
    $('#news-vendor').addEventListener('change', e => { state.vendor = e.target.value; renderNews(); });
    $('#news-q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); renderNews(); });
  }
  function renderNews() {
    const list = DATA.news.filter(n => (!state.cat || n.category === state.cat)
      && (!state.vendor || (n.vendors || []).includes(state.vendor))
      && (!state.q || [n.title_th, n.title_en, n.summary_th, n.source_name, (n.vendors || []).join(' '), n.region].join(' ').toLowerCase().includes(state.q)));
    $('#news-count').textContent = `${list.length} ข่าว`;
    $('#news-feed').innerHTML = list.map(n => item(n)).join('') || '<li><span></span><p class="muted">ไม่พบข่าวที่ตรงกับตัวกรอง</p></li>';
  }

  // ---------- Vendors ----------
  function renderVendors() {
    const counts = {};
    DATA.news.forEach(n => (n.vendors || []).forEach(v => counts[v] = (counts[v] || 0) + 1));
    const rows = [...DATA.vendors].sort((a, b) => (b.latest_date || '').localeCompare(a.latest_date || ''));
    $('#vendor-table tbody').innerHTML = rows.map((v, i) => `<tr data-testid="row-vendor-${i}">
      <td class="vname">${v.website ? `<a href="${esc(safeUrl(v.website))}" target="_blank" rel="noopener">${esc(v.name)}</a>` : esc(v.name)}${v.ticker ? `<small>${esc(v.ticker)}</small>` : ''}</td>
      <td>${esc(v.hq_country || '–')}</td>
      <td><div class="seg">${(v.segments || []).map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></td>
      <td class="move">${v.latest_date ? `<span class="d">${fmtDate(v.latest_date)}</span>` : ''}${esc(v.latest_move_th || 'ยังไม่พบความเคลื่อนไหวล่าสุด')} ${v.url ? `<a class="ext" href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener">ต้นทาง ↗</a>` : ''}</td>
      <td class="num">${matchCount(v.name, counts)}</td></tr>`).join('');
  }
  function matchCount(name, counts) {
    const key = name.toLowerCase().split(/[ (]/)[0];
    return Object.entries(counts).filter(([k]) => k.toLowerCase().startsWith(key)).reduce((s, [, c]) => s + c, 0);
  }

  // ---------- SEA / Standards ----------
  function renderSea() {
    $('#std-feed').innerHTML = DATA.news.filter(n => n.category === 'standards').map(n => item(n, true)).join('') || '<li><span></span><p class="muted">ยังไม่มีข่าว</p></li>';
    $('#sea-feed').innerHTML = DATA.news.filter(n => n.category === 'sea').map(n => item(n, true)).join('') || '<li><span></span><p class="muted">ยังไม่มีข่าว</p></li>';
  }

  // ---------- Lookup ----------
  function checkDigit(body) { // body without check digit
    let sum = 0;
    for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += +body[i] * w;
    return (10 - (sum % 10)) % 10;
  }
  function analyse(raw) {
    const code = raw.replace(/\D/g, '');
    const types = { 8: 'EAN-8 (GTIN-8)', 12: 'UPC-A (GTIN-12)', 13: 'EAN-13 (GTIN-13)', 14: 'GTIN-14 / ITF-14' };
    if (!types[code.length]) return { code, error: `ความยาว ${code.length} หลัก — รองรับ 8, 12, 13 หรือ 14 หลัก` };
    const expected = checkDigit(code.slice(0, -1));
    const valid = expected === +code.slice(-1);
    let type = types[code.length];
    if (code.length === 13 && /^97[89]/.test(code)) type = 'ISBN-13 (Bookland EAN)';
    if (code.length === 13 && /^977/.test(code)) type = 'ISSN (วารสาร)';
    let pref;
    if (code.length === 8) pref = { ...window.gs1Lookup('0' + code.slice(0, 3).padStart(3, '0') + '0000000000'), prefix: code.slice(0, 3) };
    else pref = window.gs1Lookup(code.padStart(14, '0'));
    if (code.length === 8 && /^[0]/.test(code)) pref.label = 'Velocity code / ใช้ภายในร้าน (GTIN-8 ขึ้นต้น 0)';
    return { code, type, valid, expected, pref, gtin14: code.padStart(14, '0') };
  }
  async function fetchProduct(code) {
    const bases = [
      ['Open Food Facts', 'https://world.openfoodfacts.org'],
      ['Open Beauty Facts', 'https://world.openbeautyfacts.org'],
      ['Open Products Facts', 'https://world.openproductsfacts.org'],
    ];
    const fields = 'product_name,product_name_th,product_name_en,brands,image_front_small_url,quantity,categories,countries,manufacturing_places';
    const tries = bases.map(async ([name, base]) => {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(`${base}/api/v2/product/${code}.json?fields=${fields}`, { signal: ctrl.signal });
        const j = await r.json();
        if (j.status === 1 && j.product) return { source: name, url: `${base}/product/${code}`, p: j.product };
      } catch (e) { /* ignore */ } finally { clearTimeout(t); }
      return null;
    });
    const res = await Promise.all(tries);
    return { hit: res.find(Boolean) || null };
  }
  async function lookup(raw) {
    const out = $('#lookup-result');
    const a = analyse(raw);
    if (a.error) { out.innerHTML = `<div class="rcard"><span class="status bad" data-testid="status-check">ไม่ถูกต้อง</span><p>${esc(a.error)}</p></div>`; return; }
    const fmt = a.code.length === 8 ? 'EAN8' : a.code.length === 12 ? 'UPC' : a.code.length === 13 ? 'EAN13' : 'ITF14';
    out.innerHTML = `
      <div class="rcard" data-testid="card-check">
        <div class="bc-svg"><svg id="bc-render" aria-label="ภาพบาร์โค้ด ${esc(a.code)}"></svg></div>
        <dl class="facts">
          <dt>เลข</dt><dd class="mono" data-testid="text-code">${esc(a.code)}</dd>
          <dt>ประเภท</dt><dd data-testid="text-type">${esc(a.type)}</dd>
          <dt>Check digit</dt><dd>${a.valid ? `<span class="status ok" data-testid="status-check">ถูกต้อง</span>` : `<span class="status bad" data-testid="status-check">ผิด — ควรเป็น ${a.expected}</span>`}</dd>
          <dt>GS1 Prefix</dt><dd><span class="mono">${esc(a.pref.prefix)}</span> · <span data-testid="text-prefix">${esc(a.pref.label)}</span></dd>
          <dt>GTIN-14</dt><dd class="mono">${esc(a.gtin14)}</dd>
        </dl>
        <p class="muted" style="font-size:var(--text-xs);margin:var(--space-3) 0 0">Prefix บอกสมาชิก GS1 ที่ออกเลข ไม่ใช่ประเทศที่ผลิตสินค้า</p>
      </div>
      <div class="rcard" id="prod-card" data-testid="card-product"><h2>ข้อมูลสินค้า</h2><p class="muted">กำลังค้นในฐานข้อมูลเปิด…</p></div>
      <div class="rcard"><h2>ตรวจสอบเพิ่มเติม</h2><div class="links">
        <a href="https://www.gs1.org/services/verified-by-gs1" target="_blank" rel="noopener" data-testid="link-vbg">Verified by GS1 (ฟรี 30 ครั้ง/วัน) ↗</a>
        <a href="https://www.gs1th.org/" target="_blank" rel="noopener">GS1 Thailand ↗</a>
        <a href="https://www.google.com/search?q=${a.code}" target="_blank" rel="noopener">Google ↗</a>
        ${/^97[89]/.test(a.code) ? `<a href="https://openlibrary.org/isbn/${a.code}" target="_blank" rel="noopener">Open Library ↗</a>` : ''}
      </div></div>`;
    try { if (window.JsBarcode) JsBarcode('#bc-render', fmt === 'UPC' || fmt === 'EAN13' || fmt === 'EAN8' ? a.code : a.code, { format: a.valid ? fmt : 'CODE128', height: 64, width: 2, fontSize: 14, margin: 6, font: 'IBM Plex Mono' }); } catch (e) { $('#bc-render').outerHTML = '<p class="muted">แสดงภาพบาร์โค้ดไม่ได้</p>'; }

    const { hit } = await fetchProduct(a.code.length === 14 ? a.code : a.code);
    const pc = $('#prod-card'); if (!pc) return;
    if (!hit) { pc.innerHTML = `<h2>ข้อมูลสินค้า</h2><span class="status warn" data-testid="status-product">ไม่พบในฐานข้อมูลเปิด</span><p class="muted" style="font-size:var(--text-sm)">ฐานข้อมูลเปิดเน้นอาหาร เครื่องสำอาง และสินค้าอุปโภค ลองตรวจกับ Verified by GS1 ด้านล่าง</p>`; return; }
    const p = hit.p; const name = p.product_name_th || p.product_name || p.product_name_en || '(ไม่มีชื่อ)';
    pc.innerHTML = `<h2>ข้อมูลสินค้า</h2><div class="prod">
      ${p.image_front_small_url ? `<img src="${esc(safeUrl(p.image_front_small_url))}" alt="${esc(name)}" width="96" height="96" loading="lazy" />` : '<div class="noimg" aria-hidden="true"></div>'}
      <div><h3 data-testid="text-product-name">${esc(name)}</h3>
        <dl class="facts">
          ${p.brands ? `<dt>แบรนด์</dt><dd>${esc(p.brands)}</dd>` : ''}
          ${p.quantity ? `<dt>ขนาด</dt><dd>${esc(p.quantity)}</dd>` : ''}
          ${p.categories ? `<dt>หมวด</dt><dd>${esc(p.categories.split(',').slice(0, 3).join(', '))}</dd>` : ''}
          ${p.countries ? `<dt>ขายใน</dt><dd>${esc(p.countries)}</dd>` : ''}
        </dl>
        <p style="margin:var(--space-3) 0 0;font-size:var(--text-xs)"><span class="status ok" data-testid="status-product">พบใน ${esc(hit.source)}</span> <a href="${esc(hit.url)}" target="_blank" rel="noopener">ดูต้นทาง ↗</a></p>
      </div></div>`;
  }
  $('#lookup-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#gtin-input').value; if (v.trim()) lookup(v); });
  document.querySelectorAll('.ex').forEach(b => b.addEventListener('click', () => { $('#gtin-input').value = b.dataset.ex; lookup(b.dataset.ex); }));

  // camera
  let stream = null, scanning = false;
  $('#cam-btn').addEventListener('click', async () => {
    const msg = $('#cam-msg');
    if (!('BarcodeDetector' in window)) { msg.textContent = 'เบราว์เซอร์นี้ยังไม่รองรับการสแกนด้วยกล้อง (ใช้ Chrome บน Android หรือพิมพ์เลขแทน)'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#cam-video'); v.srcObject = stream; await v.play(); $('#cam-area').hidden = false; msg.textContent = 'เล็งบาร์โค้ดให้อยู่กลางกรอบ';
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'] });
      scanning = true;
      const tick = async () => {
        if (!scanning) return;
        try { const r = await det.detect(v); if (r[0]) { $('#gtin-input').value = r[0].rawValue; stopCam(); lookup(r[0].rawValue); return; } } catch (e) {}
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { msg.textContent = 'เปิดกล้องไม่ได้ — โปรดอนุญาตการใช้กล้อง หรือพิมพ์เลขแทน'; }
  });
  function stopCam() { scanning = false; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('#cam-area').hidden = true; $('#cam-msg').textContent = ''; }
  $('#cam-stop').addEventListener('click', stopCam);

  // ---------- Load ----------
  async function load() {
    try {
      const r = await fetch('data/intel.json', { cache: 'no-store' });
      DATA = await r.json();
      DATA.news.sort((a, b) => b.date.localeCompare(a.date));
      const u = DATA.updated_at ? new Date(DATA.updated_at) : null;
      $('#updated-label').textContent = u ? `อัปเดต ${u.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })} น. (เวลาไทย)` : 'อัปเดตล่าสุด –';
      const start = () => { renderOverview(); renderNewsFilters(); renderNews(); renderVendors(); renderSea(); };
      if (window.Chart) start(); else window.addEventListener('load', start);
    } catch (e) {
      $('#kpis').innerHTML = '<div class="kpi"><p class="k-label">โหลดข้อมูลไม่สำเร็จ</p><p class="k-note">ลองรีเฟรชหน้า</p></div>';
      $('#updated-label').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    }
  }
  load();
})();
