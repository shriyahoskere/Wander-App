/*
  extract-claude.js - sends your extraction prompt to Claude and reads back the table.

  What it is for: when a session is saved and an Anthropic key is in your .env file, the prompt
  (extract-prompt.js, word for word, with the session start time and the timestamped transcript
  filled in) goes to Claude. Claude answers by filling in a form with exactly the table's columns
  and the three sections after it, so the page can show it as a table. Nothing else is added to
  your instructions except one closing line saying to answer through that form.

  Faithfulness check: every "exact transcript excerpt" Claude returns is looked up in the
  transcript. Any that is not there word for word is flagged on screen, never silently kept.

  Request (Anthropic Messages API): POST {anthropicApiBase}/v1/messages with headers x-api-key,
  anthropic-version: 2023-06-01, and anthropic-dangerous-direct-browser-access: true (needed
  because this page talks to Claude straight from the browser; your key stays on your Mac).
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  var STATUSES = ['committed', 'proposed', 'observation', 'hypothesis', 'not applicable'];

  // The form Claude fills in: one field per column of your table, plus the three closing sections.
  var TOOL = {
    name: 'record_extraction',
    description: 'Record the extraction table and the sections that follow it.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array', description: 'One entry per table row, in transcript order.',
          items: {
            type: 'object',
            properties: {
              order: { type: 'integer', description: '1. Order' },
              timestamp: { type: 'string', description: '2. Timestamp exactly as supplied in the transcript (e.g. 04:12), or "not available"' },
              category: { type: 'string', enum: ['TASK', 'GOAL', 'REFLECTION', 'CONCEPT', 'STORY', 'QUOTE'], description: '3. Primary category' },
              item: { type: 'string', description: '4. Item: a concise description' },
              status: { type: 'string', enum: STATUSES, description: '5. Status' },
              excerpts: { type: 'array', items: { type: 'string' }, description: '6. Exact transcript excerpt(s), copied character for character; one string per source span' },
              paraphrase: { type: 'string', description: '7. Polished paraphrase (optional; empty string if none)' },
              links: { type: 'array', items: { type: 'integer' }, description: '8. Linked item numbers (empty if none)' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '9. Confidence' },
              confidence_reason: { type: 'string', description: 'Brief reason, required when confidence is low' }
            },
            required: ['order', 'timestamp', 'category', 'item', 'status', 'excerpts', 'links', 'confidence']
          }
        },
        unclassified: {
          type: 'array', description: 'Unclassified but potentially relevant passages.',
          items: { type: 'object', properties: { excerpt: { type: 'string' }, timestamp: { type: 'string' }, reason: { type: 'string' } }, required: ['excerpt', 'reason'] }
        },
        category_count: {
          type: 'object', description: 'A category count, including zero for empty categories.',
          properties: { TASK: { type: 'integer' }, GOAL: { type: 'integer' }, REFLECTION: { type: 'integer' }, CONCEPT: { type: 'integer' }, STORY: { type: 'integer' }, QUOTE: { type: 'integer' } },
          required: ['TASK', 'GOAL', 'REFLECTION', 'CONCEPT', 'STORY', 'QUOTE']
        },
        note: { type: 'string', description: 'A short note identifying any missing timestamps or ambiguous wording.' }
      },
      required: ['items', 'unclassified', 'category_count', 'note']
    }
  };
  VS.EXTRACTION_TOOL = TOOL;
  VS.EXTRACTION_CLOSING = 'Return your answer by calling the record_extraction tool: one entry in items per table row, then the unclassified passages, the category count and the note.';

  function plain(status, body) {
    if (status === 401 || status === 403) { return 'Claude did not accept the Anthropic key in your .env file.'; }
    if (status === 404) { return 'Claude could not find that model. Choose another in Settings, "Sorting your thoughts".'; }
    if (status === 429 || status === 529) { return 'Claude is busy or the account hit a limit (error ' + status + '). The offline sort is shown instead.'; }
    if (status === 400 && /credit|billing/i.test(body || '')) { return 'The Anthropic account has no credits left.'; }
    return 'Claude could not sort this session (error ' + status + ').';
  }

  // Normalise spaces and quote marks so a faithful excerpt is not flagged for typography alone.
  function norm(s) { return String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /* Check each excerpt is in the transcript word for word. Returns the result with flags set. */
  VS.checkExcerpts = function (result, utterances) {
    var hay = norm((utterances || []).map(function (u) { return u.text; }).join(' '));
    result.items.forEach(function (it) {
      it.excerptFound = it.excerpts.map(function (e) { var n = norm(e).replace(/^\.\.\.|\.\.\.$/g, '').replace(/…/g, '').trim(); return !n || hay.indexOf(n) >= 0; });
    });
    return result;
  };

  /* Turn Claude's form into the same shape the offline processor gives. */
  VS.normaliseExtraction = function (input, engine, model) {
    input = input || {};
    var items = (input.items || []).map(function (it, i) {
      var excerpts = Array.isArray(it.excerpts) ? it.excerpts : (it.excerpt ? [it.excerpt] : []);
      return {
        order: it.order || i + 1, timestamp: it.timestamp || 'not available',
        category: String(it.category || '').toUpperCase(), item: it.item || '',
        status: STATUSES.indexOf(it.status) >= 0 ? it.status : (it.status || 'not applicable'),
        excerpts: excerpts.map(String), paraphrase: it.paraphrase || '',
        links: (it.links || []).map(Number).filter(function (n) { return n > 0; }),
        confidence: it.confidence || 'medium', confidenceReason: it.confidence_reason || it.confidenceReason || ''
      };
    });
    var counts = {};
    VS.CATEGORIES.forEach(function (c) { counts[c] = 0; });
    var given = input.category_count || input.counts || {};
    VS.CATEGORIES.forEach(function (c) { counts[c] = given[c] != null ? Number(given[c]) : items.filter(function (x) { return x.category === c; }).length; });
    return {
      engine: engine, model: model || '', items: items,
      unclassified: (input.unclassified || []).map(function (u) { return { timestamp: u.timestamp || '', excerpt: u.excerpt || '', reason: u.reason || '' }; }),
      counts: counts, note: input.note || ''
    };
  };

  /*
    VS.claudeExtract(cfg, { startWall, utterances }, deps) -> Promise of the result
      deps (for tests): { fetch, key }
  */
  VS.claudeExtract = function (cfg, input, deps) {
    deps = deps || {};
    var key = String(deps.key != null ? deps.key : VS.keys.get(cfg, 'anthropic') || '').trim();
    if (!key) { return Promise.reject({ plain: 'No Anthropic key loaded. Add ANTHROPIC_API_KEY to your .env file and load it again.', setup: true }); }
    var doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var model = cfg.get('claudeModel');
    var prompt = VS.buildExtractionPrompt(input.startWall, input.utterances) + '\n\n' + VS.EXTRACTION_CLOSING;
    var api = String(cfg.get('anthropicApiBase')).replace(/\/+$/, '');
    return doFetch(api + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model, max_tokens: 8000, temperature: 0,
        tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: prompt }]
      })
    }).then(function (r) {
      if (!r.ok) { return r.text().then(function (t) { throw { plain: plain(r.status, t), status: r.status, setup: r.status === 401 || r.status === 403 || r.status === 404 }; }); }
      return r.json();
    }, function () {
      throw { plain: 'Could not reach Claude. Check the internet connection. The offline sort is shown instead.' };
    }).then(function (data) {
      var use = (data.content || []).filter(function (c) { return c.type === 'tool_use' && c.name === TOOL.name; })[0];
      if (!use) { throw { plain: 'Claude answered without the table. The offline sort is shown instead.' }; }
      var out = VS.normaliseExtraction(use.input, 'claude', data.model || model);
      out.prompt = prompt;
      return VS.checkExcerpts(out, input.utterances);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
