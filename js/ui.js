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

// ── SVG icon helper ──

export function svgIcon(id, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

// ── Progress Ring ──

export function renderRing(current, goal, label, unit = '', size = 120, stroke = 10) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;

  // Threshold logic: 0-49% = over(red), 50-84% = warn(yellow), 85-100% = good(green), >100% = over(red)
  let colorClass;
  if (over) {
    colorClass = 'ring-fill--over';
  } else if (pct >= 85) {
    colorClass = 'ring-fill--good';
  } else if (pct >= 50) {
    colorClass = 'ring-fill--warn';
  } else {
    colorClass = 'ring-fill--over';
  }

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
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" class="ring-track" stroke-width="${stroke}"/>
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke-width="${stroke}"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${center} ${center})" class="ring-fill ${colorClass}"/>
  `;

  const wrapper = el('div', { className: 'ring-wrapper ring-calorie' });
  wrapper.appendChild(svg);
  wrapper.appendChild(el('div', { className: 'ring-label' }, [
    el('span', { className: 'ring-current', textContent: `${Math.round(current)}` }),
    el('span', { className: 'ring-goal', textContent: `/ ${goal}${unit}` }),
    el('span', { className: 'ring-name', textContent: label }),
  ]));
  return wrapper;
}

// ── Progress Bar (kept for food details modal etc.) ──

export function renderProgressBar(current, goal, label, unit = '', inverse = false) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;

  let color;
  if (inverse) {
    color = over ? '#a78bfa' : pct >= 85 ? '#ef4444' : pct >= 40 ? '#fbbf24' : '#22c55e';
  } else {
    color = over ? 'var(--over)' : pct >= 85 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--over)';
  }

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

// ── Macro card (replaces individual macro rings) ──

export function renderMacroCard(label, current, goal, unit = 'g', inverse = false) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;

  // Sugar card uses inverse coloring: low is good (green), high is bad
  let barColorStyle = '';
  let cardClass = 'macro-card';

  if (label === 'SUGAR') {
    cardClass += ' macro-card--sugar';
    if (over) {
      cardClass += ' sugar-purple';
    } else if (pct >= 85) {
      cardClass += ' sugar-over';
    } else if (pct >= 40) {
      cardClass += ' sugar-warn';
    }
    // else: green (default via CSS)
  } else if (over) {
    cardClass += ' over';
  }

  // Bar fill: accent by default; CSS handles sugar overrides via class
  const barFillEl = el('div', {});
  if (!inverse) {
    barFillEl.style.width = `${pct}%`;
  } else {
    barFillEl.style.width = `${pct}%`;
  }

  const card = el('div', { className: cardClass }, [
    el('div', { className: 'macro-card__label', textContent: label }),
    el('div', { className: 'macro-card__value' }, [
      el('b', { textContent: String(Math.round(current)) }),
      el('span', { textContent: `/${goal}${unit}` }),
    ]),
    el('div', { className: 'macro-card__bar' }, [barFillEl]),
  ]);

  return card;
}

// ── Daily rings + macro card section ──

export function renderDailySummaryRings(totals, goals) {
  const container = el('div', {});

  // Big calorie ring
  const ringsContainer = el('div', { className: 'rings-container' });
  ringsContainer.appendChild(renderRing(totals.calories, goals.calories, 'Calories', '', 120, 10));
  container.appendChild(ringsContainer);

  // 4-up macro card grid (protein / carbs / fat / sugar)
  const macroRow = el('div', { className: 'macro-row' });
  macroRow.appendChild(renderMacroCard('PROTEIN', totals.protein || 0, goals.protein || 150, 'g'));
  macroRow.appendChild(renderMacroCard('CARBS',   totals.carbs   || 0, goals.carbs   || 200, 'g'));
  macroRow.appendChild(renderMacroCard('FAT',     totals.fat     || 0, goals.fat     || 65,  'g'));
  // Sugar card — only if goal set; fall back to 25g default
  const sugarGoal = goals.addedSugars && goals.addedSugars > 0 ? goals.addedSugars : 25;
  macroRow.appendChild(renderMacroCard('SUGAR', totals.addedSugars || 0, sugarGoal, 'g', true));
  container.appendChild(macroRow);

  return container;
}

// ── Insight card (Pulse carousel slide 2) ──

export function renderInsightCard(totals7, goals) {
  // Compute protein hit booleans for the last 7 days
  const proteinGoal = goals.protein || 150;
  const hits = (totals7 || []).map(t => t && (t.protein || 0) >= proteinGoal);
  const hitCount = hits.filter(Boolean).length;
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Pick a secondary trend — fat (simplest to derive inline)
  const fatGoal = goals.fat || 65;
  const fatOver = (totals7 || []).filter(t => t && (t.fat || 0) > fatGoal).length;
  const hasFatTrend = fatOver >= 3;

  // Build chart bars
  const chartEl = el('div', { className: 'insight-card__chart' });
  const maxHeight = 60;
  const minHeight = 30;
  hits.forEach((hit, i) => {
    const h = minHeight + Math.round(Math.random() * (maxHeight - minHeight));
    const bar = el('div', { className: `bar${hit ? ' hit' : ''}` });
    bar.style.setProperty('--h', `${h}px`);
    bar.appendChild(el('span', { textContent: dayLabels[i % 7] }));
    chartEl.appendChild(bar);
  });

  // Insight headline
  const hedText = hitCount >= 5
    ? `Protein on goal ${hitCount} of ${hits.length} days`
    : hitCount >= 3
    ? `Protein hit ${hitCount} of ${hits.length} days`
    : `Protein goal reached ${hitCount} of ${hits.length} days`;

  const card = el('div', { className: 'daily-summary insight-card carousel-card' });

  // Head
  const headEl = el('div', { className: 'insight-card__head' });
  const iconEl = el('span', { className: 'insight-card__icon' });
  iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7v8l9-12h-7V2z"/></svg>';
  headEl.appendChild(iconEl);
  headEl.appendChild(el('span', { className: 'insight-card__eyebrow', textContent: 'INSIGHT · LAST 7 DAYS' }));
  card.appendChild(headEl);

  // Headline
  const hed = el('h2', { className: 'insight-card__hed' });
  const parts = hedText.split(/([\d]+ of [\d]+ days)/);
  parts.forEach(part => {
    if (/\d+ of \d+ days/.test(part)) {
      const em = el('em', { textContent: part });
      hed.appendChild(em);
    } else {
      hed.appendChild(document.createTextNode(part));
    }
  });
  card.appendChild(hed);

  // Sub
  const subText = hitCount >= 5
    ? 'Strong week. Keep this up for steady progress.'
    : hitCount >= 3
    ? 'Getting there — a few more consistent days will lock in the habit.'
    : 'Protein under target most days — try adding a source to each meal.';
  card.appendChild(el('p', { className: 'insight-card__sub', textContent: subText }));

  // Chart
  card.appendChild(chartEl);

  // Secondary note (fat trend if present)
  if (hasFatTrend) {
    const noteEl = el('div', { className: 'insight-card__note' });
    const trendEl = el('span', { className: 'trend trend-up' });
    trendEl.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l5-5 5 5M7 11l5-5 5 5"/></svg>';
    noteEl.appendChild(trendEl);
    const noteText = el('div');
    noteText.appendChild(el('div', { className: 'note__title', textContent: 'Fat trending up' }));
    noteText.appendChild(el('div', { className: 'note__sub', textContent: `${fatOver} DAYS OVER · CHECK SAUCES & OILS` }));
    noteEl.appendChild(noteText);
    card.appendChild(noteEl);
  }

  return card;
}

export function renderDailySummaryCarousel(totals, goals, insights = [], currentInsightIndex = 0, totals7 = null) {
  const carouselWrapper = el('div', { className: 'carousel-wrapper' });
  const carousel = el('div', { className: 'daily-carousel' });

  // Card 1: Calorie ring + macro cards (with prev/next nav overlays)
  const ringsCard = el('div', { className: 'daily-summary carousel-card' });

  const prevBtn = el('button', {
    id: 'btn-prev',
    className: 'daily-summary__nav daily-summary__nav--prev',
    type: 'button',
  });
  prevBtn.setAttribute('aria-label', 'Previous day');
  prevBtn.innerHTML = '&#8249;';

  const nextBtn = el('button', {
    id: 'btn-next',
    className: 'daily-summary__nav daily-summary__nav--next',
    type: 'button',
  });
  nextBtn.setAttribute('aria-label', 'Next day');
  nextBtn.innerHTML = '&#8250;';

  ringsCard.appendChild(prevBtn);
  ringsCard.appendChild(nextBtn);
  ringsCard.appendChild(renderDailySummaryRings(totals, goals));
  carousel.appendChild(ringsCard);

  // Card 2: Pulse insight card
  const insightCard = renderInsightCard(totals7, goals);
  carousel.appendChild(insightCard);

  // Page indicator dots
  const dotsContainer = el('div', { className: 'carousel-dots' }, [
    el('div', { className: 'carousel-dot active' }),
    el('div', { className: 'carousel-dot' }),
  ]);

  // Update dots on scroll
  carousel.addEventListener('scroll', () => {
    const scrollLeft = carousel.scrollLeft;
    const cardWidth = carousel.offsetWidth;
    const currentCard = Math.round(scrollLeft / cardWidth);
    const dots = dotsContainer.querySelectorAll('.carousel-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentCard);
    });
  });

  carouselWrapper.appendChild(carousel);
  carouselWrapper.appendChild(dotsContainer);

  // Touch swipe support
  let touchStartX = 0;
  let touchEndX = 0;

  carousel.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, false);

  carousel.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      const target = diff > 0 ? carousel.children[1] : carousel.children[0];
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }, false);

  return carouselWrapper;
}

// ── Meal Section ──

export function renderMealSection(mealType, foods, { onAdd, onRemove, onToggleFav, onFoodClick }, favorites = []) {
  const mealIconMap = {
    breakfast: 'i-meal-breakfast',
    lunch:     'i-meal-lunch',
    dinner:    'i-meal-dinner',
    snacks:    'i-meal-snacks',
  };
  const mealTimeMap = {
    breakfast: '07:00 · MORNING',
    lunch:     '12:30 · MIDDAY',
    dinner:    '18:30 · EVENING',
    snacks:    'ANYTIME',
  };

  const mealCals = foods.reduce((sum, f) => sum + (f.calories || 0) * (f.servings || 1), 0);

  const foodItems = foods.map(food => {
    const cals = Math.round((food.calories || 0) * (food.servings || 1));
    const baseServing = formatServing(food);
    const servLabel = food.servings && food.servings !== 1
      ? `${food.servings} × ${baseServing}`.trim()
      : baseServing;

    const isFav = favorites.some(f => f.name === food.name);

    // Star button with SVG icon
    const favBtn = el('button', {
      className: `btn-icon btn-fav${isFav ? ' active is-fav' : ''}`,
      title: isFav ? 'Remove from favorites' : 'Add to favorites',
      onClick: (e) => {
        e.stopPropagation();
        const nowFav = favBtn.classList.toggle('active');
        favBtn.classList.toggle('is-fav', nowFav);
        favBtn.innerHTML = '';
        favBtn.appendChild(svgIcon(nowFav ? 'i-star-fill' : 'i-star', 16));
        onToggleFav(food, nowFav, mealType);
      },
    });
    favBtn.appendChild(svgIcon(isFav ? 'i-star-fill' : 'i-star', 16));

    // Remove button with SVG icon
    const removeBtn = el('button', {
      className: 'btn-icon btn-remove',
      title: 'Remove',
      onClick: (e) => {
        e.stopPropagation();
        onRemove(mealType, food.id);
      },
    });
    removeBtn.appendChild(svgIcon('i-close', 14));

    const detailText = servLabel ? `${servLabel} — ${cals} cal` : `${cals} cal`;
    const foodItemEl = el('div', { className: 'food-item' }, [
      el('div', { className: 'food-info' }, [
        el('span', { className: 'food-name', textContent: food.name }),
        el('span', { className: 'food-detail', textContent: detailText }),
      ]),
      el('div', { className: 'food-actions' }, [favBtn, removeBtn]),
    ]);

    foodItemEl.addEventListener('click', () => {
      if (onFoodClick) onFoodClick(mealType, food);
    });

    return foodItemEl;
  });

  const isEmpty = foods.length === 0;

  // Meal icon
  const mealIconEl = el('span', { className: 'meal-icon' });
  mealIconEl.appendChild(svgIcon(mealIconMap[mealType] || 'i-meal-snacks', 18));

  // Add button with SVG icon
  const addBtn = el('button', {
    className: 'btn-add',
    'aria-label': `Add to ${mealType}`,
    onClick: (e) => { e.stopPropagation(); onAdd(mealType); },
  });
  addBtn.appendChild(svgIcon('i-plus', 14));

  // Calorie display
  const calsEl = el('div', { className: 'meal-cals' }, [
    document.createTextNode(String(Math.round(mealCals))),
  ]);
  const calsUnit = el('span', { className: 'meal-cals__unit', textContent: 'kcal' });
  calsEl.appendChild(calsUnit);

  const section = el('div', {
    className: `meal-section meal-section--${mealType}${isEmpty ? ' is-empty meal-section--empty' : ''}`,
  });

  const header = el('div', { className: 'meal-header' }, [
    mealIconEl,
    el('div', { className: 'meal-title-block' }, [
      el('div', { className: 'meal-title', textContent: capitalize(mealType) }),
      el('div', { className: 'meal-time', textContent: mealTimeMap[mealType] || '' }),
    ]),
    calsEl,
    addBtn,
  ]);

  section.appendChild(header);
  foodItems.forEach(fi => section.appendChild(fi));

  if (isEmpty) {
    section.appendChild(el('div', { className: 'meal-empty-hint', textContent: 'TAP TO COMPOSE' }));
    section.addEventListener('click', () => onAdd(mealType));
  }

  return section;
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

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const firstDate = formatShortDate(history[0].date);
  const lastDate = formatShortDate(history[history.length - 1].date);
  const lastPoint = points[points.length - 1];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'weight-chart');
  svg.innerHTML = `
    <defs>
      <linearGradient id="w-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#5BE9F0"/>
        <stop offset="100%" stop-color="var(--accent)"/>
      </linearGradient>
    </defs>
    <path d="${pathD}" fill="none" stroke="url(#w-grad)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent)"><title>${p.date}: ${p.weight} lbs</title></circle>`).join('')}
    <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="10" fill="var(--accent)" opacity="0.15"/>
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

  // Chevron SVG
  const chevron = el('span', { className: 'collapsible-chevron' });
  chevron.appendChild(svgIcon('i-chevron-right', 16));

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
    if (summaryEl) {
      if (isOpen) summaryEl.remove();
      else header.insertBefore(summaryEl, chevron);
    }
  });

  return wrapper;
}

// ── Food Details Modal ──

export function renderFoodModal(food, goals, { onSave, onDelete } = {}) {
  const currentCals    = Math.round((food.calories    || 0) * (food.servings || 1));
  const currentProtein = Math.round((food.protein     || 0) * (food.servings || 1));
  const currentCarbs   = Math.round((food.carbs       || 0) * (food.servings || 1));
  const currentFat     = Math.round((food.fat         || 0) * (food.servings || 1));
  const currentSugars  = Math.round((food.addedSugars || 0) * (food.servings || 1));

  const getPercent = (val, goal) => goal > 0 ? Math.round((val / goal) * 100) : 0;

  const servLabel = formatServing(food);

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
        step: '0.5', min: '0.1',
      }),
    ]),

    el('div', { className: 'food-modal-section' }, [
      el('div', { className: 'nutrition-heading-row' }, [
        el('h3', { textContent: 'Nutritional Breakdown' }),
        el('span', {
          className: 'edit-nutrition-link',
          textContent: 'Edit nutrition',
          onClick: () => enterEditMode(),
        }),
      ]),
      el('div', { className: 'nutrition-breakdown' }, [
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Calories' }),
          el('span', { className: 'nutrition-value', textContent: `${currentCals} / ${goals.calories} (${getPercent(currentCals, goals.calories)}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Protein' }),
          el('span', { className: 'nutrition-value', textContent: `${currentProtein}g / ${goals.protein}g (${getPercent(currentProtein, goals.protein)}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Carbs' }),
          el('span', { className: 'nutrition-value', textContent: `${currentCarbs}g / ${goals.carbs}g (${getPercent(currentCarbs, goals.carbs)}%)` }),
        ]),
        el('div', { className: 'nutrition-row' }, [
          el('span', { textContent: 'Fat' }),
          el('span', { className: 'nutrition-value', textContent: `${currentFat}g / ${goals.fat}g (${getPercent(currentFat, goals.fat)}%)` }),
        ]),
        ...(goals.addedSugars && goals.addedSugars > 0 ? [
          el('div', { className: 'nutrition-row' }, [
            el('span', { textContent: 'Added Sugar' }),
            el('span', { className: 'nutrition-value', textContent: `${currentSugars}g / ${goals.addedSugars}g (${getPercent(currentSugars, goals.addedSugars)}%)` }),
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
          let nutritionEdits = null;
          if (modal.dataset.editMode === '1') {
            const calsInput    = modal.querySelector('.nutrition-edit-calories');
            const proteinInput = modal.querySelector('.nutrition-edit-protein');
            const carbsInput   = modal.querySelector('.nutrition-edit-carbs');
            const fatInput     = modal.querySelector('.nutrition-edit-fat');
            const sugarsInput  = modal.querySelector('.nutrition-edit-sugars');
            const saveCheckbox = modal.querySelector('.save-correction-checkbox');
            nutritionEdits = {
              calories: parseFloat(calsInput.value)    || 0,
              protein:  parseFloat(proteinInput.value) || 0,
              carbs:    parseFloat(carbsInput.value)   || 0,
              fat:      parseFloat(fatInput.value)     || 0,
              saveToMyFoods: saveCheckbox?.checked ?? true,
            };
            if (sugarsInput) nutritionEdits.addedSugars = parseFloat(sugarsInput.value) || 0;
          }
          onSave?.(newServings, nutritionEdits);
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

  function enterEditMode() {
    modal.dataset.editMode = '1';
    const editLink = modal.querySelector('.edit-nutrition-link');
    if (editLink) editLink.style.display = 'none';

    const rows = modal.querySelectorAll('.nutrition-row');
    const nutrients = [
      { cls: 'nutrition-edit-calories', val: currentCals,    unit: '' },
      { cls: 'nutrition-edit-protein',  val: currentProtein, unit: 'g' },
      { cls: 'nutrition-edit-carbs',    val: currentCarbs,   unit: 'g' },
      { cls: 'nutrition-edit-fat',      val: currentFat,     unit: 'g' },
      ...(goals.addedSugars && goals.addedSugars > 0
        ? [{ cls: 'nutrition-edit-sugars', val: currentSugars, unit: 'g' }]
        : []),
    ];

    rows.forEach((row, i) => {
      const valueSpan = row.querySelector('.nutrition-value');
      if (!valueSpan || !nutrients[i]) return;
      const { cls, val, unit } = nutrients[i];
      const input = el('input', {
        type: 'number',
        className: `nutrition-row-input ${cls}`,
        value: String(val), min: '0', step: '1',
      });
      const unitSpan = unit ? el('span', { className: 'nutrition-edit-unit', textContent: unit }) : null;
      const wrapper = el('div', { className: 'nutrition-edit-cell' }, unitSpan ? [input, unitSpan] : [input]);
      valueSpan.replaceWith(wrapper);
    });

    const saveCheckbox = el('input', { type: 'checkbox', className: 'save-correction-checkbox' });
    saveCheckbox.checked = true;
    const checkboxLabel = el('label', { className: 'save-correction-label' }, [
      saveCheckbox,
      el('span', { textContent: 'Save to My Foods so future searches use this version' }),
    ]);
    modal.querySelector('.nutrition-breakdown').after(checkboxLabel);
  }

  return modal;
}

// ── Water Chip (action-row version) ──
// Returns the chip element that fits inside the .action-row

export function renderWaterChip(water, { onAdd, onSet } = {}) {
  const chip = el('div', { className: 'water-chip' });

  // Left: icon + label + value
  const iconEl = el('span', {});
  iconEl.appendChild(svgIcon('i-water', 18));

  const infoEl = el('div', { className: 'water-chip__info' });
  infoEl.appendChild(el('div', { className: 'water-chip__label', textContent: 'WATER' }));

  const valueEl = el('div', { className: 'water-chip__value' });
  const boldEl = el('b', { textContent: String(water) });
  valueEl.appendChild(boldEl);
  valueEl.appendChild(el('span', { textContent: '/8 gl' }));
  infoEl.appendChild(valueEl);

  // Plus ghost button
  const plusBtn = el('button', { className: 'round-ghost', type: 'button' });
  plusBtn.appendChild(svgIcon('i-plus', 12));

  chip.appendChild(iconEl);
  chip.appendChild(infoEl);
  chip.appendChild(plusBtn);

  // Hold-to-decrement, tap-to-add (same as before, adapted for new structure)
  const HOLD_MS = 500;
  const TICK_MS = 200;
  let holdTimer = null;
  let tickInterval = null;
  let inHold = false;
  let displayed = water;

  function cleanup() {
    if (holdTimer)    { clearTimeout(holdTimer);    holdTimer   = null; }
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  }

  function updateDisplay(n) {
    boldEl.textContent = String(n);
    // pulse animation
    boldEl.classList.add('pulse');
    setTimeout(() => boldEl.classList.remove('pulse'), 150);
  }

  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    chip.setPointerCapture?.(e.pointerId);
    inHold   = false;
    displayed = water;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      inHold    = true;
      if (navigator.vibrate) navigator.vibrate(10);
      tickInterval = setInterval(() => {
        if (displayed > 0) {
          displayed -= 1;
          updateDisplay(displayed);
        } else {
          clearInterval(tickInterval);
          tickInterval = null;
        }
      }, TICK_MS);
    }, HOLD_MS);
  });

  chip.addEventListener('pointerup', (e) => {
    chip.releasePointerCapture?.(e.pointerId);
    if (inHold) {
      cleanup();
      inHold = false;
      if (displayed !== water) onSet?.(displayed);
    } else {
      cleanup();
      onAdd?.();
    }
  });

  chip.addEventListener('pointercancel', () => {
    cleanup();
    if (inHold && displayed !== water) onSet?.(displayed);
    inHold = false;
  });

  return chip;
}

// ── Helpers ──

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatServing(food) {
  const size = food.servingSize;
  const unit = (food.servingUnit || '').trim();
  const sizeStr = size === 0 || size == null || size === '' ? '' : String(size);
  if (!sizeStr && !unit) return '';
  if (!sizeStr) return unit;
  if (!unit) return sizeStr;
  if (Number(size) === 1 && /^\d/.test(unit)) return unit;
  return `${sizeStr} ${unit}`;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateCompact(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
