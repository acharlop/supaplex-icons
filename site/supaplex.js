// The main menu as OpenSupaplex draws it: a save game in, text and border lines out. Shared by the menu page and verify.
export const PLAYERS = 20, LEVELS = 111;
const EMPTY = '--------';
const pad = (n, w, c = '0') => String(n).padStart(w, c);
const clock = (p) => `${pad(p.h, 3)}:${pad(p.m, 2)}:${pad(p.s, 2)}`;
export const line = (text) => text.padEnd(23);

// kMainMenuButtonDescriptors, inclusive; the first hit wins.
export const BUTTONS = [
  ['new', 5, 6, 157, 14], ['delete', 5, 15, 157, 23], ['skip', 5, 24, 157, 32], ['statistics', 5, 33, 157, 41],
  ['gfx', 5, 42, 157, 50], ['demo', 5, 51, 157, 59], ['controls', 5, 60, 157, 69],
  ['ranking-up', 140, 90, 155, 108], ['ranking-down', 140, 121, 155, 138], ['ok', 96, 140, 115, 163], ['floppy', 83, 168, 126, 192],
  ['player-up', 11, 142, 67, 153], ['player-down', 11, 181, 67, 192], ['players', 11, 154, 67, 180],
  ['level-up', 142, 142, 306, 153], ['level-down', 142, 181, 306, 192], ['credits', 297, 37, 312, 52],
].map(([id, x1, y1, x2, y2]) => ({ id, x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }));
export const hit = (x, y) => BUTTONS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)?.id;

// kMainMenuButtonBorders per arrow: top/left lines, then bottom/right; H runs right, V runs up from y.
const BORDERS = {
  'player-up': [[['V', 11, 152, 11], ['H', 12, 142, 56]], [['H', 12, 153, 56], ['V', 67, 153, 11]]],
  'player-down': [[['V', 11, 191, 11], ['H', 12, 181, 56]], [['H', 12, 192, 56], ['V', 67, 192, 11]]],
  'ranking-up': [[['V', 141, 105, 16], ['H', 142, 90, 13]], [['H', 141, 106, 14], ['V', 154, 105, 15]]],
  'ranking-down': [[['V', 141, 135, 16], ['H', 142, 120, 13]], [['H', 141, 136, 14], ['V', 154, 135, 15]]],
  'level-up': [[['V', 142, 152, 11], ['H', 143, 142, 163]], [['H', 143, 153, 164], ['V', 306, 152, 11]]],
  'level-down': [[['V', 142, 191, 11], ['H', 143, 181, 164]], [['H', 142, 192, 164], ['V', 306, 192, 12]]],
};

const player = (name, [h, m, s], done = 0, skipped = []) => ({
  name, h, m, s, levels: Array.from({ length: LEVELS }, (_, i) => (skipped.includes(i + 1) ? 2 : i < done ? 1 : 0)),
});
export const emptyPlayer = () => player(EMPTY, [0, 0, 0]);
export const isEmpty = (p) => p.name === EMPTY;

// A save game a few weeks in.
export function seed() {
  const players = [
    player('  MURPHY', [6, 41, 7], 33, [12, 27]),
    player('INFOTRON', [41, 12, 9], LEVELS),
    player('SNIKSNAK', [19, 3, 55], 57, [44]),
    player('ELECTRON', [0, 52, 30], 8),
    player('    ZONK', [0, 4, 18], 2),
  ];
  while (players.length < PLAYERS) players.push(emptyPlayer());
  const fame = [[' MICHAEL', [12, 30, 41]], ['  PHILIP', [15, 2, 18]], ['INFOTRON', [41, 12, 9]]].map(([name, t]) => player(name, t));
  const state = { players, fame, current: 0, scroll: 0, message: { text: line('  WELCOME TO SUPAPLEX'), colour: 4 }, input: null, pressed: null };
  state.level = autoSelect(players[0]);
  return state;
}

// First unfinished level, else the first skipped, else 113.
export function autoSelect(p) {
  const i = p.levels.indexOf(0);
  if (i >= 0) return i + 1;
  const j = p.levels.indexOf(2);
  return j >= 0 ? j + 1 : 113;
}
export const skips = (p) => p.levels.filter((l) => l === 2).length;

// 2 the next level, 4 done, 6 blocked, 8 skipped and the rows around the list.
export function levelColour(p, i) {
  if (i < 1 || i > LEVELS) return 8;
  const l = p.levels[i - 1];
  return l === 1 ? 4 : l === 2 ? 8 : i === p.levels.indexOf(0) + 1 ? 2 : 6;
}
function levelRow(levels, i) {
  if (i === 112) return '- REPLAY SKIPPED LEVELS!! -';
  if (i === 113) return '---- UNBELIEVEABLE!!!! ----';
  return i >= 1 && i <= LEVELS ? `${pad(i, 3)} ${levels[i - 1][0]}` : ' '.repeat(27);
}

// Most levels first; the game's bubble sort never breaks ties, so they keep player order.
export function ranked(players) {
  const next = (p) => (isEmpty(p) ? 0 : autoSelect(p));
  return players.map((p, i) => [p, i]).sort((a, b) => next(b[0]) - next(a[0]) || a[1] - b[1]).map(([, i]) => i);
}
function rankRow(p) {
  if (!p) return ' '.repeat(22);
  const next = isEmpty(p) ? 0 : autoSelect(p);
  return `${next === 113 ? '999' : pad(next, 3)} ${p.name} ${clock(p)}`;
}

export function frame(state, levels) {
  const { players, current, scroll, level } = state;
  const p = players[current], order = ranked(players);
  const texts = [];
  const text = (x, y, colour, t) => texts.push({ x, y, colour, text: t });
  state.fame.forEach((f, i) => text(184, 28 + 9 * i, 8, `${f.name} ${pad(f.h, 3, ' ')}:${pad(f.m, 2)}:${pad(f.s, 2)}`));
  for (let i = 0; i < 5; i++) text(8, 92 + 9 * i, i === 2 ? 6 : 8, rankRow(players[order[scroll + i - 2]]));
  text(144, 110, 6, pad(scroll + 1, 2));
  text(168, 93, 8, p.name);
  text(224, 93, 8, clock(p));
  text(288, 93, 8, pad(isEmpty(p) ? 0 : autoSelect(p), 3));
  text(168, 127, state.message.colour, state.message.text);
  if (state.input !== null) text(232, 127, 6, state.input.padEnd(8));
  for (const d of [-1, 0, 1]) text(16, 164 + 9 * d, d ? 8 : 6, players[current + d]?.name ?? ' '.repeat(8));
  for (const d of [-1, 0, 1]) text(144, 164 + 9 * d, levelColour(p, level + d), levelRow(levels, level + d));

  const lines = [];
  for (const [id, edges] of Object.entries(BORDERS)) {
    edges.forEach((edge, i) => {
      const colour = (i === 0) === (state.pressed === id) ? 13 : 7;
      for (const [type, x, y, len] of edge) lines.push(type === 'H' ? { x, y, w: len, h: 1, colour } : { x, y: y - len + 1, w: 1, h: len, colour });
    });
  }
  return { texts, lines };
}

// The info screens: transparent text in colour 15 over the background.
export function statistics(p) {
  const next = autoSelect(p), t = p.h * 60 + p.m + (p.s >= 30 ? 1 : 0);
  return [
    [80, 20, 'SUPAPLEX  BY DREAM FACTORY'], [64, 50, '(C) DIGITAL INTEGRATION LTD 1991'], [16, 60, '_'.repeat(48)],
    [80, 80, 'SUPAPLEX PLAYER STATISTICS'], [80, 100, `CURRENT PLAYER :  ${p.name}`], [80, 110, `CURRENT LEVEL  :       ${pad(next, 3)}`],
    [80, 120, `USED TIME      : ${pad(p.h, 3, ' ')}:${pad(p.m, 2)}:${pad(p.s, 2)}`],
    Math.floor(t / next) === 0 ? [40, 140, 'STILL UNDER ONE MINUTE (KEEP IT UP...)']
      : next === 113 ? [24, 140, "YOU'VE COMPLETED ALL LEVELS! CONGRATULATIONS!!!"]
      : [32, 140, `AVERAGE TIME USED PER LEVEL  ${pad(Math.floor(t / next), 3, ' ')}.${Math.floor(((t % next) * 10) / next)} MINUTES`],
  ];
}
export const CREDITS = [
  [80, 10, 'SUPAPLEX  BY DREAM FACTORY'], [56, 40, 'ORIGINAL DESIGN BY PHILIP JESPERSEN'], [88, 50, 'AND MICHAEL STOPP'],
  [56, 90, 'NEARLY ALL LEVELS BY MICHEAL STOPP'], [64, 100, 'A FEW LEVELS BY PHILIP JESPERSEN'], [56, 110, 'HARDLY ANY LEVELS BY BARBARA STOPP'],
  [64, 170, 'NOTE: PRESS ENTER TO REMOVE PANEL'], [64, 190, '(C) DIGITAL INTEGRATION LTD 1991'],
];
export const CONGRATULATIONS = [
  [120, 30, 'CONGRATULATIONS'], [24, 70, 'YOU HAVE COMPLETED ALL 111 LEVELS OF SUPAPLEX'], [64, 85, 'YOUR BRAIN IS IN FANTASTIC SHAPE'],
  [40, 100, 'NOT MANY PEOPLE ARE ABLE TO MANAGE THIS'],
];

// The game panel while a level or demo plays: opaque chars8.
export function panel({ name, level, demo }, levels, seconds) {
  const [title, infotrons] = levels[level - 1];
  return [
    [72, 3, demo ? 8 : 6, demo ? '  DEMO  ' : name], [16, 14, 8, pad(level, 3)], [64, 14, 8, title], [272, 14, 8, pad(infotrons, 3)],
    [160, 3, 6, pad(Math.floor(seconds / 3600), 2)], [184, 3, 6, pad(Math.floor(seconds / 60) % 60, 2)], [208, 3, 6, pad(seconds % 60, 2)],
  ].map(([x, y, colour, text]) => ({ x, y, colour, text }));
}
