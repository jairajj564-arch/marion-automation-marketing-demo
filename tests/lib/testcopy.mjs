// Builds the TEST COPY of a lane: same Code/IF/Loop/Wait nodes, but
//  - the trigger becomes a Webhook (so the test can start a run on demand),
//  - Google Sheets / Gmail / Telegram nodes become HTTP Request nodes that talk to the local mock,
//  - Gemini / Groq HTTP nodes are pointed at the mock and lose their credentials.
// The lane JSON that is committed is never changed.
import { readFileSync } from 'node:fs';
import { uuid } from '../build/lib.mjs';

const body = (obj) => `={{ JSON.stringify(${obj}) }}`;
const KEYS = { SETTINGS: 'key', BRIEF: 'key', CONTENT: 'content_id', LEADS: 'lead_id', PROSPECTS: 'prospect_id', SEQUENCES: 'step_key', EVENTS_LOG: 'event_id', DASHBOARD: 'metric_key' };

function httpNode(node, path, jsonBody, mock, extra = {}) {
  const { credentials, ...rest } = node;
  return {
    ...rest,
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: { method: 'POST', url: `http://127.0.0.1:${mock}${path}`, sendBody: true, specifyBody: 'json', jsonBody, options: { timeout: 20000 } },
    ...extra,
  };
}

export function makeTestCopy(file, { mockPort, webhookPath }) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  wf.name = `TEST ${wf.name}`;
  wf.nodes = wf.nodes.map((node) => {
    const p = node.parameters;
    switch (node.type) {
      case 'n8n-nodes-base.scheduleTrigger':
      case 'n8n-nodes-base.manualTrigger': {
        const { notes, notesInFlow, ...rest } = node;
        return { ...rest, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: uuid(`webhook|${webhookPath}`),
          parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'lastNode', options: {} } };
      }
      case 'n8n-nodes-base.googleSheets': {
        const tab = p.sheetName.value;
        if (p.operation === 'read') return httpNode(node, '/sheets', body(`{ op: 'read', tab: '${tab}' }`), mockPort);
        const key = p.columns?.matchingColumns?.[0] ?? KEYS[tab];
        return httpNode(node, '/sheets', body(`{ op: '${p.operation}', tab: '${tab}', key: '${key}', row: $json }`), mockPort);
      }
      case 'n8n-nodes-base.gmail':
        return httpNode(node, '/gmail', body('{ to: $json.safe_to, subject: $json.subject, html: $json.html, sender_name: $json.sender_name }'), mockPort);
      case 'n8n-nodes-base.telegram':
        return httpNode(node, '/telegram', body('{ chat_id: $json.chat_id, text: $json.text }'), mockPort);
      case 'n8n-nodes-base.httpRequest': {
        const gem = String(p.url).includes('generativelanguage');
        const { credentials, ...rest } = node;
        return { ...rest, parameters: { ...p, url: gem ? `=http://127.0.0.1:${mockPort}/gemini/{{ $json.gemini_model }}` : `http://127.0.0.1:${mockPort}/groq`, authentication: 'none' } };
      }
      default:
        return node;
    }
  });
  // Fast tests: keep Wait nodes, the lane's settings make them short.
  return wf;
}
