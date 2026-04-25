// app.js — Main entry point
import * as store from './store.js';
import { searchCommonFoods, searchFoodsFromAPI, lookupBarcode, analyzePhoto, debounce, getCommonFood } from './api.js';
import * as ui from './ui.js';
import * as fb from './firebase.js';
import * as analytics from './analytics.js';
import { initSW } from './sw-manager.js';

let currentDate = ui.todayStr();
let currentView = 'daily'; // daily | goals | weight
let currentInsightIndex = 0; // for cycling through analytics insights
let activeCameraStream = null; // track live camera so closeModal can stop it
let currentUser = null; // tracked separately from button rendering

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  // Deduplicate favorites that accumulated from the add-without-check bug
  store.replaceFavorites(store.getFavorites());
  initTheme();
  initSW(ui.$);
  if (store.isUnderage()) {
    renderAgeGate();
    return;
  }
  render();
  bindNav();
  initAuth();
});

// ── Theme ──

function initTheme() {
  const saved = localStorage.getItem('mt_theme'); // 'dark' | 'light' | null
  if (saved) document.documentElement.classList.add(saved);
}

function getCurrentTheme() {
  const root = document.documentElement;
  if (root.classList.contains('light')) return 'light';
  if (root.classList.contains('dark')) return 'dark';
  return 'auto';
}

function setTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  if (theme === 'auto') {
    localStorage.removeItem('mt_theme');
  } else {
    root.classList.add(theme);
    localStorage.setItem('mt_theme', theme);
  }
}

// ── Auth ──

function initAuth() {
  fb.handleRedirectResult(); // handle mobile redirect sign-in return
  renderProfileButton();
  fb.onUserChange(async user => {
    currentUser = user;
    renderProfileButton();
    if (user) {
      showToast('Signed in — syncing...');
      await fb.pullFromCloud(store);
      render();
      showToast('Synced');
    }
  });
}

function renderProfileButton() {
  const btn = ui.$('#btn-profile');
  if (!btn) return;
  btn.textContent = currentUser
    ? (currentUser.displayName?.split(' ')[0] || 'Account')
    : 'Sign in';
  btn.onclick = openProfileSheet;
}

function openProfileSheet() {
  const modal = ui.$('#modal');
  const modalBody = ui.$('#modal-body');
  modalBody.innerHTML = '';

  const sheet = ui.el('div', { className: 'profile-sheet' });

  // Theme row with segmented control
  const renderThemeOptions = () => {
    const current = getCurrentTheme();
    return ['light', 'dark', 'auto'].map(opt =>
      ui.el('button', {
        className: current === opt ? 'active' : '',
        textContent: opt[0].toUpperCase() + opt.slice(1),
        onClick: (e) => {
          setTheme(opt);
          // Re-render the theme row to update active state
          const newOptions = renderThemeOptions();
          const container = e.target.parentElement;
          container.innerHTML = '';
          newOptions.forEach(b => container.appendChild(b));
        },
      })
    );
  };

  sheet.appendChild(ui.el('div', { className: 'profile-sheet-row' }, [
    ui.el('span', { className: 'label', textContent: 'Theme' }),
    ui.el('div', { className: 'theme-options' }, renderThemeOptions()),
  ]));

  // Account row
  if (currentUser) {
    sheet.appendChild(ui.el('div', { className: 'profile-sheet-row' }, [
      ui.el('span', { className: 'label', textContent: 'Account' }),
      ui.el('span', { className: 'value', textContent: currentUser.email || currentUser.displayName || 'Signed in' }),
    ]));
    sheet.appendChild(ui.el('button', {
      className: 'btn-secondary',
      textContent: 'Sign out',
      onClick: async () => {
        await fb.signOutUser();
        showToast('Signed out');
        closeModal();
      },
    }));
  } else {
    sheet.appendChild(ui.el('div', { className: 'profile-sheet-row' }, [
      ui.el('span', { className: 'label', textContent: 'Account' }),
      ui.el('span', { className: 'value', textContent: 'Sync across devices' }),
    ]));
    sheet.appendChild(ui.el('button', {
      className: 'btn-primary',
      textContent: 'Sign in with Google',
      onClick: async () => {
        try {
          await fb.signInWithGoogle();
          closeModal();
        } catch (e) {
          showToast('Sign in failed: ' + (e.code || e.message || 'unknown error'));
        }
      },
    }));
  }

  modalBody.appendChild(ui.el('h2', { textContent: 'Profile' }));
  modalBody.appendChild(sheet);
  modal.classList.add('open');
  ui.$('#modal-close').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

function bindNav() {
  ui.$('#btn-prev').addEventListener('click', () => {
    currentDate = ui.shiftDate(currentDate, -1);
    render();
  });
  ui.$('#btn-next').addEventListener('click', () => {
    currentDate = ui.shiftDate(currentDate, 1);
    render();
  });
  ui.$('#btn-today').addEventListener('click', () => {
    currentDate = ui.todayStr();
    render();
  });
  ui.$('#nav-daily').addEventListener('click', () => switchView('daily'));
  ui.$('#nav-goals').addEventListener('click', () => switchView('goals'));
  ui.$('#nav-weight').addEventListener('click', () => switchView('weight'));
}

function switchView(view) {
  currentView = view;
  ui.$$('.nav-btn').forEach(b => b.classList.toggle('active', b.id === `nav-${view}`));
  render();
}

// ── Age Gate ──

function renderAgeGate() {
  ui.$('.app').innerHTML = '';
  ui.$('.bottom-nav').style.display = 'none';

  const gate = ui.el('div', { className: 'age-gate' }, [
    ui.el('h1', { textContent: 'Meal Tracker' }),
    ui.el('p', { textContent: 'This app is designed for adults 20 and older. It is not intended for use by children or teenagers.' }),
    ui.el('p', { className: 'age-gate-sub', textContent: 'If you believe this is an error, update your birth year in your profile.' }),
  ]);
  ui.$('.app').appendChild(gate);
}

// ── Render ──

function render() {
  const today = ui.todayStr();
  const isToday = currentDate === today;
  // Compact format in the header (no year) — keeps the date on one line on iPhone widths.
  ui.$('#date-display').textContent = isToday ? 'Today' : ui.formatDateCompact(currentDate);
  ui.$('#btn-next').disabled = currentDate >= today;
  ui.$('#btn-today').classList.toggle('hidden', isToday);

  if (currentView === 'daily') renderDaily();
  else if (currentView === 'goals') renderGoals();
  else if (currentView === 'weight') renderWeight();
}

// ── Daily View ──

function renderDaily() {
  const container = ui.$('#view-content');
  container.innerHTML = '';

  const goals = store.getGoals();
  const totals = store.getDayTotals(currentDate);
  const day = store.getDay(currentDate);

  // Get insights for analytics carousel
  let insights = [];
  try {
    insights = analytics.analyzeFoodHistory(7, currentDate);
  } catch (e) {
    console.error('Analytics error:', e);
  }

  // Summary carousel (rings + analytics)
  const summary = ui.el('div', { className: 'daily-summary' }, [
    ui.renderDailySummaryCarousel(totals, goals, insights, currentInsightIndex),
  ]);
  container.appendChild(summary);

  // Increment insight index for next view (cycle through insights)
  currentInsightIndex = (currentInsightIndex + 1) % Math.max(insights.length, 1);

  // Meals
  const favorites = store.getFavorites();
  const mealCallbacks = {
    onAdd: (mealType) => openAddFoodModal(mealType),
    onRemove: (mealType, foodId) => {
      store.removeFoodFromMeal(currentDate, mealType, foodId);
      fb.pushDay(currentDate, store.getDay(currentDate));
      render();
    },
    onToggleFav: (food, adding, mealType) => {
      if (adding) {
        store.addFavorite({ ...food, mealType });
        showToast('Added to favorites');
      } else {
        const fav = store.getFavorites().find(f => f.name === food.name);
        if (fav) store.removeFavorite(fav.favId);
        showToast('Removed from favorites');
      }
      fb.pushFavorites(store.getFavorites());
    },
    onFoodClick: (mealType, food) => openFoodDetailsModal(mealType, food),
  };

  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    // Enrich foods with latest COMMON_FOODS data (fills in missing fields like addedSugars)
    const enrichedFoods = day.meals[mealType].map(food => {
      const commonFood = getCommonFood(food.name);
      return commonFood ? { ...commonFood, ...food } : food;
    });
    container.appendChild(ui.renderMealSection(mealType, enrichedFoods, mealCallbacks, favorites));
  }

}

// ── Goals View ──

function renderGoals() {
  const container = ui.$('#view-content');
  container.innerHTML = '';

  const profile = store.getProfile();
  const goals = store.getGoals();
  const profileFilled = !!(profile.sex && profile.birthYear && profile.heightFt);

  // ── Profile Section ──
  const activityOptions = [
    ['sedentary', 'Sedentary (desk job)'],
    ['light', 'Light (1-3 days/wk)'],
    ['moderate', 'Moderate (3-5 days/wk)'],
    ['active', 'Active (6-7 days/wk)'],
    ['very_active', 'Very Active (2x/day)'],
  ];

  const saveProfile = (input) => {
    const updated = {};
    const activeSex = ui.$('.toggle-btn.active', container);
    updated.sex = activeSex ? activeSex.dataset.value : null;
    const byInput = ui.$('[data-profile="birthYear"]', container);
    updated.birthYear = byInput.value ? parseInt(byInput.value) : null;
    const ftInput = ui.$('[data-profile="heightFt"]', container);
    updated.heightFt = ftInput.value ? parseInt(ftInput.value) : null;
    const inInput = ui.$('[data-profile="heightIn"]', container);
    updated.heightIn = inInput.value ? parseInt(inInput.value) : null;
    const actInput = ui.$('[data-profile="activityLevel"]', container);
    updated.activityLevel = actInput.value;
    store.saveProfile(updated);
    fb.pushProfile(updated);

    const weightInput = ui.$('[data-profile="weight"]', container);
    if (weightInput && weightInput.value) {
      store.saveWeight(ui.todayStr(), weightInput.value);
      fb.pushWeight(store.getAllWeightEntries());
    }

    if (store.isUnderage()) {
      renderAgeGate();
      return;
    }

    // Auto-apply TDEE the first time profile is fully filled in (still at defaults)
    const suggested = store.getSuggestedGoals();
    let toastMsg = 'Saved';
    if (suggested && store.goalsAreDefaults()) {
      const newGoals = { ...store.getGoals(), calories: suggested.calories, protein: suggested.protein, carbs: suggested.carbs, fat: suggested.fat };
      store.saveGoals(newGoals);
      fb.pushGoals(newGoals);
      toastMsg = 'Goals updated from TDEE';
      // Re-render so updated nutrition values appear
      renderGoals();
      showToast(toastMsg);
      return;
    }
    flashSaved(input);
  };

  const activitySelect = ui.el('select', {
    className: 'input-select',
    dataset: { profile: 'activityLevel' },
    onChange: (e) => saveProfile(e.target),
  },
    activityOptions.map(([val, label]) => {
      const opt = ui.el('option', { value: val, textContent: label });
      if (profile.activityLevel === val) opt.selected = true;
      return opt;
    })
  );

  const currentWeight = store.getWeight(ui.todayStr());
  const profileSummary = profileFilled
    ? `${profile.sex === 'male' ? 'M' : 'F'} · ${profile.heightFt}'${profile.heightIn || 0}"${currentWeight ? ` · ${currentWeight} lbs` : ''}`
    : null;

  const profileContent = ui.el('div', { className: 'collapsible-content' }, [
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Sex' }),
      ui.el('div', { className: 'toggle-group' }, [
        ui.el('button', {
          className: `toggle-btn ${profile.sex === 'male' ? 'active' : ''}`,
          textContent: 'Male',
          dataset: { profile: 'sex', value: 'male' },
          onClick: (e) => { selectToggle(e.target); saveProfile(e.target); },
        }),
        ui.el('button', {
          className: `toggle-btn ${profile.sex === 'female' ? 'active' : ''}`,
          textContent: 'Female',
          dataset: { profile: 'sex', value: 'female' },
          onClick: (e) => { selectToggle(e.target); saveProfile(e.target); },
        }),
      ]),
    ]),
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Birth year' }),
      ui.el('input', {
        type: 'number',
        className: 'input-goal',
        value: profile.birthYear || '',
        placeholder: 'e.g. 1990',
        dataset: { profile: 'birthYear' },
        onBlur: (e) => saveProfile(e.target),
      }),
    ]),
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Height' }),
      ui.el('div', { className: 'height-inputs' }, [
        ui.el('input', {
          type: 'number',
          className: 'input-height',
          value: profile.heightFt || '',
          placeholder: 'ft',
          dataset: { profile: 'heightFt' },
          onBlur: (e) => saveProfile(e.target),
        }),
        ui.el('span', { textContent: 'ft' }),
        ui.el('input', {
          type: 'number',
          className: 'input-height',
          value: profile.heightIn || '',
          placeholder: 'in',
          dataset: { profile: 'heightIn' },
          onBlur: (e) => saveProfile(e.target),
        }),
        ui.el('span', { textContent: 'in' }),
      ]),
    ]),
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Activity' }),
      activitySelect,
    ]),
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Current weight' }),
      ui.el('div', { className: 'height-inputs' }, [
        ui.el('input', {
          type: 'number',
          className: 'input-height',
          style: 'width:72px',
          value: store.getWeight(ui.todayStr()) || '',
          placeholder: 'lbs',
          step: '0.1',
          dataset: { profile: 'weight' },
          onBlur: (e) => saveProfile(e.target),
        }),
        ui.el('span', { textContent: 'lbs' }),
      ]),
    ]),
  ]);

  container.appendChild(ui.collapsible('Profile', profileSummary, profileContent, { startOpen: !profileFilled }));

  // ── TDEE Suggestion ──
  const suggested = store.getSuggestedGoals();
  if (suggested) {
    const isAdjusted = suggested.description !== 'maintenance';
    const tdeeSummary = `TDEE ${suggested.tdee} cal/day`;

    const tdeeContent = ui.el('div', { className: 'collapsible-content tdee-suggestion-inner' }, [
      ui.el('div', { className: 'tdee-header' }, [
        ui.el('span', { className: 'tdee-label', textContent: 'Estimated TDEE' }),
        ui.el('span', { className: 'tdee-value', textContent: `${suggested.tdee} cal/day` }),
      ]),
      isAdjusted
        ? ui.el('div', { className: 'tdee-adjusted' }, [
            ui.el('span', { className: 'tdee-adjusted-label', textContent: 'Suggested intake' }),
            ui.el('span', { className: 'tdee-adjusted-value', textContent: `${suggested.targetCals} cal/day` }),
            ui.el('span', { className: 'tdee-adjusted-desc', textContent: suggested.description }),
          ])
        : null,
      ui.el('div', { className: 'tdee-detail', textContent: `BMR: ${suggested.bmr} cal — Macros: ${suggested.protein}g protein, ${suggested.carbs}g carbs, ${suggested.fat}g fat` }),
      ui.el('button', {
        className: 'btn-secondary btn-apply-tdee',
        textContent: 'Apply as my goals',
        onClick: () => {
          const current = store.getGoals();
          const tdeeGoals = {
            ...current,
            calories: suggested.calories,
            protein: suggested.protein,
            carbs: suggested.carbs,
            fat: suggested.fat,
          };
          store.saveGoals(tdeeGoals);
          fb.pushGoals(tdeeGoals);
          showToast('Goals updated from TDEE');
          renderGoals();
        },
      }),
    ]);

    container.appendChild(ui.collapsible('TDEE Estimate', tdeeSummary, tdeeContent, { startOpen: false }));
  }

  // ── Nutrition Goals ──
  const goalsCustomized = goals.calories !== 2000 || goals.protein !== 150 || goals.carbs !== 200 || goals.fat !== 65;
  const goalsSummary = `${goals.calories} cal · ${goals.protein}p · ${goals.carbs}c · ${goals.fat}f`;

  const saveNutritionGoals = (input) => {
    const updated = { ...store.getGoals() };
    ui.$$('.input-goal[data-key]', container).forEach(inp => {
      const k = inp.dataset.key;
      if (k === 'weightGoal') return; // handled in its own section
      const val = inp.value.trim();
      updated[k] = parseInt(val) || 0;
    });
    store.saveGoals(updated);
    fb.pushGoals(updated);
    flashSaved(input);
  };

  const nutritionContent = ui.el('div', { className: 'collapsible-content' },
    ['calories', 'protein', 'carbs', 'fat'].map(key => {
      const unitLabel = key === 'calories' ? 'cal' : 'g';
      return ui.el('div', { className: 'goal-row' }, [
        ui.el('label', { textContent: `${ui.capitalize(key)} (${unitLabel})` }),
        ui.el('input', {
          type: 'number',
          className: 'input-goal',
          value: String(goals[key]),
          dataset: { key },
          onBlur: (e) => saveNutritionGoals(e.target),
        }),
      ]);
    }),
  );

  container.appendChild(ui.collapsible('Nutrition Goals', goalsSummary, nutritionContent, { startOpen: !goalsCustomized }));

  // ── Weight Goal ──
  const weightSummary = goals.weightGoal ? `Target: ${goals.weightGoal} lbs` : null;

  const saveWeightGoal = (input) => {
    const val = input.value.trim();
    const current = store.getGoals();
    const wGoals = { ...current, weightGoal: val ? parseFloat(val) : null };
    store.saveGoals(wGoals);
    fb.pushGoals(wGoals);
    flashSaved(input);
  };

  const weightContent = ui.el('div', { className: 'collapsible-content' }, [
    ui.el('div', { className: 'goal-row' }, [
      ui.el('label', { textContent: 'Target weight (lbs)' }),
      ui.el('input', {
        type: 'number',
        className: 'input-goal',
        value: goals.weightGoal ? String(goals.weightGoal) : '',
        placeholder: '—',
        step: '0.1',
        dataset: { key: 'weightGoal' },
        onBlur: (e) => saveWeightGoal(e.target),
      }),
    ]),
  ]);

  container.appendChild(ui.collapsible('Weight Goal', weightSummary, weightContent, { startOpen: !goals.weightGoal }));

  // AI Food Analysis collapsible — paused pending monetization decision
}

function selectToggle(btn) {
  const group = btn.parentElement;
  ui.$$('.toggle-btn', group).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Weight View ──

function renderWeight() {
  const container = ui.$('#view-content');
  container.innerHTML = '';

  const stats = store.getWeightStats();
  const history = store.getWeightHistory(30);

  const section = ui.el('div', { className: 'weight-view' });

  section.appendChild(ui.el('h2', { textContent: 'Weight Tracking' }));

  // Weight entry for today
  const todayWeight = store.getWeight(ui.todayStr());
  const weightInput = ui.el('div', { className: 'weight-today-entry' }, [
    ui.el('label', { textContent: "Today's weight" }),
    ui.el('div', { className: 'weight-today-row' }, [
      ui.el('input', {
        type: 'number',
        className: 'input-weight',
        placeholder: '—',
        value: todayWeight || '',
        step: '0.1',
        onChange: (e) => {
          store.saveWeight(ui.todayStr(), e.target.value);
          fb.pushWeight(store.getAllWeightEntries());
          renderWeight();
        },
      }),
      ui.el('span', { textContent: 'lbs' }),
    ]),
  ]);
  section.appendChild(weightInput);

  // Projection
  const projection = store.getWeightProjection();
  if (projection) {
    let projMsg;
    if (projection.reached) {
      projMsg = `You've reached your goal of ${projection.target} lbs!`;
    } else if (projection.noProgress) {
      const dir = projection.target < projection.current ? 'losing' : 'gaining';
      projMsg = `Your trend isn't currently headed toward ${projection.target} lbs. Keep ${dir === 'losing' ? 'at a deficit' : 'at a surplus'} to start making progress.`;
    } else {
      projMsg = `At ${Math.abs(projection.lbsPerWeek)} lbs/week, you'll reach ${projection.target} lbs around ${ui.formatDate(projection.estDate)} (~${projection.daysToGoal} days).`;
    }
    section.appendChild(ui.el('div', { className: 'weight-projection' }, [
      ui.el('span', { className: 'projection-label', textContent: 'Projection' }),
      ui.el('span', { className: 'projection-msg', textContent: projMsg }),
    ]));
  } else {
    const goals = store.getGoals();
    if (goals.weightGoal) {
      section.appendChild(ui.el('div', { className: 'weight-projection muted' }, [
        ui.el('span', { textContent: 'Log at least 2 days of weight to see a projection.' }),
      ]));
    } else {
      section.appendChild(ui.el('div', { className: 'weight-projection muted' }, [
        ui.el('span', { textContent: 'Set a weight goal in Goals to see a projection.' }),
      ]));
    }
  }

  if (stats) {
    const statsEl = ui.el('div', { className: 'weight-stats' }, [
      ui.el('div', { className: 'stat' }, [
        ui.el('span', { className: 'stat-value', textContent: `${stats.current} lbs` }),
        ui.el('span', { className: 'stat-label', textContent: 'Current' }),
      ]),
      stats.weekChange !== null
        ? ui.el('div', { className: 'stat' }, [
            ui.el('span', {
              className: `stat-value ${stats.weekChange > 0 ? 'up' : stats.weekChange < 0 ? 'down' : ''}`,
              textContent: `${stats.weekChange > 0 ? '+' : ''}${stats.weekChange} lbs`,
            }),
            ui.el('span', { className: 'stat-label', textContent: '7-day change' }),
          ])
        : null,
      ui.el('div', { className: 'stat' }, [
        ui.el('span', {
          className: `stat-value ${stats.totalChange > 0 ? 'up' : stats.totalChange < 0 ? 'down' : ''}`,
          textContent: `${stats.totalChange > 0 ? '+' : ''}${stats.totalChange} lbs`,
        }),
        ui.el('span', { className: 'stat-label', textContent: `Since ${stats.startDate}` }),
      ]),
    ]);
    section.appendChild(statsEl);
  }

  // Chart
  section.appendChild(ui.el('h3', { textContent: 'Last 30 Days' }));
  section.appendChild(ui.renderWeightChart(history));

  // Weight log table
  if (history.length > 0) {
    const table = ui.el('div', { className: 'weight-log' }, [
      ...history.slice().reverse().map((entry, i, arr) => {
        const prev = arr[i + 1];
        const diff = prev ? +(entry.weight - prev.weight).toFixed(1) : null;
        return ui.el('div', { className: 'weight-log-row' }, [
          ui.el('span', { textContent: ui.formatDate(entry.date) }),
          ui.el('span', { textContent: `${entry.weight} lbs` }),
          ui.el('span', {
            className: diff > 0 ? 'up' : diff < 0 ? 'down' : '',
            textContent: diff !== null ? `${diff > 0 ? '+' : ''}${diff}` : '—',
          }),
        ]);
      }),
    ]);
    section.appendChild(table);
  }

  container.appendChild(section);
}

// ── Add Food Modal ──

function openAddFoodModal(mealType) {
  stopActiveCamera();
  const modal = ui.$('#modal');
  const modalBody = ui.$('#modal-body');

  modalBody.innerHTML = '';

  // Extract recent foods for this meal type
  const recents = store.getRecentFoodsByMealType(mealType, 20);

  const state = { results: [], loading: false };

  // Multi-select state for recents/favorites — keyed by food name (lowercased) so the same
  // food can't be selected twice across both lists. Value is the food object to add.
  const selected = new Map();
  let multiBar = null; // sticky bottom action bar (created lazily when first item picked)

  function updateMultiBar() {
    const count = selected.size;
    if (count === 0) {
      if (multiBar) { multiBar.remove(); multiBar = null; }
      return;
    }
    if (!multiBar) {
      multiBar = ui.el('div', { className: 'multi-add-bar' });
      modalBody.appendChild(multiBar);
    }
    multiBar.innerHTML = '';
    multiBar.appendChild(ui.el('span', {
      className: 'multi-count',
      textContent: `${count} selected`,
    }));
    multiBar.appendChild(ui.el('button', {
      className: 'btn-secondary',
      textContent: 'Clear',
      onClick: () => {
        selected.clear();
        // Visually uncheck all rows + drop highlight
        modalBody.querySelectorAll('.multi-check').forEach(c => { c.checked = false; });
        modalBody.querySelectorAll('.result-row.is-selected').forEach(r => r.classList.remove('is-selected'));
        updateMultiBar();
      },
    }));
    multiBar.appendChild(ui.el('button', {
      className: 'btn-primary',
      textContent: `Add ${count} to ${ui.capitalize(mealType)}`,
      onClick: () => {
        const items = Array.from(selected.values());
        items.forEach(food => {
          store.addFoodToMeal(currentDate, mealType, { ...food, servings: 1 });
        });
        fb.pushDay(currentDate, store.getDay(currentDate));
        showToast(`Added ${items.length} item${items.length === 1 ? '' : 's'}`);
        closeModal();
        render();
      },
    }));
  }

  function makeMultiCheckbox(food) {
    const key = food.name.toLowerCase();
    return ui.el('input', {
      type: 'checkbox',
      className: 'multi-check',
      onClick: (e) => e.stopPropagation(),
      onChange: (e) => {
        const row = e.target.closest('.result-row');
        if (e.target.checked) {
          selected.set(key, food);
          row?.classList.add('is-selected');
        } else {
          selected.delete(key);
          row?.classList.remove('is-selected');
        }
        updateMultiBar();
      },
    });
  }

  const searchInput = ui.el('input', {
    type: 'text',
    className: 'input-search',
    placeholder: 'Search foods…',
    onFocus: () => {
      // On mobile, keyboard covers input. Scroll search row to top so user can see input + results.
      setTimeout(() => {
        const searchRow = searchInput.closest('.search-row');
        if (searchRow) searchRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100); // wait for keyboard to appear
    },
  });

  const scanBtn = ui.el('button', {
    className: 'btn-scan',
    title: 'Scan barcode',
    textContent: '📷',
    onClick: () => openBarcodeScanner(mealType),
  });

  // const analyzeBtn = ui.el('button', { className: 'btn-scan', title: 'Analyze plate with AI', textContent: '📸', onClick: () => openPhotoAnalyzer(mealType) }); // paused

  const resultsList = ui.el('div', { className: 'search-results' });

  let apiSearchToken = 0; // cancels stale API responses when query changes

  const doSearch = debounce((query) => {
    if (query.length < 3) {
      resultsList.innerHTML = '';
      state.results = [];
      return;
    }

    // ── Phase 1: instant local results ──
    const myFoodResults = store.searchMyFoods(query);
    const historyResults = store.searchHistory(query);
    const commonResults = searchCommonFoods(query);

    const seen = new Set(myFoodResults.map(f => f.name.toLowerCase()));
    const historyDeduped = historyResults.filter(f => !seen.has(f.name.toLowerCase()));
    historyDeduped.forEach(f => seen.add(f.name.toLowerCase()));
    const commonDeduped = commonResults.filter(f => !seen.has(f.name.toLowerCase()));
    commonDeduped.forEach(f => seen.add(f.name.toLowerCase()));

    state.results = [...myFoodResults, ...historyDeduped, ...commonDeduped];
    renderResults();

    // ── Phase 2: augment with API results in the background ──
    // Skip API entirely if we already have plenty of local matches
    if (state.results.length >= 8) return;

    const token = ++apiSearchToken;
    // Small indicator that more results may be coming
    const hint = ui.el('div', { className: 'search-hint', textContent: 'Searching online…' });
    resultsList.appendChild(hint);

    searchFoodsFromAPI(query, 15, seen).then(apiResults => {
      if (token !== apiSearchToken) return; // query changed, discard
      hint.remove();
      if (apiResults.length === 0) return;
      state.results = [...state.results, ...apiResults];
      renderResults();
    }).catch(() => {
      if (token === apiSearchToken) hint.remove();
    });
  }, 300);

  searchInput.addEventListener('input', () => doSearch(searchInput.value.trim()));

  function renderResults() {
    resultsList.innerHTML = '';
    const modalContent = ui.$('#modal .modal-content');
    // Scroll results into view after a brief delay to let DOM update
    setTimeout(() => { resultsList.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    if (state.results.length === 0) {
      resultsList.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }
    for (const food of state.results) {
      const isMyFood = food.source === 'myfoods';
      const label = food.brand ? `${food.name} (${food.brand})` : food.name;
      const nameEl = ui.el('span', { className: 'result-name' });
      nameEl.textContent = label;
      if (isMyFood) {
        const badge = ui.el('span', { className: 'my-food-badge', textContent: 'My Food' });
        nameEl.appendChild(badge);
      }
      const actions = isMyFood
        ? ui.el('div', { className: 'result-actions' }, [
            ui.el('button', {
              className: 'btn-icon btn-remove',
              textContent: '×',
              title: 'Remove from My Foods',
              onClick: (e) => {
                e.stopPropagation();
                store.deleteMyFood(food.myFoodId);
                fb.pushMyFoods(store.getMyFoods());
                doSearch.flush ? doSearch.flush() : renderResults();
                state.results = state.results.filter(f => f.myFoodId !== food.myFoodId);
                renderResults();
              },
            }),
            ui.el('button', { className: 'btn-icon', textContent: '+' }),
          ])
        : ui.el('button', { className: 'btn-icon', textContent: '+' });

      const row = ui.el('div', { className: 'result-row', onClick: () => selectFood(food) }, [
        ui.el('div', { className: 'result-info' }, [
          nameEl,
          ui.el('span', {
            className: 'result-macros',
            textContent: `${food.calories} cal · ${food.protein}p · ${food.carbs}c · ${food.fat}f  per ${food.servingSize}${food.servingUnit}`,
          }),
        ]),
        actions,
      ]);
      resultsList.appendChild(row);
    }
  }

  function selectFood(food) {
    showServingPicker(food, mealType);
  }

  // Manual entry section
  const saveToLibraryCheckbox = ui.el('input', { type: 'checkbox', id: 'save-to-library' });
  const manualSection = ui.el('div', { className: 'manual-entry' }, [
    ui.el('div', { className: 'divider', textContent: '— or add manually —' }),
    ui.el('input', { type: 'text', className: 'input-manual', placeholder: 'Food name', dataset: { field: 'name' } }),
    ui.el('div', { className: 'manual-row' }, [
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Cal', dataset: { field: 'calories' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Protein', dataset: { field: 'protein' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Carbs', dataset: { field: 'carbs' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Fat', dataset: { field: 'fat' } }),
    ]),
    ui.el('label', { className: 'save-to-library-label' }, [
      saveToLibraryCheckbox,
      ui.el('span', { textContent: 'Save to My Foods library' }),
    ]),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Add',
      onClick: () => {
        const fields = {};
        ui.$$('.input-manual', modalBody).forEach(input => {
          const val = input.value.trim();
          fields[input.dataset.field] = input.type === 'number' ? (parseFloat(val) || 0) : val;
        });
        if (!fields.name) {
          showToast('Please enter a food name');
          return;
        }
        const food = { ...fields, servingSize: '', servingUnit: '', servings: 1, source: 'manual' };
        if (saveToLibraryCheckbox.checked) {
          store.saveMyFood(food);
          fb.pushMyFoods(store.getMyFoods());
        }
        store.addFoodToMeal(currentDate, mealType, food);
        fb.pushDay(currentDate, store.getDay(currentDate));
        closeModal();
        render();
      },
    }),
  ]);

  // Recents section — foods previously logged in this meal type, most recent first
  const recentsSection = recents.length > 0
    ? (() => {
        const section = ui.el('div', { className: 'recents-section' });
        section.appendChild(ui.el('div', { className: 'divider', textContent: '— recent —' }));

        let showingMore = false;

        function renderRecents() {
          const items = section.querySelectorAll('.result-row');
          items.forEach((item, idx) => {
            item.style.display = (idx < 5 || showingMore) ? 'flex' : 'none';
          });

          let moreBtn = section.querySelector('.show-more-recents');
          if (recents.length > 5) {
            if (!moreBtn) {
              moreBtn = ui.el('button', {
                className: 'show-more-recents',
                textContent: `Show ${recents.length - 5} more`,
                onClick: () => {
                  showingMore = !showingMore;
                  moreBtn.textContent = showingMore ? 'Show less' : `Show ${recents.length - 5} more`;
                  renderRecents();
                },
              });
              section.appendChild(moreBtn);
            }
          }
        }

        recents.forEach(food => {
          const checkbox = makeMultiCheckbox(food);
          section.appendChild(
            ui.el('div', { className: 'result-row', onClick: () => showServingPicker(food, mealType) }, [
              checkbox,
              ui.el('div', { className: 'result-info' }, [
                ui.el('span', { className: 'result-name', textContent: food.name }),
                ui.el('span', {
                  className: 'result-macros',
                  textContent: `${food.calories} cal · ${food.protein}p · ${food.carbs}c · ${food.fat}f`,
                }),
              ]),
              ui.el('div', { className: 'fav-actions' }, [
                ui.el('button', {
                  className: 'btn-icon btn-remove',
                  textContent: '×',
                  title: "Don't show this again",
                  onClick: (e) => {
                    e.stopPropagation();
                    store.removeRecentFood(mealType, food.name);
                    // Refresh modal to show updated recents
                    openAddFoodModal(mealType);
                  },
                }),
              ]),
            ])
          );
        });

        renderRecents();
        return section;
      })()
    : null;

  // Favorites section — only show favorites tagged to this meal type (or untagged legacy ones)
  const favs = store.getFavorites().filter(f => !f.mealType || f.mealType === mealType);
  const favsSection = favs.length > 0
    ? ui.el('div', { className: 'favorites-section' }, [
        ui.el('div', { className: 'divider', textContent: '— favorites —' }),
        ...favs.map(fav => {
          const checkbox = makeMultiCheckbox(fav);
          return ui.el('div', { className: 'result-row', onClick: () => showServingPicker(fav, mealType) }, [
            checkbox,
            ui.el('div', { className: 'result-info' }, [
              ui.el('span', { className: 'result-name', textContent: fav.name }),
              ui.el('span', {
                className: 'result-macros',
                textContent: `${fav.calories} cal · ${fav.protein}p · ${fav.carbs}c · ${fav.fat}f`,
              }),
            ]),
            ui.el('div', { className: 'fav-actions' }, [
              ui.el('button', {
                className: 'btn-icon btn-remove',
                textContent: '×',
                title: "Remove favorite and don't show again",
                onClick: (e) => {
                  e.stopPropagation();
                  store.removeFavorite(fav.favId);
                  // Also suppress from recents in this meal type so the food doesn't pop
                  // back tomorrow as a "recent" — matches the user's expectation that X means gone.
                  store.removeRecentFood(mealType, fav.name);
                  fb.pushFavorites(store.getFavorites());
                  openAddFoodModal(mealType);
                },
              }),
            ]),
          ]);
        }),
      ])
    : null;

  // Assemble modal
  modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));
  // Search row first (sticky), then results immediately below for better UX
  modalBody.appendChild(ui.el('div', { className: 'search-row' }, [searchInput, scanBtn]));
  modalBody.appendChild(resultsList);
  // Recents/favorites/manual below, only shown when search is empty
  if (recentsSection) modalBody.appendChild(recentsSection);
  if (favsSection) modalBody.appendChild(favsSection);
  modalBody.appendChild(manualSection);

  modal.classList.add('open');

  // Close handlers
  ui.$('#modal-close').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

function closeModal() {
  stopActiveCamera();
  ui.$('#modal').classList.remove('open');
}

function stopActiveCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(t => t.stop());
    activeCameraStream = null;
  }
}

// ── Food Details Modal (edit quantity and view nutrition) ──

function openFoodDetailsModal(mealType, food) {
  const modal = ui.$('#modal');
  const modalBody = ui.$('#modal-body');
  const goals = store.getGoals();

  modalBody.innerHTML = '';

  const foodModal = ui.renderFoodModal(food, goals, {
    onSave: (newServings) => {
      store.updateFoodQuantity(currentDate, mealType, food.id, newServings);
      fb.pushDay(currentDate, store.getDay(currentDate));
      closeModal();
      render();
    },
    onDelete: () => {
      store.removeFoodFromMeal(currentDate, mealType, food.id);
      fb.pushDay(currentDate, store.getDay(currentDate));
      closeModal();
      render();
    },
  });

  modalBody.appendChild(foodModal);
  modal.classList.add('open');

  // Close handlers
  ui.$('#modal-close').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

// ── Serving Picker (shared by text search and barcode scanner) ──

function showServingPicker(food, mealType) {
  const modalBody = ui.$('#modal-body');
  modalBody.innerHTML = '';
  let servings = 1;

  const preview = ui.el('div', { className: 'serving-preview' });

  function updatePreview() {
    const cals = Math.round(food.calories * servings);
    const p = Math.round(food.protein * servings);
    const c = Math.round(food.carbs * servings);
    const f = Math.round(food.fat * servings);
    preview.textContent = '';
    preview.appendChild(ui.el('strong', { textContent: `${cals} cal` }));
    preview.appendChild(document.createTextNode(` · ${p}p · ${c}c · ${f}f`));
  }

  const servingInput = ui.el('input', {
    type: 'number',
    className: 'input-servings',
    value: '1',
    min: '0.25',
    step: '0.25',
    onInput: (e) => {
      servings = parseFloat(e.target.value) || 1;
      updatePreview();
    },
  });

  updatePreview();

  const label = food.brand ? `${food.name} (${food.brand})` : food.name;
  modalBody.appendChild(ui.el('div', { className: 'serving-picker' }, [
    ui.el('h3', { textContent: label }),
    ui.el('div', { className: 'serving-size-info', textContent: `Serving: ${food.servingSize}${food.servingUnit}` }),
    ui.el('div', { className: 'serving-input-row' }, [
      ui.el('label', { textContent: 'Servings:' }),
      servingInput,
    ]),
    preview,
    ui.el('div', { className: 'serving-actions' }, [
      ui.el('button', {
        className: 'btn-secondary',
        textContent: 'Back',
        onClick: () => openAddFoodModal(mealType),
      }),
      ui.el('button', {
        className: 'btn-primary',
        textContent: 'Add',
        onClick: () => {
          store.addFoodToMeal(currentDate, mealType, { ...food, servings });
          fb.pushDay(currentDate, store.getDay(currentDate));
          render();
          openAddFoodModal(mealType);
        },
      }),
    ]),
  ]));
}

// ── Barcode Scanner ──

async function openBarcodeScanner(mealType) {
  stopActiveCamera();
  const modalBody = ui.$('#modal-body');
  modalBody.innerHTML = '';

  modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));

  const statusEl = ui.el('div', { className: 'scanner-status', textContent: 'Starting camera…' });
  const video = document.createElement('video');
  video.setAttribute('autoplay', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');  // required on iOS
  video.className = 'scanner-video';

  const container = ui.el('div', { className: 'scanner-container' }, [
    video,
    ui.el('div', { className: 'scanner-viewfinder' }),
    statusEl,
  ]);
  modalBody.appendChild(container);
  modalBody.appendChild(ui.el('button', {
    className: 'btn-secondary scanner-back',
    textContent: '← Search instead',
    onClick: () => { stopActiveCamera(); openAddFoodModal(mealType); },
  }));

  // Load BarcodeDetector polyfill on first use if not natively available
  if (!('BarcodeDetector' in window)) {
    try {
      await import('https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/polyfill.min.js');
    } catch {
      statusEl.textContent = 'Barcode scanning not supported on this browser.';
      return;
    }
  }

  let detector;
  try {
    detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  } catch {
    statusEl.textContent = 'Barcode scanning not supported on this device.';
    return;
  }

  // Request rear camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    });
    activeCameraStream = stream;
    video.srcObject = stream;
    await video.play().catch(() => {}); // autoplay may already be playing

    statusEl.textContent = 'Point camera at barcode';
    statusEl.className = 'scanner-status scanning';

    // Poll every 250ms — gives CPU a break vs rAF
    const scanInterval = setInterval(async () => {
      if (!activeCameraStream || video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        if (!barcodes.length) return;

        const code = barcodes[0].rawValue;
        clearInterval(scanInterval);
        if (navigator.vibrate) navigator.vibrate(60);

        statusEl.textContent = `Found ${code} — looking up…`;
        statusEl.className = 'scanner-status found';

        const food = await lookupBarcode(code);
        stopActiveCamera();

        if (food) {
          showServingPicker(food, mealType);
        } else {
          statusEl.textContent = `Barcode ${code} not found in database.`;
          statusEl.className = 'scanner-status error';
          // Let user fall back to manual search
          modalBody.appendChild(ui.el('button', {
            className: 'btn-primary',
            textContent: 'Search manually',
            onClick: () => openAddFoodModal(mealType),
            style: 'margin-top:12px',
          }));
        }
      } catch { /* frame not ready */ }
    }, 250);

  } catch (err) {
    const denied = err.name === 'NotAllowedError';
    statusEl.textContent = denied
      ? 'Camera access denied — please allow camera in your device settings.'
      : `Camera unavailable: ${err.message}`;
    statusEl.className = 'scanner-status error';
  }
}

// ── Photo Analyzer ──

function openPhotoAnalyzer(mealType) {
  const key = localStorage.getItem('mt_openai_key');
  if (!key) {
    showToast('Add your OpenAI key in Goals → AI Food Analysis ✨');
    return;
  }

  const modalBody = ui.$('#modal-body');
  modalBody.innerHTML = '';
  modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));

  const statusEl = ui.el('div', { className: 'analyze-status', textContent: 'Opening camera…' });
  modalBody.appendChild(ui.el('div', { className: 'analyze-loading' }, [
    ui.el('div', { className: 'analyze-spinner' }),
    statusEl,
  ]));
  modalBody.appendChild(ui.el('button', {
    className: 'btn-secondary scanner-back',
    textContent: '← Search instead',
    onClick: () => openAddFoodModal(mealType),
  }));

  // Hidden file input — no `capture` so user can choose camera or library
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.onchange = async () => {
    document.body.removeChild(fileInput);
    const file = fileInput.files[0];
    if (!file) { openAddFoodModal(mealType); return; }

    statusEl.textContent = 'Analyzing your photo…';

    try {
      const foods = await analyzePhoto(file);
      showAnalyzeResults(foods, mealType);
    } catch (err) {
      if (err.code === 'no_key' || err.code === 'auth_error') {
        showToast(err.code === 'auth_error' ? 'Invalid API key — check Goals → AI Food Analysis' : 'API key missing');
        openAddFoodModal(mealType);
      } else {
        modalBody.innerHTML = '';
        modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));
        modalBody.appendChild(ui.el('p', { className: 'analyze-error', textContent: `Analysis failed: ${err.message}` }));
        modalBody.appendChild(ui.el('div', { className: 'serving-actions', style: 'margin-top:16px' }, [
          ui.el('button', { className: 'btn-secondary', textContent: '← Try again', onClick: () => openPhotoAnalyzer(mealType) }),
          ui.el('button', { className: 'btn-primary',   textContent: 'Search instead', onClick: () => openAddFoodModal(mealType) }),
        ]));
      }
    }
  };

  // Slight delay so the modal UI paints before the system sheet appears
  setTimeout(() => fileInput.click(), 80);
}

function showAnalyzeResults(foods, mealType) {
  const modalBody = ui.$('#modal-body');
  modalBody.innerHTML = '';
  modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));
  modalBody.appendChild(ui.el('p', {
    className: 'analyze-caption',
    textContent: `Found ${foods.length} item${foods.length === 1 ? '' : 's'} — adjust servings and confirm:`,
  }));

  // Per-item state: checked + servings multiplier
  const states = foods.map(() => ({ checked: true, servings: 1 }));

  const rows = foods.map((food, i) => {
    const macroEl = ui.el('span', { className: 'analyze-item-macros' });

    function refreshMacros() {
      const s = states[i].servings;
      macroEl.textContent = `${Math.round(food.calories * s)} cal · ${Math.round(food.protein * s)}p · ${Math.round(food.carbs * s)}c · ${Math.round(food.fat * s)}f`;
    }
    refreshMacros();

    const checkbox = ui.el('input', {
      type: 'checkbox',
      className: 'analyze-item-check',
      checked: true,
      onChange: (e) => {
        states[i].checked = e.target.checked;
        row.classList.toggle('unchecked', !e.target.checked);
      },
    });

    const servingsInput = ui.el('input', {
      type: 'number',
      className: 'analyze-item-servings',
      value: '1',
      min: '0.25',
      step: '0.25',
      onInput: (e) => {
        states[i].servings = parseFloat(e.target.value) || 1;
        refreshMacros();
      },
    });

    const row = ui.el('div', { className: 'analyze-item' }, [
      checkbox,
      ui.el('div', { className: 'analyze-item-info' }, [
        ui.el('span', { className: 'analyze-item-name', textContent: food.name }),
        ui.el('span', { className: 'analyze-item-portion', textContent: `est. ${food.servingSize} ${food.servingUnit}` }),
        macroEl,
      ]),
      ui.el('div', { className: 'analyze-item-qty' }, [
        ui.el('span', { className: 'analyze-qty-label', textContent: '×' }),
        servingsInput,
      ]),
    ]);
    return row;
  });

  modalBody.appendChild(ui.el('div', { className: 'analyze-results' }, rows));
  modalBody.appendChild(ui.el('div', { className: 'serving-actions', style: 'margin-top:16px' }, [
    ui.el('button', {
      className: 'btn-secondary',
      textContent: '← Try again',
      onClick: () => openPhotoAnalyzer(mealType),
    }),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Add selected',
      onClick: () => {
        const toAdd = foods.filter((_, i) => states[i].checked);
        if (!toAdd.length) { showToast('No items selected'); return; }
        foods.forEach((food, i) => {
          if (!states[i].checked) return;
          store.addFoodToMeal(currentDate, mealType, { ...food, servings: states[i].servings });
        });
        fb.pushDay(currentDate, store.getDay(currentDate));
        closeModal();
        render();
        showToast(`Added ${toAdd.length} item${toAdd.length === 1 ? '' : 's'}`);
      },
    }),
  ]));
}

// ── Toast ──

function showToast(msg) {
  const toast = ui.$('#toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// Quick green-border flash on a field after autosave — quieter than a toast for every blur.
function flashSaved(el) {
  if (!el || !el.classList) return;
  el.classList.add('saved');
  setTimeout(() => el.classList.remove('saved'), 800);
}
