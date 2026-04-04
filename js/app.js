// app.js — Main entry point
import * as store from './store.js';
import { searchCommonFoods, searchFoodsFromAPI, lookupBarcode, analyzePhoto, debounce } from './api.js';
import * as ui from './ui.js';
import * as fb from './firebase.js';

let currentDate = ui.todayStr();
let currentView = 'daily'; // daily | goals | weight
let activeCameraStream = null; // track live camera so closeModal can stop it

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  // Deduplicate favorites that accumulated from the add-without-check bug
  store.replaceFavorites(store.getFavorites());
  initTheme();
  initSW();
  if (store.isUnderage()) {
    renderAgeGate();
    return;
  }
  render();
  bindNav();
  initAuth();
});

// ── Service Worker update detection ──

function initSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then(reg => {
    // A SW may already be waiting (e.g. user reopened the PWA after a deploy)
    if (reg.waiting) { showUpdateBanner(reg.waiting); return; }

    // Watch for a new SW installing during this session
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });
  });
}

function showUpdateBanner(worker) {
  const banner = ui.$('#update-banner');
  banner.classList.add('show');
  ui.$('#update-banner-btn').addEventListener('click', () => {
    // Tell the waiting SW to take over, then reload to pick up new assets
    worker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 250);
  });
}

// ── Theme ──

function initTheme() {
  const saved = localStorage.getItem('mt_theme'); // 'dark' | 'light' | null
  if (saved) document.documentElement.classList.add(saved);

  const btn = ui.el('button', {
    className: 'theme-toggle',
    title: 'Toggle dark/light mode',
    textContent: getThemeIcon(),
    onClick: () => {
      const root = document.documentElement;
      const isDark = root.classList.contains('dark') ||
        (!root.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.remove('dark', 'light');
      if (isDark) {
        root.classList.add('light');
        localStorage.setItem('mt_theme', 'light');
      } else {
        root.classList.add('dark');
        localStorage.setItem('mt_theme', 'dark');
      }
      btn.textContent = getThemeIcon();
    },
  });

  document.querySelector('.date-nav').prepend(btn);
}

function getThemeIcon() {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark') ||
    (!root.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? '☀️' : '🌙';
}

// ── Auth ──

function initAuth() {
  fb.handleRedirectResult(); // handle mobile redirect sign-in return
  renderAuthButton(null);
  fb.onUserChange(async user => {
    renderAuthButton(user);
    if (user) {
      showToast('Signed in — syncing...');
      await fb.pullFromCloud(store);
      render();
      showToast('Synced');
    }
  });
}

function renderAuthButton(user) {
  const existing = document.getElementById('auth-btn');
  if (existing) existing.remove();

  const btn = ui.el('button', {
    id: 'auth-btn',
    className: 'auth-btn',
    textContent: user ? (user.displayName?.split(' ')[0] || 'Account') : 'Sign in',
    title: user ? 'Sign out' : 'Sign in with Google to sync across devices',
    onClick: async () => {
      if (user) {
        await fb.signOutUser();
        showToast('Signed out');
      } else {
        try {
          await fb.signInWithGoogle();
        } catch (e) {
          showToast('Sign in failed: ' + (e.code || e.message || 'unknown error'));
        }
      }
    },
  });

  document.querySelector('.date-nav').appendChild(btn);
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
  ui.$('#date-display').textContent = ui.formatDate(currentDate);
  ui.$('#btn-next').disabled = currentDate >= ui.todayStr();

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

  // Summary rings
  const summary = ui.el('div', { className: 'daily-summary' }, [
    ui.renderDailySummaryRings(totals, goals),
  ]);
  container.appendChild(summary);

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
  };

  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    container.appendChild(ui.renderMealSection(mealType, day.meals[mealType], mealCallbacks, favorites));
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

  const activitySelect = ui.el('select', { className: 'input-select', dataset: { profile: 'activityLevel' } },
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
          onClick: (e) => { selectToggle(e.target); },
        }),
        ui.el('button', {
          className: `toggle-btn ${profile.sex === 'female' ? 'active' : ''}`,
          textContent: 'Female',
          dataset: { profile: 'sex', value: 'female' },
          onClick: (e) => { selectToggle(e.target); },
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
        }),
        ui.el('span', { textContent: 'ft' }),
        ui.el('input', {
          type: 'number',
          className: 'input-height',
          value: profile.heightIn || '',
          placeholder: 'in',
          dataset: { profile: 'heightIn' },
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
        }),
        ui.el('span', { textContent: 'lbs' }),
      ]),
    ]),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Save Profile',
      onClick: () => {
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

        // Save weight if provided
        const weightInput = ui.$('[data-profile="weight"]', container);
        if (weightInput && weightInput.value) {
          store.saveWeight(ui.todayStr(), weightInput.value);
          fb.pushWeight(store.getAllWeightEntries());
        }

        if (store.isUnderage()) {
          renderAgeGate();
          return;
        }

        // Auto-apply TDEE if goals are still at defaults
        const suggested = store.getSuggestedGoals();
        if (suggested && store.goalsAreDefaults()) {
          const newGoals = { ...store.getGoals(), calories: suggested.calories, protein: suggested.protein, carbs: suggested.carbs, fat: suggested.fat };
          store.saveGoals(newGoals);
          fb.pushGoals(newGoals);
          showToast('Profile saved — goals updated from TDEE');
        } else {
          showToast('Profile saved');
        }
        renderGoals();
      },
    }),
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

  const nutritionContent = ui.el('div', { className: 'collapsible-content' }, [
    ...['calories', 'protein', 'carbs', 'fat'].map(key => {
      const unitLabel = key === 'calories' ? 'cal' : 'g';
      return ui.el('div', { className: 'goal-row' }, [
        ui.el('label', { textContent: `${ui.capitalize(key)} (${unitLabel})` }),
        ui.el('input', {
          type: 'number',
          className: 'input-goal',
          value: String(goals[key]),
          dataset: { key },
        }),
      ]);
    }),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Save Goals',
      onClick: () => {
        const updated = {};
        ui.$$('.input-goal', container).forEach(input => {
          if (!input.dataset.key) return;
          const val = input.value.trim();
          if (input.dataset.key === 'weightGoal') {
            updated.weightGoal = val ? parseFloat(val) : null;
          } else {
            updated[input.dataset.key] = parseInt(val) || 0;
          }
        });
        store.saveGoals(updated);
        fb.pushGoals(updated);
        showToast('Goals saved');
        renderGoals();
      },
    }),
  ]);

  container.appendChild(ui.collapsible('Nutrition Goals', goalsSummary, nutritionContent, { startOpen: !goalsCustomized }));

  // ── Weight Goal ──
  const weightSummary = goals.weightGoal ? `Target: ${goals.weightGoal} lbs` : null;

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
      }),
    ]),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Save Weight Goal',
      onClick: () => {
        const input = ui.$('[data-key="weightGoal"]', container);
        const val = input.value.trim();
        const current = store.getGoals();
        const wGoals = { ...current, weightGoal: val ? parseFloat(val) : null };
        store.saveGoals(wGoals);
        fb.pushGoals(wGoals);
        showToast('Weight goal saved');
        renderGoals();
      },
    }),
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

  const state = { results: [], loading: false };

  const searchInput = ui.el('input', {
    type: 'text',
    className: 'input-search',
    placeholder: 'Search foods…',
    autofocus: 'true',
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
    modalContent.scrollTop = 0;
    setTimeout(() => { modalContent.scrollTop = 0; }, 300);
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

  // Favorites section — only show favorites tagged to this meal type (or untagged legacy ones)
  const favs = store.getFavorites().filter(f => !f.mealType || f.mealType === mealType);
  const favsSection = favs.length > 0
    ? ui.el('div', { className: 'favorites-section' }, [
        ui.el('div', { className: 'divider', textContent: '— favorites —' }),
        ...favs.map(fav =>
          ui.el('div', { className: 'result-row', onClick: () => showServingPicker(fav, mealType) }, [
            ui.el('div', { className: 'result-info' }, [
              ui.el('span', { className: 'result-name', textContent: fav.name }),
              ui.el('span', {
                className: 'result-macros',
                textContent: `${fav.calories} cal · ${fav.protein}p · ${fav.carbs}c · ${fav.fat}f`,
              }),
            ]),
            ui.el('div', { className: 'fav-actions' }, [
              ui.el('button', { className: 'btn-icon', textContent: '+' }),
              ui.el('button', {
                className: 'btn-icon btn-remove',
                textContent: '×',
                onClick: (e) => {
                  e.stopPropagation();
                  store.removeFavorite(fav.favId);
                  fb.pushFavorites(store.getFavorites());
                  openAddFoodModal(mealType);
                },
              }),
            ]),
          ])
        ),
      ])
    : null;

  // Assemble modal
  modalBody.appendChild(ui.el('h2', { textContent: `Add to ${ui.capitalize(mealType)}` }));
  modalBody.appendChild(ui.el('div', { className: 'search-row' }, [searchInput, scanBtn]));
  modalBody.appendChild(resultsList);
  if (favsSection) modalBody.appendChild(favsSection);
  modalBody.appendChild(manualSection);

  modal.classList.add('open');
  searchInput.focus();

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

// Set up global food item click handler
window.foodItemClickHandler = (mealType, food) => {
  openFoodDetailsModal(mealType, food);
};

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
    preview.innerHTML = `<strong>${cals} cal</strong> · ${p}p · ${c}c · ${f}f`;
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
          closeModal();
          render();
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
