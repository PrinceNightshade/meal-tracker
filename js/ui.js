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

// `inverse` cards (added sugar, sodium — the "keep under" row) use inverse
// coloring: low is good (green), high is bad (warn/over/purple-over-goal).
// `incomplete` shows a "~" prefix on the value + a muted dot, for totals built
// from partially-unknown data (e.g. sodium when a logged food has no known
// value) — see the "never fake a zero" guardrail in CLAUDE.md.
export function renderMacroCard(label, current, goal, unit = 'g', inverse = false, { incomplete = false } = {}) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = current > goal;

  let cardClass = 'macro-card';

  if (inverse) {
    cardClass += ' macro-card--inverse';
    if (over) {
      cardClass += ' inverse-purple';
    } else if (pct >= 85) {
      cardClass += ' inverse-over';
    } else if (pct >= 40) {
      cardClass += ' inverse-warn';
    }
    // else: green (default via CSS)
  } else if (over) {
    cardClass += ' over';
  }

  const barFillEl = el('div', {});
  barFillEl.style.width = `${pct}%`;

  const valueText = `${incomplete ? '~' : ''}${String(Math.round(current))}`;

  const card = el('div', { className: cardClass }, [
    el('div', { className: 'macro-card__label', textContent: label }),
    el('div', { className: 'macro-card__value' }, [
      el('b', { textContent: valueText }),
      el('span', { textContent: `/${goal}${unit}` }),
    ]),
    el('div', { className: 'macro-card__bar' }, [barFillEl]),
    ...(incomplete ? [el('div', { className: 'macro-card__hint', textContent: 'some items missing sodium' })] : []),
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

  // Row 1 "build toward": protein / carbs / fat
  const macroRow = el('div', { className: 'macro-row macro-row--build' });
  macroRow.appendChild(renderMacroCard('PROTEIN', totals.protein || 0, goals.protein || 150, 'g'));
  macroRow.appendChild(renderMacroCard('CARBS',   totals.carbs   || 0, goals.carbs   || 200, 'g'));
  macroRow.appendChild(renderMacroCard('FAT',     totals.fat     || 0, goals.fat     || 65,  'g'));
  container.appendChild(macroRow);

  // Row 2 "keep under": added sugar / sodium — both inverse-colored (low = good).
  // Faint uppercase group captions — trivially removable (this one element).
  container.appendChild(el('div', { className: 'macro-group-caption', textContent: 'KEEP UNDER' }));
  const limitRow = el('div', { className: 'macro-row macro-row--limit' });
  const sugarGoal = goals.addedSugars && goals.addedSugars > 0 ? goals.addedSugars : 25;
  limitRow.appendChild(renderMacroCard('SUGAR', totals.addedSugars || 0, sugarGoal, 'g', true));
  const sodiumGoal = goals.sodiumGoal && goals.sodiumGoal > 0 ? goals.sodiumGoal : 2300;
  limitRow.appendChild(renderMacroCard('SODIUM', totals.sodium || 0, sodiumGoal, 'mg', true, { incomplete: !!totals.sodiumIncomplete }));
  container.appendChild(limitRow);

  return container;
}

// ── Opportunity card (Pulse carousel slide 2) ──
// Driven by js/opportunity.js — one ranked insight across food/movement/sleep
// over a rolling window. Reuses the .insight-card visual language.

const OPP_ICONS = {
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7v8l9-12h-7V2z"/></svg>',
  good: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  neutral: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>',
};

export function renderOpportunityCard(opportunity) {
  const opp = opportunity || { tone: 'neutral', eyebrow: 'THIS WEEK', headline: 'Keep logging to unlock insights', sub: 'A few more days of data sharpens your weekly opportunity.', series: null };
  const tone = opp.tone || 'neutral';

  const card = el('div', { className: `daily-summary insight-card carousel-card insight-card--${tone}` });

  // Head
  const headEl = el('div', { className: 'insight-card__head' });
  const iconEl = el('span', { className: 'insight-card__icon' });
  iconEl.innerHTML = OPP_ICONS[tone] || OPP_ICONS.neutral;
  headEl.appendChild(iconEl);
  headEl.appendChild(el('span', { className: 'insight-card__eyebrow', textContent: opp.eyebrow || 'THIS WEEK' }));
  card.appendChild(headEl);

  // Headline
  card.appendChild(el('h2', { className: 'insight-card__hed', textContent: opp.headline }));

  // Sub
  if (opp.sub) card.appendChild(el('p', { className: 'insight-card__sub', textContent: opp.sub }));

  // Real chart from the winning insight's series
  if (opp.series && opp.series.values && opp.series.values.length) {
    const { values, labels, highlight } = opp.series;
    const max = Math.max(...values, 1);
    const min = Math.min(...values.filter(v => v > 0), 0);
    const range = (max - min) || 1;
    const hlClass = tone === 'good' ? 'hit' : 'warn';

    const chartEl = el('div', { className: 'insight-card__chart' });
    values.forEach((v, i) => {
      const h = v > 0 ? Math.round(20 + ((v - min) / range) * 44) : 6;
      const bar = el('div', { className: `bar${highlight && highlight[i] ? ' ' + hlClass : ''}` });
      bar.style.setProperty('--h', `${h}px`);
      bar.appendChild(el('span', { textContent: (labels && labels[i]) || '' }));
      chartEl.appendChild(bar);
    });
    card.appendChild(chartEl);
  }

  return card;
}

// ── Movement + sleep strip (surfaces the new data streams on Daily) ──

function fmtSleep(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function renderWellnessStrip(stats, { onEmptyClick } = {}) {
  if (!stats || !stats.daysWithData) {
    const hint = el('button', {
      className: 'wellness-strip wellness-strip--empty',
      type: 'button',
      onClick: () => onEmptyClick && onEmptyClick(),
    }, [
      el('span', { className: 'wellness-strip__hint', textContent: 'Add movement & sleep — import in Goals →' }),
    ]);
    return hint;
  }

  const cell = (label, value) => el('div', { className: 'wellness-strip__cell' }, [
    el('div', { className: 'wellness-strip__val', textContent: value }),
    el('div', { className: 'wellness-strip__label', textContent: label }),
  ]);

  return el('div', { className: 'wellness-strip' }, [
    cell('STEPS / DAY', stats.avgSteps != null ? Math.round(stats.avgSteps).toLocaleString() : '—'),
    cell('SLEEP / NIGHT', fmtSleep(stats.avgSleepMinutes)),
    cell('WORKOUT DAYS', `${stats.workoutDays}`),
  ]);
}

export function renderDailySummaryCarousel(totals, goals, opportunity = null, totals7 = null) {
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

  // Card 2: opportunity card (real cross-domain insight)
  const insightCard = renderOpportunityCard(opportunity);
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

// series: [{ date, weight, trend }] (from store.getWeightSeries). The EMA trend
// is the signal (accent line); raw dailies are faint dots around it; the goal is
// a dashed line so progress toward it is visible at a glance.
export function renderWeightChart(series, goal = null) {
  if (!series || series.length < 2) {
    return el('div', { className: 'weight-chart-empty', textContent: 'Log at least 2 weights to see your trend.' });
  }

  const W = 320, H = 150, PAD_L = 28, PAD_R = 10, PAD_T = 12, PAD_B = 22;
  const vals = series.flatMap(e => [e.weight, e.trend]);
  if (goal != null) vals.push(goal);
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const range = max - min || 1;

  const xAt = i => PAD_L + (i / (series.length - 1)) * (W - PAD_L - PAD_R);
  const yAt = v => H - PAD_B - ((v - min) / range) * (H - PAD_T - PAD_B);

  const trendD = series.map((e, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(e.trend).toFixed(1)}`).join(' ');
  const dots = series.map(e => `<circle cx="${xAt(series.indexOf(e)).toFixed(1)}" cy="${yAt(e.weight).toFixed(1)}" r="2" fill="var(--ink-3)"><title>${e.date}: ${e.weight} lbs</title></circle>`).join('');
  const goalLine = goal != null
    ? `<line x1="${PAD_L}" y1="${yAt(goal).toFixed(1)}" x2="${W - PAD_R}" y2="${yAt(goal).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="4 4"/>`
    : '';

  const firstDate = formatShortDate(series[0].date);
  const lastDate = formatShortDate(series[series.length - 1].date);
  const last = series[series.length - 1];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'weight-chart');
  svg.innerHTML = `
    ${goalLine}
    ${dots}
    <path d="${trendD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${xAt(series.length - 1).toFixed(1)}" cy="${yAt(last.trend).toFixed(1)}" r="3.5" fill="var(--accent)"/>
    <circle cx="${xAt(series.length - 1).toFixed(1)}" cy="${yAt(last.trend).toFixed(1)}" r="9" fill="var(--accent)" opacity="0.15"/>
    <text x="${PAD_L}" y="${H - 5}" class="chart-label">${firstDate}</text>
    <text x="${W - PAD_R}" y="${H - 5}" class="chart-label" text-anchor="end">${lastDate}</text>
    <text x="4" y="${PAD_T + 4}" class="chart-label">${max.toFixed(0)}</text>
    <text x="4" y="${H - PAD_B}" class="chart-label">${min.toFixed(0)}</text>
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
  // Sodium: null means genuinely unknown (never coerced to 0) — see the
  // "never fake a zero" guardrail in CLAUDE.md.
  const currentSodium  = (food.sodium === undefined || food.sodium === null)
    ? null
    : Math.round(food.sodium * (food.servings || 1));

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
        ...(goals.sodiumGoal && goals.sodiumGoal > 0 ? [
          el('div', { className: 'nutrition-row' }, [
            el('span', { textContent: 'Sodium' }),
            el('span', {
              className: 'nutrition-value',
              textContent: currentSodium != null
                ? `${currentSodium}mg / ${goals.sodiumGoal}mg (${getPercent(currentSodium, goals.sodiumGoal)}%)`
                : 'Unknown — tap Edit nutrition to add',
            }),
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
            const sodiumInput  = modal.querySelector('.nutrition-edit-sodium');
            const saveCheckbox = modal.querySelector('.save-correction-checkbox');
            nutritionEdits = {
              calories: parseFloat(calsInput.value)    || 0,
              protein:  parseFloat(proteinInput.value) || 0,
              carbs:    parseFloat(carbsInput.value)   || 0,
              fat:      parseFloat(fatInput.value)     || 0,
              saveToMyFoods: saveCheckbox?.checked ?? true,
            };
            if (sugarsInput) nutritionEdits.addedSugars = parseFloat(sugarsInput.value) || 0;
            if (sodiumInput) nutritionEdits.sodium = parseFloat(sodiumInput.value) || 0;
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
      ...(goals.sodiumGoal && goals.sodiumGoal > 0
        ? [{ cls: 'nutrition-edit-sodium', val: currentSodium ?? 0, unit: 'mg' }]
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
