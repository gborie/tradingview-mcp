/**
 * Core indicator settings logic.
 */
import { evaluate, safeString } from '../connection.js';

/**
 * Build a JS snippet that locates a study by id across panes and binds
 * `var study` / `var foundIdx`. When chart_index is provided, only that pane
 * is searched; otherwise every pane is scanned (so callers don't need to know
 * which pane a study lives on — fixes the active-pane-only "Study not found").
 * The enclosing IIFE must early-return { error } when `study` is falsy.
 */
function studyLocator(entity_id, chart_index) {
  let idxExpr = 'null';
  if (!(chart_index === undefined || chart_index === null || chart_index === '')) {
    const idx = Number(chart_index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new Error(`chart_index must be a non-negative integer (0 = first pane), got: ${chart_index}`);
    }
    idxExpr = String(idx);
  }
  return `
      var api = window.TradingViewApi;
      var n = api._chartWidgetCollection.getAll().length;
      var __id = ${safeString(entity_id)};
      var __idx = ${idxExpr};
      var study = null, foundIdx = null;
      if (__idx !== null) {
        if (__idx >= n) return { error: 'chart_index ' + __idx + ' out of range (have ' + n + ' pane(s))' };
        study = api.chart(__idx).getStudyById(__id); foundIdx = __idx;
      } else {
        for (var __i = 0; __i < n; __i++) {
          var __s = api.chart(__i).getStudyById(__id);
          if (__s) { study = __s; foundIdx = __i; break; }
        }
      }
      if (!study) return { error: 'Study not found on any pane: ' + __id };`;
}

export async function setInputs({ entity_id, inputs: inputsRaw, chart_index }) {
  const inputs = inputsRaw ? (typeof inputsRaw === 'string' ? JSON.parse(inputsRaw) : inputsRaw) : undefined;
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (!inputs || typeof inputs !== 'object' || Object.keys(inputs).length === 0) {
    throw new Error('inputs must be a non-empty object, e.g. { length: 50 }');
  }

  const inputsJson = JSON.stringify(inputs);
  const locate = studyLocator(entity_id, chart_index);

  const result = await evaluate(`
    (function() {
      ${locate}
      var currentInputs = study.getInputValues();
      var overrides = ${inputsJson};
      var updatedKeys = {};
      for (var i = 0; i < currentInputs.length; i++) {
        if (overrides.hasOwnProperty(currentInputs[i].id)) {
          currentInputs[i].value = overrides[currentInputs[i].id];
          updatedKeys[currentInputs[i].id] = overrides[currentInputs[i].id];
        }
      }
      study.setInputValues(currentInputs);
      return { updated_inputs: updatedKeys, chart_index: foundIdx };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, chart_index: result.chart_index, updated_inputs: result.updated_inputs };
}

export async function toggleVisibility({ entity_id, visible, chart_index }) {
  if (!entity_id) throw new Error('entity_id is required. Use chart_get_state to find study IDs.');
  if (typeof visible !== 'boolean') throw new Error('visible must be a boolean (true or false)');

  const locate = studyLocator(entity_id, chart_index);

  const result = await evaluate(`
    (function() {
      ${locate}
      study.setVisible(${visible});
      var actualVisible = study.isVisible();
      return { visible: actualVisible, chart_index: foundIdx };
    })()
  `);

  if (result && result.error) throw new Error(result.error);
  return { success: true, entity_id, chart_index: result.chart_index, visible: result.visible };
}
