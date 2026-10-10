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

// The options screen (CONTROLS.DAT): kOptionsMenuButtonDescriptors, inclusive; the first hit wins.
export const OPTION_BUTTONS = [
  ['adlib', 12, 13, 107, 36], ['blaster', 12, 49, 107, 72], ['roland', 12, 85, 107, 108], ['combined', 12, 121, 107, 144],
  ['standard', 132, 13, 211, 31], ['standard', 126, 43, 169, 54], ['samples', 174, 43, 217, 54],
  ['music', 132, 86, 175, 120], ['fx', 134, 132, 168, 152], ['keyboard', 201, 80, 221, 154], ['joystick', 233, 80, 252, 154],
  ['exit', 0, 181, 319, 199], ['exit', 284, 0, 319, 180],
].map(([id, x1, y1, x2, y2]) => ({ id, x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }));
export const optionHit = (x, y) => OPTION_BUTTONS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)?.id;
export const CARDS = ['standard', 'samples', 'adlib', 'blaster', 'roland', 'combined'];

// kOptionsMenuBorders: H runs right, V up, U up-right, D down-right.
const OPTION_BORDERS = [
  [['V', 144, 81, 5], ['H', 127, 76, 18], ['D', 122, 71, 5], ['V', 122, 70, 69], ['H', 76, 2, 46], ['U', 70, 8, 7]],
  [['H', 103, 39, 16], ['V', 118, 77, 38], ['D', 119, 78, 6], ['V', 124, 85, 2], ['V', 124, 112, 8], ['U', 121, 115, 3], ['V', 120, 117, 2], ['H', 121, 126, 24], ['V', 144, 127, 2]],
  [['V', 94, 44, 3], ['H', 94, 42, 19], ['V', 113, 81, 40], ['D', 114, 82, 14]],
  [['V', 94, 78, 2], ['H', 95, 78, 11], ['D', 106, 79, 9], ['V', 115, 129, 42], ['H', 116, 129, 20]],
  [['V', 88, 115, 3], ['H', 89, 115, 23], ['V', 112, 115, 3], ['V', 119, 94, 2], ['D', 120, 93, 8], ['D', 120, 94, 8]],
  [['V', 22, 114, 2], ['H', 11, 114, 11], ['V', 10, 151, 38], ['H', 6, 151, 4], ['V', 5, 156, 6], ['V', 14, 155, 3], ['H', 15, 153, 6], ['V', 21, 160, 8], ['H', 22, 160, 20], ['U', 42, 159, 9], ['H', 51, 151, 74], ['D', 125, 152, 10], ['H', 135, 161, 9], ['V', 144, 161, 5]],
  [['D', 34, 113, 5], ['U', 70, 116, 3], ['V', 73, 113, 5], ['V', 73, 84, 7], ['D', 72, 76, 2], ['H', 9, 111, 5], ['H', 9, 112, 6], ['V', 7, 112, 68], ['V', 8, 112, 68], ['H', 9, 45, 6], ['H', 9, 46, 5]],
  [['V', 138, 37, 2], ['H', 125, 37, 13], ['V', 124, 67, 31], ['D', 125, 68, 6], ['H', 131, 73, 19], ['V', 150, 81, 9], ['D', 151, 36, 4], ['U', 182, 39, 4], ['V', 192, 38, 3]],
  [['V', 156, 65, 7], ['V', 156, 69, 2], ['V', 157, 69, 2], ['H', 182, 71, 2], ['V', 183, 85, 14], ['V', 183, 102, 7], ['V', 183, 124, 13], ['U', 168, 139, 15], ['H', 165, 139, 3]],
  [['V', 180, 65, 7], ['V', 180, 69, 2], ['V', 181, 69, 2], ['H', 182, 71, 2], ['V', 183, 85, 14], ['V', 183, 102, 7], ['V', 183, 124, 13], ['U', 168, 139, 15], ['H', 165, 139, 3]],
  [['H', 180, 90, 6], ['V', 186, 90, 24], ['H', 187, 67, 38], ['V', 225, 67, 33], ['H', 226, 35, 33]],
  [['V', 150, 160, 4], ['H', 150, 161, 31], ['V', 181, 161, 29], ['U', 181, 133, 8], ['V', 189, 125, 22], ['U', 189, 103, 4], ['V', 192, 99, 25], ['H', 192, 74, 51], ['U', 243, 74, 17]],
  [['D', 257, 126, 10]], [['D', 257, 131, 10]], [['D', 257, 136, 10]], [['D', 257, 141, 10]], [['D', 257, 146, 10]], [['D', 257, 151, 10]],
  [['D', 257, 116, 4], ['H', 261, 119, 4], ['D', 257, 111, 2], ['H', 259, 112, 7], ['H', 268, 113, 2], ['V', 272, 114, 2], ['V', 273, 114, 2], ['H', 280, 113, 7], ['H', 280, 114, 7], ['H', 283, 119, 3], ['H', 292, 119, 2], ['V', 293, 131, 12], ['H', 289, 131, 4], ['D', 283, 126, 4]],
  [['V', 159, 180, 14], ['H', 160, 167, 28], ['V', 187, 166, 8], ['H', 187, 149, 10]],
];
const STEP = { U: [1, -1], D: [1, 1] };
const DIRECTIONS = { up: 13, left: 14, down: 15, right: 16 };

// The options screen for settings and held input: text rects recoloured in draw order (lit: 15 to 1, else 1 to 15), then border lines.
export function options({ card, music, fx, joystick }, { direction = null, fire = false } = {}) {
  const texts = [], lines = [];
  const text = (lit, x, y, w, h) => texts.push({ x, y, w, h, lit });
  // Borders share pixels, so later draws win.
  const border = (i, colour) => {
    for (const [type, x, y, len] of OPTION_BORDERS[i]) {
      if (type === 'H') lines.push({ x, y, w: len, h: 1, colour });
      else if (type === 'V') lines.push({ x, y: y - len + 1, w: 1, h: len, colour });
      else for (let j = 0; j < len; j++) lines.push({ x: x + j * STEP[type][0], y: y + j * STEP[type][1], w: 1, h: 1, colour });
    }
  };
  [[40, 21, 40, 8], [24, 57, 72, 8], [32, 93, 56, 8], [24, 129, 64, 8], [136, 18, 72, 8], [128, 46, 40, 5], [176, 46, 40, 5]].forEach((r) => text(false, ...r));
  for (let i = 0; i < 10; i++) border(i, 4);
  if (card === 'adlib') { text(true, 40, 21, 40, 8); border(0, 6); border(1, 6); }
  else if (card === 'blaster' || card === 'combined') {
    border(3, 6);
    if (card === 'blaster') { text(true, 24, 57, 72, 8); border(2, 6); }
    else { text(true, 24, 129, 64, 8); border(4, 6); border(6, 6); }
  } else if (card === 'roland') { text(true, 32, 93, 56, 8); border(4, 6); border(5, 6); }
  else {
    text(true, 136, 18, 72, 8);
    border(7, 6);
    if (card === 'samples') { text(true, 176, 46, 40, 5); border(9, 6); }
    else { text(true, 128, 46, 40, 5); border(8, 6); }
  }
  text(music, 134, 99, 40, 8);
  border(10, music ? 6 : 4);
  text(fx, 136, 138, 24, 8);
  border(11, fx ? 6 : 4);
  text(!joystick, 208, 87, 8, 62);
  text(joystick, 240, 88, 8, 58);
  border(18, joystick ? 6 : 4);
  border(19, joystick ? 4 : 6);
  border(12, direction ? 4 : 6);
  border(17, fire ? 6 : 4);
  for (const i of Object.values(DIRECTIONS)) border(i, 4);
  if (direction) border(DIRECTIONS[direction], 6);
  return { texts, lines };
}
