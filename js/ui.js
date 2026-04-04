// ui.js — DOM rendering helpers

export function $(sel, parent = document) {
  return parent.querySelector(sel);
}

export function $$(sel, parent = document) {
  return [...parent.querySelectorAll(sel)];
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') e.appendChild(document.createTextNode(child));
    else if (child) e.appendChild(child);
  }
  return e;
}

// ── Progress Ring ──

export function renderRing(current, goal, label, unit = '', size = 100, stroke = 8) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;
  const color = over ? 'var(--over)' : pct >= 85 ? 'var(--good)' : pct >= 50 ? 'var(--near)' : 'var(--over)';

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const center = size / 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'ring-svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.innerHTML = `
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}" opacity="0.3"/>
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${center} ${center})" class="ring-fill"/>
  `;

  const wrapper = el('div', { className: 'ring-wrapper' });
  wrapper.appendChild(svg);
  wrapper.appendChild(el('div', { className: 'ring-label' }, [
    el('span', { className: 'ring-current', textContent: `${current}` }),
    el('span', { className: 'ring-goal', textContent: `/ ${goal}${unit}` }),
    el('span', { className: 'ring-name', textContent: label }),
  ]));
  return wrapper;
}

export function renderDailySummaryRings(totals, goals) {
  const container = el('div', { className: 'rings-container' });

  // Big calorie ring
  container.appendChild(renderRing(totals.calories, goals.calories, 'Calories', '', 120, 10));

  // Macro rings row
  const macros = el('div', { className: 'macro-rings' }, [
    renderRing(totals.protein, goals.protein, 'Protein', 'g', 80, 6),
    renderRing(totals.carbs, goals.carbs, 'Carbs', 'g', 80, 6),
    renderRing(totals.fat, goals.fat, 'Fat', 'g', 80, 6),
  ]);
  container.appendChild(macros);

  // Added sugar ring (micro-nutrient)
  if (goals.addedSugars && goals.addedSugars > 0) {
    const sugars = el('div', { className: 'micro-rings' }, [
      renderRing(totals.addedSugars || 0, goals.addedSugars, 'Added Sugar', 'g', 70, 5),
    ]);
    container.appendChild(sugars);
  }

  return container;
}

// ── Meal Section ──

export function renderMealSection(mealType, foods, { onAdd, onRemove, onToggleFav }, favorites = []) {
  const icons = { breakfast: '☀', lunch: '☼', dinner: '☾', snacks: '○' };
  const mealCals = foods.reduce((sum, f) => sum + (f.calories || 0) * (f.servings || 1), 0);

  const foodItems = foods.map(food => {
    const cals = Math.round((food.calories || 0) * (food.servings || 1));
    const servLabel = food.servings && food.servings !== 1
      ? `${food.servings} × ${food.servingSize || ''}${food.servingUnit || ''}`
      : `${food.servingSize || ''}${food.servingUnit || ''}`;

    const isFav = favorites.some(f => f.name === food.name);
    const favBtn = el('button', {
      className: `btn-icon btn-fav${isFav ? ' active' : ''}`,
      textContent: isFav ? '★' : '☆',
      title: isFav ? 'Remove from favorites' : 'Add to favorites',
      onClick: () => {
        const nowFav = favBtn.classList.toggle('active');
        favBtn.textContent = nowFav ? '★' : '☆';
        favBtn.title = nowFav ? 'Remove from favorites' : 'Add to favorites';
        onToggleFav(food, nowFav, mealType);
      },
    });

    return el('div', { className: 'food-item' }, [
      el('div', { className: 'food-info' }, [
        el('span', { className: 'food-name', textContent: food.name }),
        el('span', { className: 'food-detail', textContent: `${servLabel} — ${cals} cal` }),
      ]),
      el('div', { className: 'food-actions' }, [
        favBtn,
        el('button', {
          className: 'btn-icon btn-remove',
          textContent: '×',
          onClick: () => onRemove(mealType, food.id),
        }),
      ]),
    ]);
  });

  const emptyMsg = foods.length === 0
    ? [el('div', { className: 'empty-meal', textContent: 'No foods logged' })]
    : [];

  return el('div', { className: 'meal-section' }, [
    el('div', { className: 'meal-header' }, [
      el('span', { className: 'meal-title' }, [
        el('span', { className: 'meal-icon', textContent: icons[mealType] || '○' }),
        el('span', { textContent: ` ${capitalize(mealType)}` }),
        el('span', { className: 'meal-cals', textContent: ` — ${Math.round(mealCals)} cal` }),
      ]),
      el('button', {
        className: 'btn-add',
        textContent: '+ Add',
        onClick: () => onAdd(mealType),
      }),
    ]),
    ...foodItems,
    ...emptyMsg,
  ]);
}

// ── Weight Chart (simple SVG) ──

export function renderWeightChart(history) {
  if (history.length < 2) {
    return el('div', { className: 'weight-chart-empty', textContent: 'Log at least 2 weights to see a chart.' });
  }

  const W = 320, H = 140, PAD = 30;
  const weights = history.map(e => e.weight);
  const min = Math.min(...weights) - 1;
  const max = Math.max(...weights) + 1;
  const range = max - min || 1;

  const points = history.map((e, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((e.weight - min) / range) * (H - PAD * 2);
    return { x, y, ...e };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Date labels (first and last)
  const firstDate = formatShortDate(history[0].date);
  const lastDate = formatShortDate(history[history.length - 1].date);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'weight-chart');
  svg.innerHTML = `
    <polyline points="${polyline}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent)"><title>${p.date}: ${p.weight} lbs</title></circle>`).join('')}
    <text x="${PAD}" y="${H - 5}" class="chart-label">${firstDate}</text>
    <text x="${W - PAD}" y="${H - 5}" class="chart-label" text-anchor="end">${lastDate}</text>
    <text x="5" y="${PAD}" class="chart-label">${max.toFixed(1)}</text>
    <text x="5" y="${H - PAD}" class="chart-label">${min.toFixed(1)}</text>
  `;
  return svg;
}

// ── Collapsible Section ──

export function collapsible(title, summary, content, { startOpen = true } = {}) {
  const body = el('div', { className: `collapsible-body ${startOpen ? 'open' : ''}` }, [content]);
  const chevron = el('span', { className: 'collapsible-chevron', textContent: '›' });
  const summaryEl = summary
    ? el('span', { className: 'collapsible-summary', textContent: summary })
    : null;

  const header = el('div', { className: 'collapsible-header' }, [
    el('h2', { textContent: title }),
    ...(summaryEl && !startOpen ? [summaryEl] : []),
    chevron,
  ]);

  const wrapper = el('div', { className: `collapsible ${startOpen ? 'open' : ''}` }, [header, body]);

  header.addEventListener('click', () => {
    const isOpen = wrapper.classList.toggle('open');
    body.classList.toggle('open', isOpen);
    // Show/hide summary when collapsed
    if (summaryEl) {
      if (isOpen) summaryEl.remove();
      else header.insertBefore(summaryEl, chevron);
    }
  });

  return wrapper;
}

// ── Helpers ──

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
