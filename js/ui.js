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

// ── Progress Bar ──

export function renderProgressBar(current, goal, label, unit = '') {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;
  const color = over ? 'var(--over)' : pct >= 85 ? 'var(--good)' : pct >= 50 ? 'var(--near)' : 'var(--over)';

  const wrapper = el('div', { className: 'progress-bar-wrapper' }, [
    el('div', { className: 'progress-bar-header' }, [
      el('span', { className: 'progress-bar-label', textContent: label }),
      el('span', { className: 'progress-bar-value', textContent: `${current} / ${goal}${unit}` }),
    ]),
    el('div', { className: 'progress-bar-track' }, [
      el('div', {
        className: 'progress-bar-fill',
        style: `width: ${pct}%; background-color: ${color};`,
      }),
    ]),
  ]);
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

  // Added sugar progress bar
  if (goals.addedSugars && goals.addedSugars > 0) {
    container.appendChild(renderProgressBar(totals.addedSugars || 0, goals.addedSugars, 'Added Sugar', 'g'));
  }

  return container;
}

// ── Meal Section ──

export function renderMealSection(mealType, foods, { onAdd, onRemove, onToggleFav, onFoodClick }, favorites = []) {
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
      onClick: (e) => {
        e.stopPropagation();
        const nowFav = favBtn.classList.toggle('active');
        favBtn.textContent = nowFav ? '★' : '☆';
        favBtn.title = nowFav ? 'Remove from favorites' : 'Add to favorites';
        onToggleFav(food, nowFav, mealType);
      },
    });

    const foodItemEl = el('div', { className: 'food-item' }, [
      el('div', { className: 'food-info' }, [
        el('span', { className: 'food-name', textContent: food.name }),
        el('span', { className: 'food-detail', textContent: `${servLabel} — ${cals} cal` }),
      ]),
      el('div', { className: 'food-actions' }, [
        favBtn,
        el('button', {
          className: 'btn-icon btn-remove',
          textContent: '×',
          onClick: (e) => {
            e.stopPropagation();
            onRemove(mealType, food.id);
          },
        }),
      ]),
    ]);

    // Make the food item clickable (excluding action buttons)
    foodItemEl.addEventListener('click', () => {
      if (onFoodClick) {
        onFoodClick(mealType, food);
      }
    });

    return foodItemEl;
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

// ── Food Details Modal ──

export function renderFoodModal(food, goals, { onSave, onDelete } = {}) {
  const currentCals = Math.round((food.calories || 0) * (food.servings || 1));
  const currentProtein = Math.round((food.protein || 0) * (food.servings || 1));
  const currentCarbs = Math.round((food.carbs || 0) * (food.servings || 1));
  const currentFat = Math.round((food.fat || 0) * (food.servings || 1));
  const currentSugars = Math.round((food.addedSugars || 0) * (food.servings || 1));

  const getPercent = (val, goal) => goal > 0 ? Math.round((val / goal) * 100) : 0;
  const calPct = getPercent(currentCals, goals.calories);
  const proteinPct = getPercent(currentProtein, goals.protein);
  const carbsPct = getPercent(currentCarbs, goals.carbs);
  const fatPct = getPercent(currentFat, goals.fat);
  const sugarsPct = getPercent(currentSugars, goals.addedSugars);

  const servLabel = `${food.servingSize || ''}${food.servingUnit || ''}`;

  const modal = el('div', { className: 'food-modal' }, [
    el('div', { className: 'food-modal-header' }, [
      el('div', {}, [
        el('h2', { textContent: food.name }),
        el('span', { className: 'food-modal-serving', textContent: servLabel }),
      ]),
    ]),

    el('div', { className: 'food-modal-section' }, [
      el('label', { textContent: 'Quantity (servings)' }),
      el('input', {
        type: 'number',
        className: 'input-quantity',
        value: String(food.servings || 1),
        step: '0.5',
        min: '0.1',
      }),
    ]),

    el('div', { className: 'food-modal-section' }, [
      el('h3', { textContent: 'Nutritional Breakdown' }),
      el('div', { className: 'nutrition-breakdown' }, [
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Calories' }),
          el('span', { className: 'nutrition-value', textContent: `${currentCals} / ${goals.calories} (${calPct}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Protein' }),
          el('span', { className: 'nutrition-value', textContent: `${currentProtein}g / ${goals.protein}g (${proteinPct}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Carbs' }),
          el('span', { className: 'nutrition-value', textContent: `${currentCarbs}g / ${goals.carbs}g (${carbsPct}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Fat' }),
          el('span', { className: 'nutrition-value', textContent: `${currentFat}g / ${goals.fat}g (${fatPct}%)` }),
        ]),
        ...(goals.addedSugars && goals.addedSugars > 0 ? [
          el('div', { className: 'nutrition-row' }, [
            el('span', { textContent: 'Added Sugar' }),
            el('span', { className: 'nutrition-value', textContent: `${currentSugars}g / ${goals.addedSugars}g (${sugarsPct}%)` }),
          ]),
        ] : []),
      ]),
    ]),

    el('div', { className: 'food-modal-actions' }, [
      el('button', {
        className: 'btn-primary btn-save',
        textContent: 'Save',
        onClick: () => {
          const quantityInput = modal.querySelector('.input-quantity');
          const newServings = parseFloat(quantityInput.value) || 1;
          onSave?.(newServings);
        },
      }),
      el('button', {
        className: 'btn-delete',
        textContent: 'Delete',
        onClick: () => {
          if (window.confirm(`Are you sure you want to delete "${food.name}"?`)) {
            onDelete?.();
          }
        },
      }),
    ]),
  ]);

  return modal;
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
