import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/indicators.js';

export function registerIndicatorTools(server) {
  server.tool('indicator_set_inputs', 'Change indicator/study input values (e.g., length, source, period)', {
    entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
    inputs: z.string().describe('JSON string of input overrides, e.g. \'{"length": 50, "source": "close"}\'. Keys are input IDs, values are the new values.'),
    chart_index: z.coerce.number().int().min(0).optional().describe('Pane index in a multi-chart layout (from pane_list). Omit to auto-find the study across all panes.'),
  }, async ({ entity_id, inputs, chart_index }) => {
    try { return jsonResult(await core.setInputs({ entity_id, inputs, chart_index })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('indicator_toggle_visibility', 'Show or hide an indicator/study on the chart', {
    entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
    visible: z.coerce.boolean().describe('true to show, false to hide'),
    chart_index: z.coerce.number().int().min(0).optional().describe('Pane index in a multi-chart layout (from pane_list). Omit to auto-find the study across all panes.'),
  }, async ({ entity_id, visible, chart_index }) => {
    try { return jsonResult(await core.toggleVisibility({ entity_id, visible, chart_index })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
