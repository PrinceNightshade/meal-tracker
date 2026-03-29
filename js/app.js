// app.js — Main entry point
import * as store from './store.js';
import { searchFoods, lookupBarcode, debounce } from './api.js';
import * as ui from './ui.js';

let currentDate = ui.todayStr();
let currentView = 'daily'; // daily | goals | weight

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  if (store.isUnderage()) {
    renderAgeGate();
    return;
  }
  render();
  bindNav();
});

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
  const mealCallbacks = {
    onAdd: (mealType) => openAddFoodModal(mealType),
    onRemove: (mealType, foodId) => {
      store.removeFoodFromMeal(currentDate, mealType, foodId);
      render();
    },
    onToggleFav: (food) => {
      store.addFavorite(food);
      showToast('Added to favorites');
    },
  };

  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    container.appendChild(ui.renderMealSection(mealType, day.meals[mealType], mealCallbacks));
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

        // Save weight if provided
        const weightInput = ui.$('[data-profile="weight"]', container);
        if (weightInput && weightInput.value) {
          store.saveWeight(ui.todayStr(), weightInput.value);
        }

        if (store.isUnderage()) {
          renderAgeGate();
          return;
        }

        // Auto-apply TDEE if goals are still at defaults
        const suggested = store.getSuggestedGoals();
        if (suggested && store.goalsAreDefaults()) {
          const current = store.getGoals();
          store.saveGoals({
            ...current,
            calories: suggested.calories,
            protein: suggested.protein,
            carbs: suggested.carbs,
            fat: suggested.fat,
          });
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
          store.saveGoals({
            ...current,
            calories: suggested.calories,
            protein: suggested.protein,
            carbs: suggested.carbs,
            fat: suggested.fat,
          });
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
        store.saveGoals({ ...current, weightGoal: val ? parseFloat(val) : null });
        showToast('Weight goal saved');
        renderGoals();
      },
    }),
  ]);

  container.appendChild(ui.collapsible('Weight Goal', weightSummary, weightContent, { startOpen: !goals.weightGoal }));
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
  const modal = ui.$('#modal');
  const modalBody = ui.$('#modal-body');

  modalBody.innerHTML = '';

  const state = { results: [], loading: false };

  const searchInput = ui.el('input', {
    type: 'text',
    className: 'input-search',
    placeholder: 'Search foods (e.g. "chicken breast")...',
    autofocus: 'true',
  });

  const resultsList = ui.el('div', { className: 'search-results' });

  const doSearch = debounce(async (query) => {
    if (query.length < 3) {
      resultsList.innerHTML = '';
      return;
    }
    resultsList.innerHTML = '<div class="loading">Searching...</div>';
    try {
      state.results = await searchFoods(query);
      renderResults();
    } catch (err) {
      resultsList.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }, 500);

  searchInput.addEventListener('input', () => doSearch(searchInput.value.trim()));

  function renderResults() {
    resultsList.innerHTML = '';
    if (state.results.length === 0) {
      resultsList.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }
    for (const food of state.results) {
      const label = food.brand ? `${food.name} (${food.brand})` : food.name;
      const row = ui.el('div', { className: 'result-row', onClick: () => selectFood(food) }, [
        ui.el('div', { className: 'result-info' }, [
          ui.el('span', { className: 'result-name', textContent: label }),
          ui.el('span', {
            className: 'result-macros',
            textContent: `${food.calories} cal · ${food.protein}p · ${food.carbs}c · ${food.fat}f  per ${food.servingSize}${food.servingUnit}`,
          }),
        ]),
        ui.el('button', { className: 'btn-icon', textContent: '+' }),
      ]);
      resultsList.appendChild(row);
    }
  }

  function selectFood(food) {
    showServingPicker(food);
  }

  function showServingPicker(food) {
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
            closeModal();
            render();
          },
        }),
      ]),
    ]));
  }

  // Manual entry section
  const manualSection = ui.el('div', { className: 'manual-entry' }, [
    ui.el('div', { className: 'divider', textContent: '— or add manually —' }),
    ui.el('input', { type: 'text', className: 'input-manual', placeholder: 'Food name', dataset: { field: 'name' } }),
    ui.el('div', { className: 'manual-row' }, [
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Cal', dataset: { field: 'calories' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Protein', dataset: { field: 'protein' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Carbs', dataset: { field: 'carbs' } }),
      ui.el('input', { type: 'number', className: 'input-manual', placeholder: 'Fat', dataset: { field: 'fat' } }),
    ]),
    ui.el('button', {
      className: 'btn-primary',
      textContent: 'Add Manual Entry',
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
        store.addFoodToMeal(currentDate, mealType, {
          ...fields,
          servingSize: '',
          servingUnit: '',
          servings: 1,
          source: 'manual',
        });
        closeModal();
        render();
      },
    }),
  ]);

  // Favorites section
  const favs = store.getFavorites();
  const favsSection = favs.length > 0
    ? ui.el('div', { className: 'favorites-section' }, [
        ui.el('div', { className: 'divider', textContent: '— favorites —' }),
        ...favs.map(fav =>
          ui.el('div', { className: 'result-row', onClick: () => selectFood(fav) }, [
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
  modalBody.appendChild(searchInput);
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
  ui.$('#modal').classList.remove('open');
}

// ── Toast ──

function showToast(msg) {
  const toast = ui.$('#toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
