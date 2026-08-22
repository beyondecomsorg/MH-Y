/**
 * MF — Mobile Filter & Sort UI
 * Scope: Mobile ONLY (max-width: 767px)
 * Vanilla JS · No dependencies · No jQuery
 *
 * Architecture:
 *  - Reads filter + sort data from an embedded JSON <script> tag
 *  - Builds entire UI in JavaScript
 *  - Applies filters by constructing Shopify-compatible URL params
 *  - AJAX-compatible: calls theme.CollectionFilters.renderPage if available
 */

(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  var S = {
    filters: [],            // parsed filter groups from Liquid JSON
    sortOptions: [],        // parsed sort options from Liquid JSON
    collectionUrl: '/',     // base collection URL for clearing
    activeGroupIdx: 0,      // which left-panel group is highlighted
    selected: {},           // { paramName: Set<value> }
    priceMin: '',
    priceMax: '',
    priceMinParam: '',
    priceMaxParam: '',
    currentSort: ''
  };

  /* ============================================================
     ELEMENT CACHE
     ============================================================ */
  var E = {};

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    // Only activate on mobile viewports
    if (window.innerWidth > 767) return;

    var dataEl = document.getElementById('mf-data');
    if (!dataEl) return;

    var parsed;
    try { parsed = JSON.parse(dataEl.textContent); }
    catch (err) { return; }

    S.filters = parsed.filters || [];
    S.sortOptions = parsed.sortOptions || [];
    S.collectionUrl = parsed.collectionUrl || window.location.pathname;
    S.currentSort = getParam('sort_by');

    // Pre-populate selected state from current URL
    seedSelectedFromURL();

    // Cache DOM
    E.toolbar      = document.getElementById('mf-toolbar');
    E.overlay      = document.getElementById('mf-overlay');
    E.filterDrawer = document.getElementById('mf-filter-drawer');
    E.sortDrawer   = document.getElementById('mf-sort-drawer');
    E.groupsPane   = document.getElementById('mf-groups');
    E.valuesPane   = document.getElementById('mf-values');
    E.sortList     = document.getElementById('mf-sort-list');
    E.filterBadge  = document.getElementById('mf-toolbar-badge');

    if (!E.toolbar) return;

    // Move components to body root to bypass container transform / stacking context issues
    document.body.appendChild(E.toolbar);
    document.body.appendChild(E.overlay);
    document.body.appendChild(E.filterDrawer);
    document.body.appendChild(E.sortDrawer);

    // Build panels
    renderGroups();
    renderSortList();
    syncGroupActive(0);
    renderValues(0);
    syncBadge();
    bindEvents();
  }

  /* ============================================================
     URL UTILITIES
     ============================================================ */
  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key) || '';
  }

  function seedSelectedFromURL() {
    var params = new URLSearchParams(window.location.search);

    S.filters.forEach(function (f) {
      if (f.type === 'price_range') {
        S.priceMinParam = f.minParamName || 'filter.v.price.gte';
        S.priceMaxParam = f.maxParamName || 'filter.v.price.lte';
        S.priceMin = params.get(S.priceMinParam) || '';
        S.priceMax = params.get(S.priceMaxParam) || '';
        return;
      }
      (f.values || []).forEach(function (v) {
        if (v.active) {
          if (!S.selected[v.paramName]) S.selected[v.paramName] = [];
          if (S.selected[v.paramName].indexOf(v.value) === -1) {
            S.selected[v.paramName].push(v.value);
          }
        }
      });
    });
  }

  /* ============================================================
     RENDER — LEFT PANEL (filter groups)
     ============================================================ */
  function renderGroups() {
    E.groupsPane.innerHTML = '';
    S.filters.forEach(function (f, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mf-filter__group-btn';
      btn.dataset.idx = i;

      var label = document.createTextNode(f.label);
      btn.appendChild(label);

      var count = activeCountFor(f);
      if (count > 0) {
        var badge = document.createElement('span');
        badge.className = 'mf-group-badge';
        badge.textContent = count;
        btn.appendChild(badge);
      }

      btn.addEventListener('click', function () {
        syncGroupActive(i);
        renderValues(i);
      });

      E.groupsPane.appendChild(btn);
    });
  }

  function syncGroupActive(idx) {
    S.activeGroupIdx = idx;
    var btns = E.groupsPane.querySelectorAll('.mf-filter__group-btn');
    btns.forEach(function (b, i) {
      b.classList.toggle('mf-is-active', i === idx);
    });
  }

  function refreshGroupBadge(idx) {
    var btns = E.groupsPane.querySelectorAll('.mf-filter__group-btn');
    var btn = btns[idx];
    if (!btn) return;
    var old = btn.querySelector('.mf-group-badge');
    if (old) old.remove();
    var count = activeCountFor(S.filters[idx]);
    if (count > 0) {
      var badge = document.createElement('span');
      badge.className = 'mf-group-badge';
      badge.textContent = count;
      btn.appendChild(badge);
    }
  }

  function activeCountFor(f) {
    if (!f) return 0;
    if (f.type === 'price_range') return (S.priceMin || S.priceMax) ? 1 : 0;
    var count = 0;
    (f.values || []).forEach(function (v) {
      var sel = S.selected[v.paramName];
      if (sel && sel.indexOf(v.value) !== -1) count++;
    });
    return count;
  }

  /* ============================================================
     RENDER — RIGHT PANEL (filter values)
     ============================================================ */
  function renderValues(idx) {
    E.valuesPane.innerHTML = '';
    var f = S.filters[idx];
    if (!f) return;

    if (f.type === 'price_range') {
      renderPriceRange(f);
      return;
    }

    var vals = f.values || [];
    if (!vals.length) {
      var emp = document.createElement('p');
      emp.className = 'mf-filter__empty';
      emp.textContent = 'No options available';
      E.valuesPane.appendChild(emp);
      return;
    }

    vals.forEach(function (v) {
      var isChecked = isSelected(v);
      var isDisabled = v.count === 0 && !isChecked;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mf-filter__value-btn' +
        (isChecked ? ' mf-is-checked' : '') +
        (isDisabled ? ' mf-is-disabled' : '');

      var box = document.createElement('span');
      box.className = 'mf-checkbox';

      var lbl = document.createElement('span');
      lbl.className = 'mf-value-label';
      lbl.textContent = v.label;

      var cnt = document.createElement('span');
      cnt.className = 'mf-value-count';
      cnt.textContent = '(' + v.count + ')';

      btn.appendChild(box);

      var isColorGroup = v.paramName && (v.paramName.toLowerCase().indexOf('color') !== -1 || v.paramName.toLowerCase().indexOf('colour') !== -1);
      if (isColorGroup) {
        function normalizeName(name) {
          if (!name) return '';
          return name.toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '')
            .replace(/[-_]/g, '');
        }

        // Built-in color map — same as desktop
        var MHY_MOBILE_COLORS = {
          'ashgrey':'#B2BEB5','balsamgreen':'#5F8B6A','beige':'#E8D8B7',
          'black':'#000000','blue':'#0057B7','bluegrey':'#6E7F8D',
          'bordeaux':'#4A0020','brown':'#6B3A2A','camel':'#C19A6B',
          'cedar':'#9E4B2A','charcoal':'#36454F','charcoalgrey':'#4A4A4A',
          'chestnut':'#954535','darkblue':'#00008B','darkgrey':'#A9A9A9',
          'deepblue':'#003A70','ecru':'#F5F0E1','eggplant':'#614051',
          'fern':'#4F7942','flintstone':'#857C73','gray':'#808080',
          'green':'#2E8B57','grey':'#808080','gunmetal':'#2C3539',
          'highrisegrey':'#A0A0A0','honeybeige':'#D4A96A','iceblue':'#99C5C4',
          'icegrey':'#DCDCDC','khaki':'#C3B091','lavender':'#B57EDC',
          'lightblue':'#ADD8E6','lightgrayishblue':'#B0C4D8','lightgrey':'#D3D3D3',
          'lilac':'#C8A2C8','magnet':'#424B54','maroon':'#800000',
          'mauve':'#E0B0FF','midnightnavy':'#191970','mocha':'#967259',
          'mustard':'#FFDB58','navy':'#000080','offwhite':'#F5F5EF',
          'olive':'#808000','paleyellow':'#FAFAC8','pine':'#2A5C45',
          'pink':'#FFC0CB','powderblue':'#B0E0E6','rosebrown':'#BC8F8F',
          'rust':'#B7410E','sagegreen':'#B2AC88','sand':'#C2B280',
          'shitake':'#8B7355','skyblue':'#87CEEB','slateblue':'#6A5ACD',
          'spruce':'#1D4E38','stonegrey':'#928E85','tan':'#D2B48C',
          'teal':'#008080','terracotta':'#CC4E32','umber':'#635147',
          'walnut':'#7B3F00','white':'#FFFFFF','wine':'#722F37',
          'wood':'#A0522D','yellow':'#FFD700'
        };

        var swatches = Object.assign({}, MHY_MOBILE_COLORS);

        // Override with Theme Customizer blocks if available
        var swatchDataEl = document.getElementById('mhy-color-swatches-data');
        if (swatchDataEl) {
          try {
            var rawSwatches = JSON.parse(swatchDataEl.textContent);
            for (var key in rawSwatches) {
              if (rawSwatches.hasOwnProperty(key)) {
                var nk = normalizeName(key);
                if (nk && rawSwatches[key]) swatches[nk] = rawSwatches[key];
              }
            }
          } catch(e) {}
        }

        var colorName = v.label.trim();
        var normalizedFilter = normalizeName(colorName);
        var finalColor = swatches[normalizedFilter] || '#e0e0e0';

        var swatch = document.createElement('span');
        swatch.className = 'mhy-swatch-circle';
        swatch.style.backgroundColor = finalColor;
        btn.appendChild(swatch);
      }

      btn.appendChild(lbl);
      btn.appendChild(cnt);

      btn.addEventListener('click', function () {
        toggleValue(v, btn, idx);
      });

      E.valuesPane.appendChild(btn);
    });
  }

  function isSelected(v) {
    var sel = S.selected[v.paramName];
    return !!(sel && sel.indexOf(v.value) !== -1);
  }

  function toggleValue(v, btn, groupIdx) {
    var pn = v.paramName;
    if (!S.selected[pn]) S.selected[pn] = [];
    var pos = S.selected[pn].indexOf(v.value);
    if (pos !== -1) {
      S.selected[pn].splice(pos, 1);
      if (!S.selected[pn].length) delete S.selected[pn];
      btn.classList.remove('mf-is-checked');
    } else {
      S.selected[pn].push(v.value);
      btn.classList.add('mf-is-checked');
    }
    refreshGroupBadge(groupIdx);
    syncBadge();
  }

  /* ============================================================
     RENDER — PRICE RANGE
     ============================================================ */
  function renderPriceRange(f) {
    var wrap = document.createElement('div');
    wrap.className = 'mf-price-range';

    var title = document.createElement('span');
    title.className = 'mf-price-range__title';
    title.textContent = 'Price Range';
    wrap.appendChild(title);

    var row = document.createElement('div');
    row.className = 'mf-price-range__row';

    row.appendChild(makePriceField('Min', S.priceMin, function (v) {
      S.priceMin = v;
      syncBadge();
    }));

    var sep = document.createElement('span');
    sep.className = 'mf-price-range__sep';
    sep.textContent = '–';
    row.appendChild(sep);

    row.appendChild(makePriceField('Max', S.priceMax, function (v) {
      S.priceMax = v;
      syncBadge();
    }));

    wrap.appendChild(row);
    E.valuesPane.appendChild(wrap);
  }

  function makePriceField(placeholder, initial, onChange) {
    var field = document.createElement('div');
    field.className = 'mf-price-range__field';

    var sym = document.createElement('span');
    sym.className = 'mf-price-range__symbol';
    sym.textContent = '₹';

    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'mf-price-range__input';
    inp.placeholder = placeholder;
    inp.value = initial;
    inp.min = 0;
    inp.addEventListener('input', function () { onChange(this.value); });

    field.appendChild(sym);
    field.appendChild(inp);
    return field;
  }

  /* ============================================================
     RENDER — SORT LIST
     ============================================================ */
  function renderSortList() {
    E.sortList.innerHTML = '';
    S.sortOptions.forEach(function (opt) {
      var isActive = opt.active && !S.currentSort
        ? true
        : (opt.value === S.currentSort);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mf-sort__option' + (isActive ? ' mf-is-active' : '');

      var name = document.createElement('span');
      name.textContent = opt.name;

      var radio = document.createElement('span');
      radio.className = 'mf-sort__radio';

      btn.appendChild(name);
      btn.appendChild(radio);

      btn.addEventListener('click', function () {
        applySort(opt.value, opt.name);
      });

      E.sortList.appendChild(btn);
    });
  }

  /* ============================================================
     TOOLBAR BADGE
     ============================================================ */
  function syncBadge() {
    if (!E.filterBadge) return;
    var total = 0;
    Object.keys(S.selected).forEach(function (k) { total += S.selected[k].length; });
    if (S.priceMin || S.priceMax) total++;
    E.filterBadge.textContent = total;
    E.filterBadge.style.display = total > 0 ? 'inline-flex' : 'none';
  }

  /* ============================================================
     APPLY / CLEAR FILTERS
     ============================================================ */
  function applyFilters() {
    var params = new URLSearchParams();

    // List / boolean filters
    Object.keys(S.selected).forEach(function (pn) {
      S.selected[pn].forEach(function (val) {
        params.append(pn, val);
      });
    });

    // Price range
    if (S.priceMin !== '') params.set(S.priceMinParam, S.priceMin);
    if (S.priceMax !== '') params.set(S.priceMaxParam, S.priceMax);

    // Preserve current sort
    if (S.currentSort) params.set('sort_by', S.currentSort);

    navigateTo(params.toString());
  }

  function clearAllFilters() {
    S.selected = {};
    S.priceMin = '';
    S.priceMax = '';
    var params = new URLSearchParams();
    if (S.currentSort) params.set('sort_by', S.currentSort);
    navigateTo(params.toString());
  }

  /* ============================================================
     APPLY SORT
     ============================================================ */
  function applySort(value, name) {
    // Update active style
    var opts = E.sortList.querySelectorAll('.mf-sort__option');
    opts.forEach(function (o) { o.classList.remove('mf-is-active'); });
    event && event.currentTarget && event.currentTarget.classList.add('mf-is-active');

    S.currentSort = value;

    // Build params preserving existing filters
    var params = new URLSearchParams(window.location.search);
    if (value) {
      params.set('sort_by', value);
    } else {
      params.delete('sort_by');
    }

    closeSortDrawer();
    setTimeout(function () { navigateTo(params.toString()); }, 180);
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  function navigateTo(qs) {
    var url = window.location.pathname + (qs ? '?' + qs : '');

    // Try theme AJAX if available
    if (
      window.theme &&
      window.theme.CollectionFilters &&
      typeof window.theme.CollectionFilters.renderPage === 'function'
    ) {
      window.theme.CollectionFilters.renderPage(qs);
      closeFilterDrawer();
    } else {
      window.location.href = url;
    }
  }

  /* ============================================================
     DRAWER OPEN / CLOSE
     ============================================================ */
  function openFilterDrawer() {
    E.filterDrawer.classList.add('mf-is-open');
    E.filterDrawer.setAttribute('aria-hidden', 'false');
    E.overlay.classList.add('mf-is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeFilterDrawer() {
    E.filterDrawer.classList.remove('mf-is-open');
    E.filterDrawer.setAttribute('aria-hidden', 'true');
    if (!E.sortDrawer.classList.contains('mf-is-open')) {
      E.overlay.classList.remove('mf-is-visible');
      document.body.style.overflow = '';
    }
  }

  function openSortDrawer() {
    E.sortDrawer.classList.add('mf-is-open');
    E.sortDrawer.setAttribute('aria-hidden', 'false');
    E.overlay.classList.add('mf-is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeSortDrawer() {
    E.sortDrawer.classList.remove('mf-is-open');
    E.sortDrawer.setAttribute('aria-hidden', 'true');
    if (!E.filterDrawer.classList.contains('mf-is-open')) {
      E.overlay.classList.remove('mf-is-visible');
      document.body.style.overflow = '';
    }
  }

  /* ============================================================
     EVENT BINDINGS
     ============================================================ */
  function bindEvents() {
    // Toolbar
    var btnFilters = document.getElementById('mf-btn-filters');
    var btnSort    = document.getElementById('mf-btn-sort');
    if (btnFilters) btnFilters.addEventListener('click', openFilterDrawer);
    if (btnSort)    btnSort.addEventListener('click', openSortDrawer);

    // Close buttons
    var closeFilter = document.getElementById('mf-close-filter');
    var closeSort   = document.getElementById('mf-close-sort');
    if (closeFilter) closeFilter.addEventListener('click', closeFilterDrawer);
    if (closeSort)   closeSort.addEventListener('click', closeSortDrawer);

    // Footer actions
    var btnClear = document.getElementById('mf-clear-all');
    var btnApply = document.getElementById('mf-apply');
    if (btnClear) btnClear.addEventListener('click', clearAllFilters);
    if (btnApply) btnApply.addEventListener('click', applyFilters);

    // Overlay tap
    E.overlay.addEventListener('click', function () {
      closeFilterDrawer();
      closeSortDrawer();
    });
  }

  function reloadState() {
    // Only run on mobile viewport where elements are initialized and visible
    if (window.innerWidth > 767) return;

    var dataEl = document.getElementById('mf-data');
    if (!dataEl) return;

    var parsed;
    try { parsed = JSON.parse(dataEl.textContent); }
    catch (err) { return; }

    S.filters = parsed.filters || [];
    S.sortOptions = parsed.sortOptions || [];
    S.collectionUrl = parsed.collectionUrl || window.location.pathname;
    S.currentSort = getParam('sort_by');

    // Reset selected lists
    S.selected = {};
    S.priceMin = '';
    S.priceMax = '';
    seedSelectedFromURL();

    // Re-render list panels and badge
    renderGroups();
    renderSortList();
    syncGroupActive(S.activeGroupIdx < S.filters.length ? S.activeGroupIdx : 0);
    renderValues(S.activeGroupIdx < S.filters.length ? S.activeGroupIdx : 0);
    syncBadge();
  }

  // Export globally
  window.mhyMobileFilterReload = reloadState;

  /* ============================================================
     ENTRY POINT
     ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
