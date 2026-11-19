/* Polaris — shared helpers. Needs window.FRUIT_DATA (data.js) and window.KMAP (map.js). */
(function () {
  const D = window.FRUIT_DATA, Y = D.years;
  const MY = [1985, 1995, 2005, 2015, 2025, 2035, 2045, 2060];   // index >=5 : trend extrapolation
  const CROPS = ["사과", "배", "복숭아", "포도", "감귤", "감"].filter(c => D.crops.includes(c));
  const PAL = ["#9BE7FF", "#4C9DB5", "#F2C46D", "#C9C8C2", "#E68F7A", "#8FD18A", "#B79CE8", "#6B7C82", "#F29BC1", "#7AA2F7"];
  const NAV = [["index.html", "홈"], ["trend.html", "변화 추이"], ["map.html", "지도·예측"], ["analysis.html", "분석"], ["about.html", "자료·방법"]];

  const short = r => r.replace("특별자치도", "").replace("특별자치시", "").replace("광역시", "").replace("특별시", "")
    .replace(/(경상|충청|전라)(남|북)도/, (m, a, b) => a[0] + b).replace("도", "");
  const nf = n => n == null ? "–" : Math.round(n).toLocaleString("ko-KR");
  const ser = c => D.area[c];
  const totals = c => Y.map((_, i) => D.regions.reduce((s, r) => s + (ser(c)[r][i] || 0), 0));

  function getCrop() {
    let c = new URLSearchParams(location.search).get("crop");
    if (!c) { try { c = localStorage.getItem("pl_crop"); } catch (e) {} }
    return CROPS.includes(c) ? c : CROPS[0];
  }
  function setCrop(c) { try { localStorage.setItem("pl_crop", c); } catch (e) {} }
  function chips(el, cur, cb) {
    el.innerHTML = "";
    CROPS.forEach(c => {
      const b = document.createElement("button");
      b.className = "chip" + (c === cur ? " on" : ""); b.textContent = c; b.type = "button";
      b.setAttribute("aria-pressed", c === cur);
      b.onclick = () => { setCrop(c); chips(el, c, cb); cb(c); };
      el.appendChild(b);
    });
  }

  /* share(%) per region and per MY index; 2035+ = linear trend of last 4 points, renormalised */
  function shares(c) {
    const s = ser(c), T = totals(c), out = {};
    D.regions.forEach(r => {
      const xs = [], ys = [];
      Y.forEach((y, i) => { if (s[r][i] != null && T[i]) { xs.push(y); ys.push(s[r][i] / T[i] * 100); } });
      const n = xs.length, last = n ? ys[n - 1] : 0; let sl = 0;
      if (n >= 2) {
        const k = Math.min(n, 4), x = xs.slice(-k), v = ys.slice(-k), mx = x.reduce((a, b) => a + b) / k, my = v.reduce((a, b) => a + b) / k;
        sl = x.reduce((a, q, i) => a + (q - mx) * (v[i] - my), 0) / x.reduce((a, q) => a + (q - mx) ** 2, 0);
      }
      out[r] = MY.map((y, i) => i < 5 ? (s[r][i] != null && T[i] ? s[r][i] / T[i] * 100 : null) : Math.max(0, last + sl * (y - 2025)));
    });
    for (let i = 5; i < MY.length; i++) {
      const sm = D.regions.reduce((a, r) => a + out[r][i], 0) || 1;
      D.regions.forEach(r => out[r][i] = out[r][i] / sm * 100);
    }
    return out;
  }

  /* choropleth */
  function drawMap(svg, crop, i, opt) {
    opt = opt || {};
    const S = shares(crop), vals = D.regions.map(r => S[r][i] || 0), mx = Math.max.apply(null, vals.concat([1]));
    const col = v => { const t = Math.sqrt(v / mx), a = [22, 38, 44], b = [155, 231, 255]; return "rgb(" + a.map((x, j) => Math.round(x + (b[j] - x) * t)).join(",") + ")"; };
    if (!svg.children.length) {
      svg.innerHTML = D.regions.filter(r => KMAP.p[r]).map(r => '<path data-r="' + r + '" d="' + KMAP.p[r] + '"><title>' + short(r) + '</title></path>').join("");
      if (opt.onPick) svg.querySelectorAll("path").forEach(p => { p.onmouseenter = () => opt.onPick(p.dataset.r); p.onclick = () => opt.onPick(p.dataset.r); });
    }
    svg.querySelectorAll("path").forEach(p => {
      const v = S[p.dataset.r][i]; p.style.fill = v == null ? "#1a1c1f" : col(v); p.classList.toggle("sel", p.dataset.r === opt.sel);
    });
    return { S, mx };
  }

  /* chart defaults */
  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = "#A3A39E"; Chart.defaults.borderColor = "#2A2C30";
    Chart.defaults.font.family = "'Noto Sans KR','Space Grotesk'";
  }
  const charts = {};
  function mk(id, cfg) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), cfg); }
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12 } } } };

  /* header / footer */
  function shell(active) {
    const logo = '<a class="logo pl" href="index.html"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><polygon points="12,0 15,9 24,12 15,15 12,24 9,15 0,12 9,9" fill="#9BE7FF"/></svg>Polaris</a>';
    const links = NAV.map(n => '<a href="' + n[0] + '"' + (n[0] === active ? ' class="on" aria-current="page"' : "") + ">" + n[1] + "</a>").join("");
    const h = document.getElementById("hdr");
    if (h) {
      h.className = "hdr";
      h.innerHTML = '<div class="wrap">' + logo + '<nav class="nav" id="nav" aria-label="주 메뉴">' + links + '</nav><button class="mbtn" id="mbtn" aria-label="메뉴 열기" aria-expanded="false">≡</button></div>';
      const b = document.getElementById("mbtn"), n = document.getElementById("nav");
      b.onclick = () => { const o = n.classList.toggle("open"); b.setAttribute("aria-expanded", o); };
    }
    const f = document.getElementById("ftr");
    if (f) {
      f.className = "ftr";
      f.innerHTML = '<div class="wrap"><div><span class="pl" style="font-size:26px;color:#F2F0EA">Polaris</span><p style="margin:6px 0 0">기후 변화와 과수 재배지의 이동을 데이터로 보여주는 사이트.<br>백석대학교 빅데이터학과 데이터시각화 과제</p></div>' +
        '<div><b>페이지</b>' + NAV.map(n => '<a href="' + n[0] + '">' + n[1] + "</a>").join("") + '</div>' +
        '<div><b>자료</b><span>KOSIS 농작물생산조사</span><br><span>공공데이터포털 과수재배변동정보 (연결 예정)</span><br><a href="https://github.com/hawon040/data_seegag">GitHub 저장소</a></div></div>';
    }
  }
  window.PL = { D, Y, MY, CROPS, PAL, NAV, short, nf, ser, totals, getCrop, setCrop, chips, shares, drawMap, chartDefaults, mk, base, shell };
})();
