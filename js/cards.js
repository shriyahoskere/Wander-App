/*
  cards.js - the tags over new boats, in the style of your Figma "your words" tags.

  What it is for: while you record, each time a thought is caught a small tag rises from its
  paper boat, saying what happened to it ("converted to a task", "set a goal", "added to
  reflections"). It also holds each kind's name, colour and icon.

  How it fits: live-ui.js calls VS.KINDS for labels and VS.tagEl() for a tag. Nothing here plays
  sound or changes the session.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // Icons: Google Material Symbols (Rounded), by name.
  var ICONS = { reflection: 'waves', task: 'checklist', goal: 'target', concept: 'category', quote: 'format_quote', story: 'menu_book' };

  /* Each kind: its name, the tag wording you asked for, and the pastel from your card designs. */
  VS.KINDS = {
    reflection: { label: 'Reflection', tag: 'added to reflections', tint: '#B4D2D6' },
    task: { label: 'Task', tag: 'converted to a task', tint: '#AFCADB' },
    goal: { label: 'Goal', tag: 'set a goal', tint: '#DCCB8F' },
    concept: { label: 'Concept', tag: 'added to concepts', tint: '#BCCFB3' },
    quote: { label: 'Quote', tag: 'kept as a quote', tint: '#D4C8E8' },
    story: { label: 'Story', tag: 'saved as a story', tint: '#EEBCBC' }
  };
  VS.kindIcon = function (kind, size) {
    return '<span class="msym" aria-hidden="true" style="font-size:' + (size || 24) + 'px">' + (ICONS[kind] || ICONS.reflection) + '</span>';
  };

  /* A tag, as on your "your words" screen: words, then a dark square with the kind's icon. */
  VS.tagEl = function (kind) {
    var k = VS.KINDS[kind] || VS.KINDS.reflection;
    var el = document.createElement('div');
    el.className = 'sea-tag';
    var t = document.createElement('span'); t.textContent = k.tag;
    var ico = document.createElement('span'); ico.className = 'ico'; ico.innerHTML = VS.kindIcon(kind, 16);
    el.appendChild(t); el.appendChild(ico);
    return el;
  };

})(typeof window !== 'undefined' ? window : globalThis);
