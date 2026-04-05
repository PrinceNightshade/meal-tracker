// ui-analytics.js — Analytics card rendering
import { el } from './ui.js';

/**
 * Render a single analytics insight as a card
 * @param {Object} insight - { pattern, severity, callout, stats }
 * @returns {HTMLElement} Card DOM element
 */
export function renderInsightDetail(insight) {
  const { callout, stats } = insight;

  // Stats display (flexible based on what's in stats object)
  const statsLines = [];
  if (stats.message) {
    statsLines.push(stats.message);
  } else {
    if (stats.actual !== undefined && stats.goal !== undefined && stats.metric) {
      statsLines.push(`${stats.actual} / ${stats.goal} ${stats.metric}`);
    } else if (stats.actual !== undefined && stats.daily_goal !== undefined && stats.metric) {
      statsLines.push(`${stats.actual} ${stats.metric} (goal: ${stats.daily_goal}${stats.period ? ` / ${stats.period}` : ''})`);
    } else if (stats.refined !== undefined && stats.whole !== undefined) {
      statsLines.push(`Refined: ${stats.refined} | Whole: ${stats.whole} (${stats.metric})`);
    } else if (stats.actual !== undefined && stats.variance !== undefined) {
      statsLines.push(`Avg: ${stats.actual} cal | Variance: ±${stats.variance} cal`);
    }
  }

  return el('div', { className: 'analytics-insight' }, [
    el('div', { className: 'insight-callout', textContent: callout }),
    el('div', { className: 'insight-stats' }, statsLines.map(line =>
      el('div', { className: 'stat-line', textContent: line })
    )),
  ]);
}

/**
 * Render the analytics card for the carousel
 * @param {Array} insights - Array of insight objects from analyzeFoodHistory
 * @param {Number} currentIndex - Index of current insight to display
 * @returns {HTMLElement} Analytics card wrapper
 */
export function renderAnalyticsCard(insights, currentIndex = 0) {
  if (!insights || insights.length === 0) {
    return el('div', { className: 'analytics-card-wrapper' }, [
      el('div', { className: 'analytics-card' }, [
        el('div', { className: 'analytics-empty', textContent: 'Log some meals to see insights!' }),
      ]),
    ]);
  }

  // Ensure currentIndex is valid
  const safeIndex = currentIndex % insights.length;
  const insight = insights[safeIndex];

  return el('div', { className: 'analytics-card-wrapper' }, [
    el('div', { className: 'analytics-card' }, [
      renderInsightDetail(insight),
      el('div', { className: 'insight-indicator' }, [
        el('span', { textContent: `${safeIndex + 1} / ${insights.length}` }),
      ]),
    ]),
  ]);
}
