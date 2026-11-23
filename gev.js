(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : '#';
  const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const fmtDate = (d) => { if (!d) return '-'; const [y, m, dd] = d.split('-').map(Number); return `${dd} ${TH_MONTH[m - 1]} ${String(y).slice(2)}`; };
  const IND_COLOR = {
    'คลังสินค้าและโลจิสติกส์': '#a59bff',
    'โรงงานอาหารและเครื่องดื่ม': '#ff8fb1',
    'โรงงานผลิต อิเล็กทรอนิกส์ ยา และยานยนต์': '#6fd3ff',
    'โรงพยาบาล': '#7ddc8a',
    'ค้าปลีกและศูนย์การค้า': '#ffd166',
  };
  const REGION_ALIAS = { USA: 'United States' };
  const VIEWS = {
    world: { center: [80, 18], zoom: 1.9, pitch: 0, bearing: 0 },
    asia: { center: [118, 22], zoom: 2.6, pitch: 20, bearing: 0 },
    th: { center: [100.75, 13.45], zoom: 7.2, pitch: 45, bearing: -10 },
  };
  const TOUR = [
    { v: { center: [-85, 40], zoom: 3.1, pitch: 30, bearing: 0 }, t: 'อเมริกาเหนือ: Zebra, Honeywell → Brady, Cognex, Impinj, Avery Dennison' },
    { v: { center: [11, 45], zoom: 3.4, pitch: 30, bearing: 0 }, t: 'ยุโรป: Datalogic ถูกซื้อและออกจากตลาดหุ้นแล้ว (9 ก.ย. 2569)' },
    { v: { center: [132, 31], zoom: 3.4, pitch: 30, bearing: 0 }, t: 'ญี่ปุ่น ไต้หวัน จีน: SATO, Toshiba Tec, Epson, Brother, TSC, GoDEX, Newland, UROVO, POSTEK' },
    { v: { center: [103, 8], zoom: 4.2, pitch: 35, bearing: 0 }, t: 'อาเซียน: ข่าวไทย สิงคโปร์ เวียดนาม มาเลเซีย อินโดนีเซีย' },
    { v: VIEWS.th, t: 'ไทย: ACS กับเป้าหมาย 56 ราย และ RFP 4 รายการ' },
  ];

  let map, popup, GEO, INTEL, rotating = true, touring = false, userBusy = false, lastInteract = 0;
  const layerState = { brands: true, arcs: true, news: true, acs: true, estates: false, sat: true };

  // Great-circle interpolation (schematic arcs)
  function gc(a, b, n = 64) {
    const r = Math.PI / 180, [l1, p1] = [a[0] * r, a[1] * r], [l2, p2] = [b[0] * r, b[1] * r];
    const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (!d) return [a, b];
    const out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x * x + y * y)) / r]);
    }
    // keep longitudes continuous
    for (let i = 1; i < out.length; i++) { while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360; while (out[i][0] - out[i - 1][0] < -180) out[i][0] += 360; }
    return out;
  }
  const fc = (features) => ({ type: 'FeatureCollection', features });
  const pt = (lon, lat, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });

  function buildData() {
    const vendors = INTEL.vendors || [];
    const news = INTEL.news || [];
    const hq = GEO.acs.hq;
    // brand mentions
    const vcount = {};
    news.forEach(n => (n.vendors || []).forEach(v => { vcount[v] = (vcount[v] || 0) + 1; }));
    const brandFeatures = [];
    const arcs = [];
    vendors.forEach(v => {
      const g = GEO.vendors_geo[v.name]; if (!g) return;
      const short = v.name.split(' (')[0];
      const mentions = Object.entries(vcount).filter(([k]) => short.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(short.split(' ')[0].toLowerCase())).reduce((s, [, c]) => s + c, 0);
      brandFeatures.push(pt(g[2], g[1], { name: short, city: g[0], move: v.latest_move_th || '', date: v.latest_date || '', url: v.url || v.website || '', mentions }));
      arcs.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: gc([g[2], g[1]], [hq.lon, hq.lat]) }, properties: { name: short } });
    });
    // news per country
    const byRegion = {};
    let globalCount = 0;
    news.forEach(n => {
      const r = REGION_ALIAS[n.region] || n.region;
      if (GEO.regions[r]) { (byRegion[r] = byRegion[r] || []).push(n); } else globalCount++;
    });
    const newsFeatures = Object.entries(byRegion).map(([r, list]) => {
      const [lat, lon] = GEO.regions[r];
      return pt(lon, lat, { region: r, count: list.length, top: list.slice(0, 3).map(n => `${fmtDate(n.date)} · ${n.title_th || n.title_en}`).join('||'), url: list[0].url });
    });
    const acsFeatures = GEO.acs.targets.map(t => pt(t.lon, t.lat, { kind: 'target', name: t.name, industry: t.industry, area: t.area, conf: t.conf, color: IND_COLOR[t.industry] || '#a59bff' }));
    const rfpFeatures = GEO.acs.rfps.map(r => pt(r.lon, r.lat, { kind: 'rfp', name: `${r.customer} · ${r.title}`, product: r.product, status: r.status, rec: r.rec, deadline: r.deadline || '' }));
    const estateFeatures = GEO.acs.estates.map(e => pt(e.lon, e.lat, { name: e.name, province: e.province }));
    return { brandFeatures, arcs, newsFeatures, acsFeatures, rfpFeatures, estateFeatures, globalCount, countries: Object.keys(byRegion).length };
  }

  function renderStats(d) {
    $('#gev-stats').innerHTML = [
      ['แบรนด์', d.brandFeatures.length],
      ['ประเทศที่มีข่าว', d.countries],
      ['ข่าวระดับโลก', d.globalCount],
      ['บัญชี ACS', GEO.acs.targets.length],
      ['Bid Desk', GEO.acs.rfps.length],
    ].map(([k, v]) => `<div class="gs"><span class="gs-v" data-count="${v}">0</span><span class="gs-k">${k}</span></div>`).join('');
    document.querySelectorAll('.gs-v').forEach(el => {
      const to = +el.dataset.count, t0 = performance.now();
      const step = (t) => { const f = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(to * (1 - Math.pow(1 - f, 3))); if (f < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  function renderTicker() {
    const items = (INTEL.news || []).slice(0, 12).map(n => `<a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener"><b>${fmtDate(n.date)}</b> ${esc(n.title_th || n.title_en)}</a>`).join('<span class="sep">◆</span>');
    $('#gev-ticker').innerHTML = items + '<span class="sep">◆</span>' + items;
  }

  function renderBelow() {
    const byId = Object.fromEntries((INTEL.news || []).map(n => [n.id, n]));
    $('#impact-grid').innerHTML = GEO.acs.impact.map((x, i) => {
      const n = byId[x.news_id];
      const link = n ? `<a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${esc(n.source_name || 'ต้นทาง')} · ${fmtDate(n.date)}</a>` : '<span class="muted">ยังไม่พบข่าวต้นทางในฐานข้อมูล</span>';
      return `<div class="impact" data-testid="card-impact-${i}">
        <div class="imp-top"><span class="pill ev">ข่าวยืนยันแล้ว</span><span class="pill lv lv-${x.level === 'สูง' ? 'hi' : 'md'}">ผลกระทบ${esc(x.level)}</span></div>
        <h3>${esc(x.news)}</h3>
        <p class="imp-src">${link}</p>
        <div class="imp-arrow" aria-hidden="true">↓ เกี่ยวกับงานของ ACS</div>
        <ul>${x.deals.map(d => `<li><span class="pill mem">ACS</span>${esc(d)}</li>`).join('')}</ul>
        <p class="imp-so"><b>แปลว่า</b> ${esc(x.so)} <span class="muted">(การประเมินเบื้องต้น)</span></p>
      </div>`;
    }).join('');
    $('#mem-kpis').innerHTML = GEO.acs.programs.map(p => `<div class="mk"><p class="mk-v">${esc(p.v)}</p><p class="mk-k">${esc(p.k)}</p><p class="mk-n">${esc(p.n)}</p></div>`).join('');
    const ind = {};
    GEO.acs.targets.forEach(t => { ind[t.industry] = (ind[t.industry] || 0) + 1; });
    const max = Math.max(...Object.values(ind));
    $('#mem-industry').innerHTML = Object.entries(ind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bar-row"><span class="bar-l">${esc(k)}</span><span class="bar"><i style="width:${(v / max) * 100}%;background:${IND_COLOR[k] || '#a59bff'}"></i></span><span class="bar-v">${v}</span></div>`).join('');
    $('#mem-rfps').innerHTML = GEO.acs.rfps.map(r => `<li><div><b>${esc(r.customer)}</b> · ${esc(r.title)}</div><div class="muted small">${esc(r.product)}</div><div class="rfp-meta"><span class="pill ${/NO/.test(r.rec) ? 'lv-md' : 'ev'}">${esc(r.rec)}</span><span>${esc(r.status)}</span>${r.deadline ? `<span>กำหนด ${fmtDate(r.deadline)}</span>` : ''}</div></li>`).join('');
  }

  function style() {
    return {
      version: 8,
      projection: { type: 'globe' },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sky: { 'sky-color': '#05070d', 'horizon-color': '#1b2a4a', 'fog-color': '#0a0f1c', 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.7, 8, 0] },
      sources: {
        dark: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' },
        ref: { type: 'raster', tileSize: 256, maxzoom: 12, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
        sat: { type: 'raster', tileSize: 256, maxzoom: 17, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#05070d' } },
        { id: 'dark', type: 'raster', source: 'dark' },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-brightness-max': 0.75, 'raster-contrast': 0.1 } },
        { id: 'ref', type: 'raster', source: 'ref', minzoom: 3, paint: { 'raster-opacity': 0.55 } },
      ],
    };
  }

  function addLayers(d) {
    const hq = GEO.acs.hq;
    map.addSource('arcs', { type: 'geojson', data: fc(d.arcs) });
    map.addSource('brands', { type: 'geojson', data: fc(d.brandFeatures) });
    map.addSource('news', { type: 'geojson', data: fc(d.newsFeatures) });
    map.addSource('targets', { type: 'geojson', data: fc(d.acsFeatures) });
    map.addSource('rfps', { type: 'geojson', data: fc(d.rfpFeatures) });
    map.addSource('estates', { type: 'geojson', data: fc(d.estateFeatures) });
    map.addSource('hq', { type: 'geojson', data: fc([pt(hq.lon, hq.lat, { name: 'ACS · กรุงเทพฯ' })]) });

    map.addLayer({ id: 'arcs-glow', type: 'line', source: 'arcs', paint: { 'line-color': '#ff4d3d', 'line-width': 4, 'line-opacity': 0.12, 'line-blur': 3 } });
    map.addLayer({ id: 'arcs', type: 'line', source: 'arcs', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ff6a4d', 'line-width': 1.3, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] } });

    map.addLayer({ id: 'estates', type: 'circle', source: 'estates', layout: { visibility: 'none' }, paint: { 'circle-radius': 4, 'circle-color': '#7ddc8a', 'circle-opacity': 0.75, 'circle-stroke-color': '#0a0f1c', 'circle-stroke-width': 1 } });

    map.addLayer({ id: 'news-pulse', type: 'circle', source: 'news', paint: { 'circle-radius': ['+', 8, ['*', 2.2, ['get', 'count']]], 'circle-color': '#4fe3ff', 'circle-opacity': 0.15, 'circle-blur': 0.4 } });
    map.addLayer({ id: 'news', type: 'circle', source: 'news', paint: { 'circle-radius': ['+', 4, ['sqrt', ['get', 'count']]], 'circle-color': '#4fe3ff', 'circle-stroke-color': '#e8fbff', 'circle-stroke-width': 1 } });
    map.addLayer({ id: 'news-count', type: 'symbol', source: 'news', layout: { 'text-field': ['to-string', ['get', 'count']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#05070d' } });

    map.addLayer({ id: 'targets', type: 'circle', source: 'targets', minzoom: 4, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 6], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#05070d', 'circle-stroke-width': 1, 'circle-opacity': ['match', ['get', 'conf'], 'low', 0.55, 0.95] } });
    map.addLayer({ id: 'rfps-halo', type: 'circle', source: 'rfps', minzoom: 4, paint: { 'circle-radius': 14, 'circle-color': '#ff4d3d', 'circle-opacity': 0.18 } });
    map.addLayer({ id: 'rfps', type: 'circle', source: 'rfps', minzoom: 4, paint: { 'circle-radius': 6, 'circle-color': '#ff4d3d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });

    map.addLayer({ id: 'brands-glow', type: 'circle', source: 'brands', paint: { 'circle-radius': 12, 'circle-color': '#ffb547', 'circle-opacity': 0.18, 'circle-blur': 0.6 } });
    map.addLayer({ id: 'brands', type: 'circle', source: 'brands', paint: { 'circle-radius': 4.5, 'circle-color': '#ffb547', 'circle-stroke-color': '#fff3dc', 'circle-stroke-width': 1.2 } });
    map.addLayer({ id: 'brands-label', type: 'symbol', source: 'brands', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#ffe2b0', 'text-halo-color': '#05070d', 'text-halo-width': 1.4 } });

    map.addLayer({ id: 'hq-pulse', type: 'circle', source: 'hq', paint: { 'circle-radius': 18, 'circle-color': '#ff4d3d', 'circle-opacity': 0.25 } });
    map.addLayer({ id: 'hq', type: 'circle', source: 'hq', paint: { 'circle-radius': 7, 'circle-color': '#ff4d3d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'hq-label', type: 'symbol', source: 'hq', layout: { 'text-field': 'ACS', 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, -1.4], 'text-anchor': 'bottom', 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': '#ff4d3d', 'text-halo-width': 2 } });
  }

  const LAYER_IDS = {
    brands: ['brands', 'brands-glow', 'brands-label'],
    arcs: ['arcs', 'arcs-glow'],
    news: ['news', 'news-pulse', 'news-count'],
    acs: ['targets', 'rfps', 'rfps-halo'],
    estates: ['estates'],
    sat: ['sat', 'ref'],
  };
  function applyLayer(k) {
    const vis = layerState[k] ? 'visible' : 'none';
    LAYER_IDS[k].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', vis));
    if (k === 'sat') map.setLayoutProperty('dark', 'visibility', layerState.sat ? 'none' : 'visible');
  }

  function popupHtml(f) {
    const p = f.properties, L = f.layer.id;
    if (L.startsWith('brands')) return `<p class="pp-eb">แบรนด์ · ${esc(p.city)}</p><h4>${esc(p.name)}</h4><p>${esc(p.move)}</p><p class="pp-m">${fmtDate(p.date)} · ข่าวในฐานข้อมูล ${p.mentions} ข่าว</p>${p.url ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">อ่านต้นทาง →</a>` : ''}`;
    if (L.startsWith('news')) return `<p class="pp-eb">ข่าวตามประเทศ</p><h4>${esc(p.region)} · ${p.count} ข่าว</h4><ul>${String(p.top).split('||').map(t => `<li>${esc(t)}</li>`).join('')}</ul><a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">ข่าวล่าสุด →</a>`;
    if (L === 'targets') return `<p class="pp-eb">ACS ACCOUNT · CODENAME</p><h4>${esc(p.name)}</h4><p>${esc(p.industry)} · ${esc(p.area)}</p><p class="pp-m">พิกัดเลื่อนเพื่อปิดตัวตน · ความแม่นเดิม: ${p.conf === 'high' ? 'สูง' : p.conf === 'medium' ? 'กลาง' : 'ต่ำ'}</p>`;
    if (L.startsWith('rfps')) return `<p class="pp-eb">BID DESK · CODENAME</p><h4>${esc(p.name)}</h4><p>${esc(p.product)}</p><p class="pp-m">${esc(p.rec)} · ${esc(p.status)}${p.deadline ? ' · กำหนด ' + fmtDate(p.deadline) : ''}</p>`;
    if (L === 'estates') return `<p class="pp-eb">นิคมอุตสาหกรรม</p><h4>${esc(p.name)}</h4><p>${esc(p.province)}</p>`;
    if (L === 'hq') return `<p class="pp-eb">สำนักงาน</p><h4>${esc(GEO.acs.hq.name)}</h4><p>ปลายทางของทุกเส้นเชื่อมบนลูกโลก</p>`;
    return '';
  }

  function caption(t) { const c = $('#gev-caption'); c.textContent = t || ''; c.classList.toggle('show', !!t); }

  async function tour() {
    if (touring) { touring = false; $('#gev-tour').textContent = '▶ ทัวร์ GEV'; caption(''); return; }
    touring = true; rotating = false; if (popup) popup.remove(); $('#gev-tour').textContent = '■ หยุดทัวร์';
    for (const s of TOUR) {
      if (!touring) return;
      caption(s.t);
      map.flyTo({ ...s.v, duration: 3200, essential: true });
      await new Promise(r => setTimeout(r, 5200));
    }
    touring = false; $('#gev-tour').textContent = '▶ ทัวร์ GEV';
    setTimeout(() => caption(''), 3500);
  }

  function animate() {
    let step = 0, t0 = performance.now();
    const dashes = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(t) {
      if (!map || document.hidden || $('#panel-gev').hidden) { requestAnimationFrame(frame); return; }
      const ph = ((t - t0) % 2000) / 2000;
      if (!reduce) {
        const s = Math.floor((t - t0) / 70) % dashes.length;
        if (s !== step && map.getLayer('arcs')) { step = s; map.setPaintProperty('arcs', 'line-dasharray', dashes[s]); }
        if (map.getLayer('hq-pulse')) { map.setPaintProperty('hq-pulse', 'circle-radius', 10 + ph * 22); map.setPaintProperty('hq-pulse', 'circle-opacity', 0.35 * (1 - ph)); }
        if (map.getLayer('rfps-halo')) { map.setPaintProperty('rfps-halo', 'circle-radius', 8 + ph * 14); map.setPaintProperty('rfps-halo', 'circle-opacity', 0.3 * (1 - ph)); }
        if (rotating && !touring && !userBusy && performance.now() - lastInteract > 4000 && map.getZoom() < 3) {
          const c = map.getCenter(); c.lng -= 0.06; map.jumpTo({ center: c });
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initMap() {
    const narrow = window.innerWidth < 700;
    map = new maplibregl.Map({ container: 'gev-map', style: style(), center: [100, 15], zoom: narrow ? 1.25 : 1.9, attributionControl: { compact: true }, maxPitch: 70 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.scrollZoom.setWheelZoomRate(1 / 300);
    window.__gevMap = map;
    ['mousedown', 'touchstart', 'wheel'].forEach(e => map.getCanvasContainer().addEventListener(e, () => { lastInteract = performance.now(); }, { passive: true }));
    map.on('dragstart', () => { userBusy = true; }); map.on('dragend', () => { userBusy = false; lastInteract = performance.now(); });
    map.on('load', () => {
      const d = buildData();
      addLayers(d); map.__gevReady = true;
      Object.keys(layerState).forEach(applyLayer);
      popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'gev-pop' });
      // Screen-space picking (more reliable than layer queries on the globe projection)
      const groups = [
        { key: 'rfps', layer: 'rfps', feats: d.rfpFeatures, minz: 4, r: 12 },
        { key: 'hq', layer: 'hq', feats: [pt(GEO.acs.hq.lon, GEO.acs.hq.lat, {})], minz: 0, r: 12, always: true },
        { key: 'brands', layer: 'brands', feats: d.brandFeatures, minz: 0, r: 12 },
        { key: 'news', layer: 'news', feats: d.newsFeatures, minz: 0, r: 14 },
        { key: 'acs', layer: 'targets', feats: d.acsFeatures, minz: 4, r: 9 },
        { key: 'estates', layer: 'estates', feats: d.estateFeatures, minz: 0, r: 8 },
      ];
      const rad = Math.PI / 180;
      const facing = (c) => { const m = map.getCenter(); const a = Math.sin(c[1] * rad) * Math.sin(m.lat * rad) + Math.cos(c[1] * rad) * Math.cos(m.lat * rad) * Math.cos((c[0] - m.lng) * rad); return a > 0.15; };
      function pick(pnt) {
        const z = map.getZoom(); let best = null;
        for (const g of groups) {
          if (!g.always && !layerState[g.key]) continue;
          if (z < g.minz) continue;
          for (const f of g.feats) {
            const c = f.geometry.coordinates; if (z < 4 && !facing(c)) continue;
            const q = map.project(c); const dd = Math.hypot(q.x - pnt.x, q.y - pnt.y);
            if (dd <= g.r && (!best || dd < best.dd - 2)) best = { dd, f: { ...f, layer: { id: g.layer } } };
          }
          if (best) break;
        }
        return best && best.f;
      }
      window.__gevPick = pick;
      map.on('click', (e) => { lastInteract = performance.now(); const f = pick(e.point); if (f) popup.setLngLat(f.geometry.coordinates).setHTML(popupHtml(f)).addTo(map); });
      map.on('mousemove', (e) => { map.getCanvas().style.cursor = pick(e.point) ? 'pointer' : ''; });
      $('#gev-stage').classList.add('ready');
      animate();
    });
  }

  function wire() {
    document.querySelectorAll('[data-fly]').forEach(b => b.addEventListener('click', () => {
      touring = false; $('#gev-tour').textContent = '▶ ทัวร์ GEV'; if (popup) popup.remove();
      lastInteract = performance.now(); rotating = b.dataset.fly === 'world';
      map.flyTo({ ...VIEWS[b.dataset.fly], duration: 2600, essential: true });
      caption(b.dataset.fly === 'th' ? 'ไทย: ACS กับเป้าหมาย 56 ราย (สีตามอุตสาหกรรม) และ RFP 4 รายการ (สีแดง)' : '');
    }));
    $('#gev-tour').addEventListener('click', tour);
    document.querySelectorAll('#gev-layers .chip').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.layer; layerState[k] = !layerState[k];
      b.classList.toggle('on', layerState[k]); b.setAttribute('aria-pressed', String(layerState[k]));
      if (map && map.__gevReady) applyLayer(k);
    }));
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab === 'gev' && map) setTimeout(() => map.resize(), 30); }));
  }

  async function init() {
    try {
      const [g, i] = await Promise.all([fetch('data/gev.json').then(r => r.json()), fetch('data/intel.json').then(r => r.json())]);
      GEO = g; INTEL = i;
      const d = buildData();
      renderStats(d); renderTicker(); renderBelow(); wire();
      if (window.maplibregl) initMap();
      else $('#gev-map').innerHTML = '<p class="gev-err">โหลดแผนที่ไม่สำเร็จ ลองรีเฟรชหน้า</p>';
    } catch (e) {
      console.error(e);
      $('#gev-stats').innerHTML = '<p class="gev-err">โหลดข้อมูล GEV ไม่สำเร็จ</p>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
