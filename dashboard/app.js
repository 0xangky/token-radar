// Token Radar's page: reads window.RADAR, written beside dashboard/ by main.ts, and renders the
// ranked pre-token board, the live-token benchmarks, a per-protocol detail view and the model sheet.
// Every byte it shows is in data.js; there is no fetch, no import and no network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { tab: 'pre', q: '', category: 'all', chain: 'all', sort: 'implied', watch: false, slug: null };
  var totals = { maxImplied: 1, maxMcap: 1, mcapRank: {} };

  var board = document.getElementById('board');
  var live = document.getElementById('live');
  var head = document.getElementById('table-head');
  var empty = document.getElementById('empty');
  var detail = document.getElementById('detail');
  var scrim = document.getElementById('scrim');
  var sheet = document.getElementById('model-sheet');
  var count = document.getElementById('count');
  var q = document.getElementById('q');
  var category = document.getElementById('category');
  var chain = document.getElementById('chain');
  var sort = document.getElementById('sort');
  var watch = document.getElementById('watch');

  var fullUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n, signed) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var body = Math.abs(n).toFixed(1) + '%';
    if (signed === false) return body;
    return (n > 0 ? '+' : n < 0 ? '−' : '') + body;
  }

  function ageLabel(days, known) {
    var unit = days >= 730 ? (days / 365).toFixed(1) + ' years' : days >= 365 ? (days / 365).toFixed(1) + ' years' : days + ' days';
    return known ? unit : unit + ' (median)';
  }

  function median(values) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function each(list, make) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) frag.appendChild(make(list[i], i));
    return frag;
  }

  // ---------------------------------------------------------------- header and summary

  document.getElementById('asof').textContent = 'snapshot ' + DATA.as_of;
  document.getElementById('source').textContent = DATA.source.split(' http')[0] + ' · sealed snapshot';
  document.getElementById('foot-source').textContent = 'source: ' + DATA.source;

  (function summary() {
    var values = DATA.rows.map(function (r) { return r.implied_value_usd; });
    var top = DATA.rows[0];
    var stats = [
      { label: 'Pre-token protocols ranked', value: '<em>' + DATA.board_size + '</em>', sub: 'every one records no token in the snapshot' },
      { label: 'Watchlist covered', value: DATA.watchlist_covered + ' / ' + DATA.watchlist_size, sub: 'the house floor, every slug scored' },
      { label: 'Median implied FDV', value: usd(median(values)), sub: 'across the whole ranked board' },
      { label: 'Highest implied FDV', value: usd(top.implied_value_usd), sub: top.name + ' · rank 1' },
    ];
    document.getElementById('stats').appendChild(
      each(stats, function (s) {
        var el = document.createElement('div');
        el.className = 'stat';
        el.innerHTML =
          '<p class="stat-label">' + s.label + '</p>' +
          '<p class="stat-value">' + s.value + '</p>' +
          '<p class="stat-sub">' + esc(s.sub) + '</p>';
        return el;
      })
    );
  })();

  // ---------------------------------------------------------------- filters

  (function fillFilters() {
    var categories = {};
    DATA.rows.forEach(function (r) {
      if (r.category) categories[r.category] = (categories[r.category] || 0) + 1;
    });
    var cats = Object.keys(categories).sort(function (a, b) { return categories[b] - categories[a] || a.localeCompare(b); });
    var catOptions = ['<option value="all">All categories</option>'].concat(
      cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + ' (' + categories[c] + ')</option>'; })
    );
    category.innerHTML = catOptions.join('');

    var chains = {};
    DATA.rows.forEach(function (r) {
      r.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var names = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a] || a.localeCompare(b); });
    chain.innerHTML =
      '<option value="all">All chains</option>' +
      names.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + ' (' + chains[c] + ')</option>'; }).join('');

    DATA.rows.forEach(function (r) {
      if (r.implied_value_usd > totals.maxImplied) totals.maxImplied = r.implied_value_usd;
    });
    DATA.live.forEach(function (r, i) {
      totals.mcapRank[r.slug] = i + 1;
      if (r.mcap_usd > totals.maxMcap) totals.maxMcap = r.mcap_usd;
    });
  })();

  (function fillConstants() {
    var m = DATA.model;
    var chips = [
      'growth weight <b>' + m.growth_weight.toFixed(2) + '</b>',
      'growth clamp <b>' + m.growth_floor + '% to +' + m.growth_cap + '%</b>',
      'maturity floor <b>' + m.maturity_floor.toFixed(2) + '</b>',
      'maturity range <b>' + m.maturity_range.toFixed(2) + '</b>',
      'maturity cap <b>' + m.maturity_cap_days + ' days</b>',
      'benchmark clamp <b>' + m.min_benchmark.toFixed(2) + '× to ' + m.max_benchmark.toFixed(2) + '×</b>',
      'category peers needed <b>' + m.min_category_peers + '</b>',
      'model version <b>' + DATA.model_version + '</b>',
    ];
    document.getElementById('constants').innerHTML = chips.map(function (c) { return '<span>' + c + '</span>'; }).join('');
  })();

  // ---------------------------------------------------------------- table heads

  var PRE_HEAD =
    '<span class="c-rank">#</span><span class="c-name">Protocol</span><span class="c-cat">Category</span>' +
    '<span class="c-num">TVL</span><span class="c-num">7d</span><span class="c-num">Implied FDV</span>' +
    '<span class="c-num">Benchmark</span><span class="c-bar">Signal</span>';

  var LIVE_HEAD =
    '<span class="c-rank">#</span><span class="c-name">Live protocol</span><span class="c-cat">Category</span>' +
    '<span class="c-num">TVL</span><span class="c-num">7d</span><span class="c-num">Market cap</span>' +
    '<span class="c-num">Mcap ÷ TVL</span><span class="c-bar">Scale</span>';

  // ---------------------------------------------------------------- rows

  function preRows() {
    var rows = DATA.rows.slice();
    if (state.watch) rows = rows.filter(function (r) { return r.on_watchlist; });
    if (state.category !== 'all') rows = rows.filter(function (r) { return r.category === state.category; });
    if (state.chain !== 'all') rows = rows.filter(function (r) { return r.chains.indexOf(state.chain) >= 0; });
    var needle = state.q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(function (r) {
        return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(needle) >= 0;
      });
    }
    if (state.sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; });
    else if (state.sort === 'growth') rows.sort(function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d) || a.rank - b.rank; });
    else if (state.sort === 'age') rows.sort(function (a, b) { return b.age_days - a.age_days || a.rank - b.rank; });
    else if (state.sort === 'name') rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }

  function liveRows() {
    var rows = DATA.live.slice();
    if (state.category !== 'all') rows = rows.filter(function (r) { return r.category === state.category; });
    if (state.chain !== 'all') rows = rows.filter(function (r) { return r.chains.indexOf(state.chain) >= 0; });
    var needle = state.q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(function (r) {
        return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(needle) >= 0;
      });
    }
    if (state.sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === 'growth') rows.sort(function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); });
    else if (state.sort === 'name') rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else rows.sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    return rows;
  }

  function preRow(row) {
    var el = document.createElement('div');
    el.className = 'row' + (state.slug === row.slug ? ' is-open' : '');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('data-slug', row.slug);
    var growthClass = row.change_7d === null ? ' muted' : row.change_7d > 0 ? ' up' : row.change_7d < 0 ? ' down' : '';
    var width = Math.max(1.5, (row.implied_value_usd / totals.maxImplied) * 100);
    el.innerHTML =
      '<span class="rank">' + String(row.rank).padStart(3, '0') + '</span>' +
      '<span class="cell-name"><span class="name">' + (row.on_watchlist ? '<span class="watch-dot" title="on the house watchlist"></span>' : '') + esc(row.name) + '</span>' +
      '<span class="sub">' + esc(row.chains.join(' · ') || 'chain not recorded') + ' · ' + (row.listed_at ? 'tracked since ' + row.listed_at : 'listing date unknown') + '</span></span>' +
      '<span><span class="chip">' + esc(row.category || 'Uncategorised') + '</span></span>' +
      '<span class="num muted">' + usd(row.tvl_usd) + '</span>' +
      '<span class="num' + growthClass + '">' + pct(row.change_7d) + '</span>' +
      '<span class="num implied">' + usd(row.implied_value_usd) + '</span>' +
      '<span class="num bench">' + row.model.benchmark_multiple.toFixed(3) + '× TVL</span>' +
      '<span class="bar"><i style="width:' + width.toFixed(1) + '%"></i></span>';
    return el;
  }

  function liveRow(row) {
    var el = document.createElement('div');
    el.className = 'row';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('data-live', row.slug);
    var growthClass = row.change_7d === null ? ' muted' : row.change_7d > 0 ? ' up' : row.change_7d < 0 ? ' down' : '';
    var width = Math.max(1.5, (row.mcap_usd / totals.maxMcap) * 100);
    el.innerHTML =
      '<span class="rank">' + String(totals.mcapRank[row.slug] || 0).padStart(3, '0') + '</span>' +
      '<span class="cell-name"><span class="name">' + esc(row.name) + '</span>' +
      '<span class="sub">' + esc(row.chains.join(' · ') || 'chain not recorded') + ' · token trades</span></span>' +
      '<span><span class="chip">' + esc(row.category || 'Uncategorised') + '</span></span>' +
      '<span class="num muted">' + usd(row.tvl_usd) + '</span>' +
      '<span class="num' + growthClass + '">' + pct(row.change_7d) + '</span>' +
      '<span class="num implied">' + usd(row.mcap_usd) + '</span>' +
      '<span class="num bench">' + row.multiple.toFixed(2) + '×</span>' +
      '<span class="bar"><i style="width:' + width.toFixed(1) + '%"></i></span>';
    return el;
  }

  function note(text) {
    var el = document.createElement('div');
    el.className = 'live-note';
    el.innerHTML = text;
    return el;
  }

  function render() {
    var isPre = state.tab === 'pre';
    head.innerHTML = isPre ? PRE_HEAD : LIVE_HEAD;
    board.hidden = !isPre;
    live.hidden = isPre;
    var rows = isPre ? preRows() : liveRows();
    var target = isPre ? board : live;
    while (target.firstChild) target.removeChild(target.firstChild);
    if (!isPre) {
      target.appendChild(
        note('<b>' + DATA.live_size + ' live-token protocols</b> are set aside from the ranked board. Their market cap divided by TVL is the benchmark the model applies to the category; a protocol whose token already trades has a market value of its own, so it is never given an implied one.')
      );
    }
    target.appendChild(each(rows, isPre ? preRow : liveRow));
    empty.hidden = rows.length > 0;
    empty.textContent = isPre
      ? 'No pre-token protocol matches those filters. Clear the search or pick another category.'
      : 'No live-token protocol matches those filters.';
    var shown = rows.length === (isPre ? DATA.board_size : DATA.live_size) ? '<b>' + rows.length + '</b>' : '<b>' + rows.length + '</b> of ' + (isPre ? DATA.board_size : DATA.live_size);
    count.innerHTML = isPre
      ? shown + ' pre-token protocols · ' + DATA.watchlist_covered + ' of ' + DATA.watchlist_size + ' watchlist slugs covered'
      : shown + ' live-token benchmarks · these set the category multiples';
    watch.disabled = !isPre;
    sort.disabled = false;
  }

  // ---------------------------------------------------------------- detail

  function modelTable(row) {
    var m = row.model;
    var benchName = m.benchmark_category ? esc(m.benchmark_category) + ' category median' : 'whole-market median';
    return (
      '<table class="model-table">' +
      '<tr><td>TVL in the snapshot</td><td>' + fullUsd.format(row.tvl_usd) + '<span class="why">sealed input, as of ' + DATA.as_of + '</span></td></tr>' +
      '<tr><td>Benchmark multiple</td><td>' + m.benchmark_multiple.toFixed(3) + '×<span class="why">' + benchName + ' from ' + m.benchmark_peers + ' live peers</span></td></tr>' +
      '<tr><td>Growth multiplier</td><td>' + m.growth_multiplier.toFixed(3) + '×<span class="why">7d TVL ' + pct(m.growth_pct) + ', clamped to ' + DATA.model.growth_floor + '%…+' + DATA.model.growth_cap + '%</span></td></tr>' +
      '<tr><td>Maturity multiplier</td><td>' + m.maturity_multiplier.toFixed(3) + '×<span class="why">' + ageLabel(row.age_days, row.age_known) + ' with no token recorded</span></td></tr>' +
      '<tr class="total"><td>Implied fully diluted value</td><td>' + fullUsd.format(row.implied_value_usd) + '</td></tr>' +
      '</table>' +
      '<p class="peer-note">Live peers closest to the median multiple:</p>' +
      '<ul class="peers">' +
      m.benchmark_examples
        .map(function (p) { return '<li>' + esc(p.name) + ' <b>' + p.multiple.toFixed(2) + '×</b></li>'; })
        .join('') +
      '</ul>'
    );
  }

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) row = DATA.rows[i];
    if (!row) return;
    state.slug = slug;
    document.getElementById('detail-rank').textContent = 'Rank ' + row.rank + ' of ' + DATA.board_size;
    var badges =
      (row.on_watchlist
        ? '<span class="badge watch">on the house watchlist</span>'
        : '<span class="badge early">found outside the watchlist</span>') +
      '<span class="badge scarce">records no token</span>' +
      '<span class="badge">' + (row.tvl_usd >= DATA.floor_usd ? 'above' : 'below') + ' the ' + usd(DATA.floor_usd) + ' floor</span>';
    document.getElementById('detail-body').innerHTML =
      '<h2 class="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="detail-meta">' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(' · ') || 'chain not recorded') + ' · ' + (row.listed_at ? 'tracked since ' + row.listed_at : 'listing date not recorded') + '</p>' +
      '<div class="badge-row">' + badges + '</div>' +
      '<div class="implied-box"><p class="implied-label">implied fully diluted value</p><p class="implied-value">' + fullUsd.format(row.implied_value_usd) + '</p>' +
      '<p class="implied-sub">' + row.model.benchmark_multiple.toFixed(3) + '× TVL · model ' + DATA.model_version + ' · a model output, not a forecast</p></div>' +
      '<div class="block"><h3>The three inputs</h3>' + modelTable(row) + '</div>' +
      '<div class="block"><h3>Farm plan, with costs and times</h3><ol class="plan">' +
      row.farm_plan
        .map(function (s) {
          return '<li><p>' + esc(s.action) + '</p><div class="cost"><span>cost</span>' + esc(s.cost) + '<span>time</span>' + esc(s.time) + '</div></li>';
        })
        .join('') +
      '</ol></div>' +
      '<p class="disclaimer">The snapshot records no token for this protocol; that is not proof none exists. Do your own checking before spending anything, and treat the implied value as the model\'s arithmetic, not a price target.</p>';
    detail.hidden = false;
    scrim.hidden = false;
    detail.scrollTop = 0;
    var open = board.querySelector('.row.is-open');
    if (open) open.classList.remove('is-open');
    var fresh = board.querySelector('[data-slug="' + slug + '"]');
    if (fresh) fresh.classList.add('is-open');
  }

  function openLive(slug) {
    var row = null;
    for (var i = 0; i < DATA.live.length; i++) if (DATA.live[i].slug === slug) row = DATA.live[i];
    if (!row) return;
    document.getElementById('detail-rank').textContent = 'Live benchmark · position ' + totals.mcapRank[row.slug];
    document.getElementById('detail-body').innerHTML =
      '<h2 class="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="detail-meta">' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(' · ') || 'chain not recorded') + '</p>' +
      '<div class="badge-row"><span class="badge scarce">token already trades</span><span class="badge">not rankable</span></div>' +
      '<div class="implied-box"><p class="implied-label">market capitalisation</p><p class="implied-value">' + fullUsd.format(row.mcap_usd) + '</p>' +
      '<p class="implied-sub">the market\'s own value · sets the benchmark, never ranked on the board</p></div>' +
      '<div class="block"><h3>Benchmark arithmetic</h3><table class="model-table">' +
      '<tr><td>TVL in the snapshot</td><td>' + fullUsd.format(row.tvl_usd) + '</td></tr>' +
      '<tr><td>Market cap</td><td>' + fullUsd.format(row.mcap_usd) + '</td></tr>' +
      '<tr><td>Market cap ÷ TVL</td><td>' + row.multiple.toFixed(3) + '×</td></tr>' +
      '<tr><td>7-day TVL change</td><td>' + pct(row.change_7d) + '</td></tr></table></div>' +
      '<p class="disclaimer">This protocol is shown so the board\'s multiple is auditable: its own market cap divided by its own TVL is one of the observations behind the ' + esc(row.category || 'whole-market') + ' benchmark.</p>';
    detail.hidden = false;
    scrim.hidden = false;
    detail.scrollTop = 0;
  }

  function closeDetail() {
    detail.hidden = true;
    if (sheet.hidden) scrim.hidden = true;
    var open = board.querySelector('.row.is-open');
    if (open) open.classList.remove('is-open');
    state.slug = null;
  }

  function openSheet() {
    sheet.hidden = false;
    scrim.hidden = false;
  }

  function closeSheet() {
    sheet.hidden = true;
    if (detail.hidden) scrim.hidden = true;
  }

  // ---------------------------------------------------------------- wiring

  function setTab(tab) {
    state.tab = tab;
    document.getElementById('tab-pre').classList.toggle('is-active', tab === 'pre');
    document.getElementById('tab-live').classList.toggle('is-active', tab === 'live');
    document.getElementById('tab-pre').setAttribute('aria-selected', String(tab === 'pre'));
    document.getElementById('tab-live').setAttribute('aria-selected', String(tab === 'live'));
    closeDetail();
    render();
  }

  document.getElementById('tab-pre').addEventListener('click', function () { setTab('pre'); });
  document.getElementById('tab-live').addEventListener('click', function () { setTab('live'); });
  document.getElementById('live-link').addEventListener('click', function () { setTab('live'); });
  document.getElementById('model-btn').addEventListener('click', openSheet);
  document.getElementById('model-close').addEventListener('click', closeSheet);
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  scrim.addEventListener('click', function () { closeDetail(); closeSheet(); });

  q.addEventListener('input', function () { state.q = q.value; render(); });
  category.addEventListener('change', function () { state.category = category.value; render(); });
  chain.addEventListener('change', function () { state.chain = chain.value; render(); });
  sort.addEventListener('change', function () { state.sort = sort.value; render(); });
  watch.addEventListener('change', function () { state.watch = watch.checked; render(); });

  board.addEventListener('click', function (event) {
    var el = event.target.closest('[data-slug]');
    if (el) openDetail(el.getAttribute('data-slug'));
  });
  live.addEventListener('click', function (event) {
    var el = event.target.closest('[data-live]');
    if (el) openLive(el.getAttribute('data-live'));
  });
  [board, live].forEach(function (container) {
    container.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var el = event.target.closest('[data-slug], [data-live]');
      if (!el) return;
      event.preventDefault();
      if (el.hasAttribute('data-slug')) openDetail(el.getAttribute('data-slug'));
      else openLive(el.getAttribute('data-live'));
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeDetail(); closeSheet(); }
    if (event.key === '/' && document.activeElement !== q && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      q.focus();
    }
  });

  render();
})();
