'use strict';

// ─── Music Theory Data ──────────────────────────────────────────────────────

const NOTES_SHARP   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT    = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const NOTE_LETTERS  = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

const SCALES = {
  major:    { name: '大調 Major',         vibe: '明亮、積極',    intervals: [0,2,4,5,7,9,11] },
  minor:    { name: '小調 Minor',         vibe: '沉鬱、情感',    intervals: [0,2,3,5,7,8,10] },
  dorian:   { name: 'Dorian 多利安',      vibe: '爵士、藍調',    intervals: [0,2,3,5,7,9,10] },
  mixo:     { name: 'Mixolydian 混合利底亞', vibe: '搖滾、鄉村',  intervals: [0,2,4,5,7,9,10] },
  phrygian: { name: 'Phrygian 弗里幾亞', vibe: '西班牙、戲劇',  intervals: [0,1,3,5,7,8,10] },
  lydian:   { name: 'Lydian 呂底亞',      vibe: '夢幻、飄浮',    intervals: [0,2,4,6,7,9,11] },
};

const ROMAN = ['I','II','III','IV','V','VI','VII'];

// ─── State ─────────────────────────────────────────────────────────────────

const state = {
  key: 0,
  scale: 'major',
  count: 4,
  useSevenths: false,
  chords: [],
};

// ─── Music Theory ──────────────────────────────────────────────────────────

// Build a 12-element note name array for a specific scale so each letter A–G
// appears once and accidentals are spelled correctly (e.g. Eb not D# in C minor).
function buildNoteNamesForScale(rootIdx, scaleIntervals) {
  const noteIndices = scaleIntervals.map(i => (rootIdx + i) % 12);
  const names = [...NOTES_SHARP]; // default sharps
  const lettersUsed = new Set();

  // Assign natural-note names first
  noteIndices.forEach(idx => {
    if (NOTE_LETTERS[idx]) lettersUsed.add(NOTE_LETTERS[idx]);
  });

  // Resolve black keys by picking the spelling that avoids a duplicate letter
  noteIndices.forEach(idx => {
    if (!NOTE_LETTERS[idx]) {
      const sharpLetter = NOTES_SHARP[idx][0];
      if (lettersUsed.has(sharpLetter)) {
        names[idx] = NOTES_FLAT[idx];
        lettersUsed.add(NOTES_FLAT[idx][0]);
      } else {
        lettersUsed.add(sharpLetter);
      }
    }
  });

  return names;
}

function buildDiatonicChords(rootIdx, scaleKey, useSevenths) {
  const intervals = SCALES[scaleKey].intervals;
  const noteNames = buildNoteNamesForScale(rootIdx, intervals);

  return intervals.map((interval, degree) => {
    const root       = (rootIdx + interval) % 12;
    const thirdNote  = (rootIdx + intervals[(degree + 2) % 7]) % 12;
    const fifthNote  = (rootIdx + intervals[(degree + 4) % 7]) % 12;

    const thirdInt = (thirdNote - root + 12) % 12;
    const fifthInt  = (fifthNote  - root + 12) % 12;

    let quality;
    if      (thirdInt === 4 && fifthInt === 7) quality = 'major';
    else if (thirdInt === 3 && fifthInt === 7) quality = 'minor';
    else if (thirdInt === 3 && fifthInt === 6) quality = 'dim';
    else if (thirdInt === 4 && fifthInt === 8) quality = 'aug';
    else quality = 'major';

    const romanBase = ROMAN[degree];
    const name = noteNames[root];

    let symbol, roman;
    switch (quality) {
      case 'major': symbol = name;        roman = romanBase;                    break;
      case 'minor': symbol = name + 'm';  roman = romanBase.toLowerCase();      break;
      case 'dim':   symbol = name + '°';  roman = romanBase.toLowerCase() + '°'; break;
      case 'aug':   symbol = name + '+';  roman = romanBase + '+';              break;
    }

    const notes = [root, thirdNote, fifthNote];

    if (useSevenths) {
      const seventhNote = (rootIdx + intervals[(degree + 6) % 7]) % 12;
      const seventhInt  = (seventhNote - root + 12) % 12;
      notes.push(seventhNote);

      if      (quality === 'major' && seventhInt === 11) { symbol += 'maj7'; roman += 'maj7'; }
      else if (quality === 'major' && seventhInt === 10) { symbol += '7';    roman += '7'; }
      else if (quality === 'minor' && seventhInt === 10) { symbol += '7';    roman += '7'; }
      else if (quality === 'dim'   && seventhInt === 10) { symbol = name + 'ø7'; roman = romanBase.toLowerCase() + 'ø7'; }
      else if (quality === 'dim'   && seventhInt === 9)  { symbol += '7';    roman += '7'; }
    }

    return { root, quality, degree, symbol, roman, notes, noteNames: notes.map(n => noteNames[n]) };
  });
}

function chordDisplaySymbol(chord) {
  const inv = chord.inversion || 0;
  return inv > 0 ? chord.symbol + '/' + chord.noteNames[inv] : chord.symbol;
}

function generateProgression() {
  const pool = buildDiatonicChords(state.key, state.scale, state.useSevenths);
  const newChords = [];

  for (let i = 0; i < state.count; i++) {
    if (state.chords[i]?.locked) {
      newChords.push(state.chords[i]);
      continue;
    }

    let chord;
    let attempts = 0;
    const prev = newChords[i - 1];

    do {
      const base = pool[Math.floor(Math.random() * pool.length)];
      const inv = Math.floor(Math.random() * base.notes.length);
      chord = { ...base, locked: false, inversion: inv };
      attempts++;
    } while (prev && chord.degree === prev.degree && pool.length > 1 && attempts < 20);

    newChords.push(chord);
  }

  state.chords = newChords;
}

// ─── Piano SVG ─────────────────────────────────────────────────────────────

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEY_X = { 1: 9, 3: 23, 6: 51, 8: 65, 10: 79 };

function renderPiano(highlightedNotes) {
  const lit = new Set(highlightedNotes.map(n => ((n % 12) + 12) % 12));
  let r = '';

  WHITE_NOTES.forEach((note, i) => {
    const fill = lit.has(note) ? 'var(--c-red)' : '#fff';
    r += `<rect x="${i * 14 + .5}" y=".5" width="13" height="57" rx="2" fill="${fill}" stroke="#ccc" stroke-width="1"/>`;
  });

  Object.entries(BLACK_KEY_X).forEach(([noteStr, x]) => {
    const on = lit.has(parseInt(noteStr));
    const fill = on ? 'var(--c-red)' : 'var(--c-navy)';
    const stroke = on ? 'stroke="var(--c-navy)" stroke-width="1"' : '';
    r += `<rect x="${x + .5}" y=".5" width="9" height="35" rx="2" fill="${fill}" ${stroke}/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="58" viewBox="0 0 98 58">${r}</svg>`;
}

// ─── Rendering ────────────────────────────────────────────────────────────

function renderChords(animate = true) {
  const display = document.getElementById('chord-display');
  display.innerHTML = '';

  const invLabels = ['', '一轉位', '二轉位', '三轉位'];

  state.chords.forEach((chord, i) => {
    const card = document.createElement('div');
    card.className = 'chord-card' + (chord.locked ? ' locked' : '');
    card.dataset.index = i;
    if (animate) {
      card.style.animationDelay = `${i * 0.05}s`;
    } else {
      card.style.animation = 'none';
    }

    const lockPath = chord.locked
      ? '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
      : '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>';

    const inv = chord.inversion || 0;
    const invHtml = inv > 0 ? `<div class="chord-inv">${invLabels[inv]}</div>` : '';

    card.innerHTML = `
      <button class="lock-btn" title="${chord.locked ? '解鎖此和弦' : '鎖定此和弦'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">${lockPath}</svg>
      </button>
      <div class="chord-roman">${chord.roman}</div>
      <div class="chord-symbol">${chordDisplaySymbol(chord)}</div>
      ${invHtml}
      <div class="chord-piano">${renderPiano(chord.notes)}</div>
      <div class="chord-notes">${chord.noteNames.join(' · ')}</div>
    `;

    display.appendChild(card);

    if (i < state.chords.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'chord-arrow';
      arrow.textContent = '→';
      display.appendChild(arrow);
    }
  });

  display.querySelectorAll('.lock-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.currentTarget.closest('.chord-card').dataset.index);
      state.chords[idx].locked = !state.chords[idx].locked;
      renderChords(false);
    });
  });

  updateSummary();
}

function updateSummary() {
  const noteNames = buildNoteNamesForScale(state.key, SCALES[state.scale].intervals);
  document.getElementById('progression-text').textContent =
    `${noteNames[state.key]} ${SCALES[state.scale].name}  |  ` +
    state.chords.map(c => chordDisplaySymbol(c)).join(' → ');
  document.getElementById('progression-roman').textContent =
    state.chords.map(c => c.roman).join(' – ');
}

function renderScaleInfo() {
  const intervals = SCALES[state.scale].intervals;
  const noteNames = buildNoteNamesForScale(state.key, intervals);
  const scaleNotes = intervals.map(i => noteNames[(state.key + i) % 12]);
  document.getElementById('scale-name-display').textContent =
    `${noteNames[state.key]} ${SCALES[state.scale].name}`;
  document.getElementById('scale-vibe').textContent = SCALES[state.scale].vibe;
  document.getElementById('scale-notes').textContent = scaleNotes.join('  ·  ');
}

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const keySelect   = document.getElementById('key-select');
  const scaleSelect = document.getElementById('scale-select');
  const seventhToggle = document.getElementById('seventh-toggle');
  const generateBtn = document.getElementById('generate-btn');
  const copyBtn     = document.getElementById('copy-btn');

  keySelect.addEventListener('change', () => {
    state.key = parseInt(keySelect.value);
    renderScaleInfo();
  });

  scaleSelect.addEventListener('change', () => {
    state.scale = scaleSelect.value;
    renderScaleInfo();
  });

  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.count = parseInt(btn.dataset.count);
    });
  });

  seventhToggle.addEventListener('change', () => {
    state.useSevenths = seventhToggle.checked;
  });

  generateBtn.addEventListener('click', () => {
    generateBtn.classList.add('spinning');
    setTimeout(() => generateBtn.classList.remove('spinning'), 500);
    generateProgression();
    renderChords();
  });

  copyBtn.addEventListener('click', () => {
    const text = document.getElementById('progression-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = '已複製 ✓';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('copied'); }, 2000);
    });
  });

  renderScaleInfo();
  generateProgression();
  renderChords();
});
