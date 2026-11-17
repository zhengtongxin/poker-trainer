// Shared poker core: hand evaluator, equity, and the multiplayer game engine.
// Used by the Supabase edge function (dealer) and by room.html (coach).
export const RANKS = '23456789TJQKA', SU = 'shdc', SYM = ['♠', '♥', '♦', '♣'];
export const RN = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const pl = r => r === 4 ? 'Sixes' : RN[r] + 's';
export const CAT = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
export const rk = c => c >> 2, st = c => c & 3;
export const code = c => RANKS[rk(c)] + SU[st(c)];

/* ---------- evaluator ---------- */
const RC = new Int8Array(13), SM = [0, 0, 0, 0], SC = [0, 0, 0, 0];
function sHigh(m) { for (let h = 12; h >= 4; h--) { const x = 0x1F << (h - 4); if ((m & x) === x) return h } return (m & 0x100F) === 0x100F ? 3 : -1 }
function kick(ex, n) { let v = 0, c = 0; for (let r = 12; r >= 0 && c < n; r--) if (RC[r] && !(ex >> r & 1)) { v = v << 4 | r; c++ } while (c < n) { v <<= 4; c++ } return v }
export function ev(cs) {
  RC.fill(0); SM[0] = SM[1] = SM[2] = SM[3] = 0; SC[0] = SC[1] = SC[2] = SC[3] = 0; let all = 0;
  for (let k = 0; k < cs.length; k++) { const c = cs[k], r = c >> 2, s = c & 3; RC[r]++; SM[s] |= 1 << r; SC[s]++; all |= 1 << r }
  let fs = -1; for (let s = 0; s < 4; s++) if (SC[s] >= 5) fs = s;
  if (fs >= 0) { const h = sHigh(SM[fs]); if (h >= 0) return 8 << 20 | h << 16 }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) { const n = RC[r]; if (n === 4) q = r; else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r } else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r } }
  if (q >= 0) return 7 << 20 | q << 16 | kick(1 << q, 1) << 12;
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return 6 << 20 | t1 << 16 | Math.max(t2, p1) << 12;
  if (fs >= 0) { let m = SM[fs], v = 0, c = 0; for (let r = 12; r >= 0 && c < 5; r--) if (m >> r & 1) { v = v << 4 | r; c++ } return 5 << 20 | v }
  const h = sHigh(all); if (h >= 0) return 4 << 20 | h << 16;
  if (t1 >= 0) return 3 << 20 | t1 << 16 | kick(1 << t1, 2) << 8;
  if (p1 >= 0 && p2 >= 0) return 2 << 20 | p1 << 16 | p2 << 12 | kick(1 << p1 | 1 << p2, 1) << 8;
  if (p1 >= 0) return 1 << 20 | p1 << 16 | kick(1 << p1, 3) << 4;
  return kick(0, 5);
}
export function hname(s) {
  const c = s >> 20, a = s >> 16 & 15, b = s >> 12 & 15;
  return [`${RN[a]}-high`, `Pair of ${pl(a)}`, `Two pair, ${pl(a)} & ${pl(b)}`, `Three ${pl(a)}`, `Straight, ${RN[a]}-high`, `Flush, ${RN[a]}-high`, `Full house, ${pl(a)} full of ${pl(b)}`, `Four ${pl(a)}`, a === 12 ? 'Royal flush' : `Straight flush, ${RN[a]}-high`][c]
}
export function cls(a, b) { const x = rk(a), y = rk(b), hi = Math.max(x, y), lo = Math.min(x, y); if (hi === lo) return hi * 13 + hi; return st(a) === st(b) ? hi * 13 + lo : lo * 13 + hi }
export function clsName(i) { const x = Math.floor(i / 13), y = i % 13; if (x === y) return RANKS[x] + RANKS[x]; return x > y ? RANKS[x] + RANKS[y] + 's' : RANKS[y] + RANKS[x] + 'o' }
// Preflop strength percentile per hand class (0 = best), from equity vs a random hand.
export const PCT = [0.4879, 0.9955, 0.9864, 0.9593, 0.9683, 0.9774, 0.8869, 0.8718, 0.7934, 0.733, 0.5943, 0.4178, 0.3409, 0.9442, 0.411, 0.9502, 0.9261, 0.9351, 0.908, 0.917, 0.8054, 0.7149, 0.6516, 0.54, 0.4299, 0.2956, 0.9412, 0.8477, 0.2406, 0.8627, 0.8989, 0.8537, 0.8386, 0.7843, 0.7541, 0.6305, 0.5038, 0.4042, 0.2594, 0.8778, 0.8115, 0.7753, 0.1395, 0.8205, 0.8296, 0.7662, 0.6968, 0.6727, 0.549, 0.4811, 0.371, 0.2278, 0.8929, 0.8446, 0.7783, 0.6878, 0.0867, 0.7421, 0.724, 0.6425, 0.6033, 0.5762, 0.4419, 0.3198, 0.2474, 0.8808, 0.8145, 0.7481, 0.7059, 0.6365, 0.043, 0.6637, 0.6124, 0.5852, 0.5189, 0.3922, 0.3047, 0.1825, 0.7994, 0.7602, 0.7722, 0.6848, 0.6576, 0.5551, 0.0294, 0.5671, 0.4947, 0.46, 0.3499, 0.2775, 0.1584, 0.7029, 0.7089, 0.6908, 0.6244, 0.5581, 0.5339, 0.4691, 0.0249, 0.451, 0.362, 0.3288, 0.1916, 0.1267, 0.6817, 0.6787, 0.6184, 0.6214, 0.5279, 0.4661, 0.3982, 0.3861, 0.0204, 0.2866, 0.2157, 0.1704, 0.0935, 0.5611, 0.5128, 0.5309, 0.5249, 0.4751, 0.4238, 0.356, 0.2655, 0.1976, 0.0158, 0.2066, 0.1176, 0.0739, 0.5098, 0.4721, 0.4359, 0.3771, 0.3831, 0.2715, 0.3137, 0.2534, 0.1493, 0.1644, 0.0113, 0.1086, 0.0528, 0.3801, 0.3107, 0.3348, 0.2685, 0.2338, 0.1765, 0.2006, 0.1327, 0.1026, 0.0799, 0.0679, 0.0068, 0.0618, 0.2368, 0.2217, 0.1523, 0.1357, 0.1463, 0.1433, 0.0995, 0.083, 0.0468, 0.0392, 0.0362, 0.0332, 0.0023];
export const pctOf = (a, b) => PCT[cls(a, b)];

/* ---------- Monte Carlo equity ---------- */
const U = new Uint8Array(52);
function draw(u) { let c; do c = Math.random() * 52 | 0; while (u[c]); u[c] = 1; return c }
function sample(o, board, out) {
  const n = board.length >= 3 ? 1 + Math.min(o.agg, 3) : 1; let best = -1, b0 = -1, b1 = -1;
  for (let k = 0; k < n; k++) {
    let a, b, t = 0;
    for (; ;) { a = draw(U); b = draw(U); if (o.range >= 1 || pctOf(a, b) <= o.range || ++t > 40) break; U[a] = 0; U[b] = 0 }
    if (n === 1) { out[0] = a; out[1] = b; return }
    const s = ev([a, b, ...board]);
    if (s > best) { if (b0 >= 0) { U[b0] = 0; U[b1] = 0 } best = s; b0 = a; b1 = b } else { U[a] = 0; U[b] = 0 }
  }
  out[0] = b0; out[1] = b1;
}
export function equity(hc, board, opps, iters) {
  let win = 0, tie = 0, eq = 0; const oh = opps.map(() => [0, 0]), bb = new Array(5);
  for (let it = 0; it < iters; it++) {
    U.fill(0); for (const c of hc) U[c] = 1; for (const c of board) U[c] = 1;
    for (let o = 0; o < opps.length; o++) sample(opps[o], board, oh[o]);
    for (let k = 0; k < 5; k++) bb[k] = k < board.length ? board[k] : draw(U);
    const hs = ev([hc[0], hc[1], ...bb]); let lost = false, ties = 0;
    for (let o = 0; o < opps.length; o++) { const s = ev([oh[o][0], oh[o][1], ...bb]); if (s > hs) { lost = true; break } if (s === hs) ties++ }
    if (!lost) { if (ties) { tie++; eq += 1 / (ties + 1) } else { win++; eq++ } }
  }
  return { win: win / iters, tie: tie / iters, eq: eq / iters };
}
export function rangeOf(p) {
  if (p.pfLevel >= 3) return .03; if (p.pfLevel === 2) return .07;
  if (p.pfLevel === 1) return ({ UTG: .15, MP: .19, CO: .28, BTN: .42, SB: .34, BB: .2 })[p.pos] || .2;
  if (p.pfC) return .4; return 1;
}

/* ---------- multiplayer engine (runs on the server) ---------- */
export const BOT_MS = 900, NEXT_MS = 5000, START = 200;
const POSN = { 2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'UTG', 'CO'], 6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'] };
const BOTN = ['Viper', 'Maven', 'Ghost', 'Shark', 'Rook', 'Nova', 'Ace', 'Blaze'];
const STY = { TAG: { open: 1, agg: 1, bluff: 1 }, LAG: { open: 1.3, agg: 1.25, bluff: 1.5 } }, CAS = { open: 1.9, agg: .6, bluff: 1.6, loose: true };

export function newState() {
  return { seats: [null, null, null, null, null, null], dealer: 5, board: [], street: 0, cur: 0, minR: 2, toAct: -1, hand: 0, raises: 0, over: true, running: false, reveal: false, log: [], banner: '', deadline: 0, sb: 1, bb: 2, start: START, lvl: 'casual', turnMs: 30000, host: 0 };
}
export function newPlayer(name, bot = false) {
  return { name, bot, sty: bot ? (Math.random() < .5 ? 'TAG' : 'LAG') : '', stack: START, buyin: START, sitOut: false, inHand: false, folded: true, allIn: false, bet: 0, total: 0, acted: false, pfLevel: 0, pfC: false, agg: 0, last: '', win: false, gain: 0, show: null, pos: '', timeouts: 0, leave: false };
}
export function botName(S) { const used = new Set(S.seats.filter(Boolean).map(p => p.name)); return BOTN.find(n => !used.has(n)) || 'Bot' + (Math.random() * 99 | 0) }

const inH = p => !!(p && p.inHand);
function nextIn(S, i) { for (let k = 1; k <= 6; k++) { const j = (i + k) % 6; if (inH(S.seats[j])) return j } return -1 }
export function L(S, t, k = '') { S.log.push({ t, k }); if (S.log.length > 80) S.log.splice(0, S.log.length - 80) }
export const potSize = S => S.seats.reduce((s, p) => s + (p ? p.total : 0), 0);
export const minTo = S => S.cur === 0 ? S.bb : S.cur + S.minR;
const live = S => S.seats.filter(p => inH(p) && !p.folded);
const cc = cs => cs.map(c => '[' + code(c) + ']').join('');

function post(p, a) { a = Math.min(a, p.stack); p.stack -= a; p.bet += a; p.total += a; if (!p.stack) p.allIn = true }
function put(p, a) { a = Math.min(a, p.stack); p.stack -= a; p.bet += a; p.total += a }

export function startHand(G, now) {
  const S = G.pub;
  S.seats.forEach((p, i) => { if (p && p.leave) { L(S, `${p.name} left the table`); S.seats[i] = null; delete G.sec.tokens[i] } });
  for (const p of S.seats) if (p && p.bot && p.stack < S.bb * 25) { p.stack = S.start; L(S, `${p.name} reloads to ${S.start}`) }
  for (const p of S.seats) if (p) { p.inHand = !p.sitOut && p.stack > 0; p.folded = true; p.bet = 0; p.total = 0; p.show = null; p.win = false; p.gain = 0; p.last = p.sitOut ? 'sitting out' : p.stack > 0 ? '' : 'busted'; p.pos = '' }
  const n = S.seats.filter(inH).length;
  S.board = []; S.street = 0; S.reveal = false;
  if (n < 2) { S.over = true; S.toAct = -1; S.banner = 'Waiting for more players…'; S.deadline = now + NEXT_MS; return }
  S.hand++; S.dealer = nextIn(S, S.dealer); S.raises = 0; S.over = false; S.banner = '';
  const d = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[d[i], d[j]] = [d[j], d[i]] }
  const H = [null, null, null, null, null, null], order = []; let j = S.dealer;
  for (let k = 0; k < n; k++) { order.push(j); j = nextIn(S, j) }
  S.seats.forEach((p, i) => {
    if (!inH(p)) return;
    Object.assign(p, { folded: false, allIn: false, acted: false, pfLevel: 0, pfC: false, agg: 0, pos: POSN[n][order.indexOf(i)] });
    H[i] = [d.pop(), d.pop()];
  });
  G.sec.deck = d; G.sec.hands = H;
  const sbI = n === 2 ? S.dealer : nextIn(S, S.dealer), bbI = nextIn(S, sbI);
  post(S.seats[sbI], S.sb); post(S.seats[bbI], S.bb);
  S.seats[sbI].last = 'SB ' + S.sb; S.seats[bbI].last = 'BB ' + S.bb;
  S.cur = S.bb; S.minR = S.bb; S.toAct = nextIn(S, bbI);
  L(S, `Hand #${S.hand} — dealer ${S.seats[S.dealer].name}`, 'st');
  proceed(G, now);
}
function roundDone(S) {
  const lv = live(S), act = lv.filter(p => !p.allIn), mx = Math.max(...lv.map(p => p.bet));
  if (!act.length) return true;
  if (act.length === 1 && lv.some(p => p.allIn)) return act[0].bet >= mx;
  return act.every(p => p.acted && p.bet === S.cur);
}
export function proceed(G, now) {
  const S = G.pub;
  for (let g = 0; g < 12; g++) {
    const lv = live(S);
    if (lv.length === 1) return uncontested(G, lv[0], now);
    if (roundDone(S)) { if (nextStreet(G, now)) continue; return }
    let i = S.toAct, k = 0;
    while (k++ < 6 && (!inH(S.seats[i]) || S.seats[i].folded || S.seats[i].allIn)) i = (i + 1) % 6;
    S.toAct = i; S.turnStart = now; S.deadline = now + (S.seats[i].bot ? BOT_MS : S.turnMs);
    return;
  }
}
function nextStreet(G, now) {
  const S = G.pub, H = G.sec.hands;
  for (const p of S.seats) if (inH(p)) { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.last = '' }
  S.cur = 0; S.minR = S.bb;
  if (S.street === 3) { showdown(G, now); return false }
  S.street++;
  const d = G.sec.deck;
  if (S.street === 1) S.board.push(d.pop(), d.pop(), d.pop()); else S.board.push(d.pop());
  L(S, `${['', 'Flop', 'Turn', 'River'][S.street]}: ${cc(S.board)} (pot ${potSize(S)})`, 'st');
  S.toAct = nextIn(S, S.dealer);
  if (!S.reveal && live(S).filter(p => !p.allIn).length <= 1) { S.reveal = true; S.seats.forEach((p, i) => { if (inH(p) && !p.folded) p.show = H[i] }) }
  return true;
}
function uncontested(G, p, now) {
  const S = G.pub, pot = potSize(S); p.stack += pot; p.win = true; p.gain = pot;
  for (const q of S.seats) if (q) q.bet = 0;
  L(S, `${p.name} wins ${pot} (no showdown)`, 'w'); S.banner = `${p.name} wins ${pot}`; endHand(G, now);
}
function showdown(G, now) {
  const S = G.pub, H = G.sec.hands; S.reveal = true;
  const lv = [];
  S.seats.forEach((p, i) => { if (inH(p) && !p.folded) { p.show = H[i]; p.score = ev([...H[i], ...S.board]); lv.push(p); L(S, `${p.name} shows ${cc(H[i])} — ${hname(p.score)}`) } });
  const lvls = [...new Set(S.seats.filter(p => p && p.total > 0).map(p => p.total))].sort((a, b) => a - b); let prev = 0; const got = new Map();
  for (const lvl of lvls) {
    let amt = 0; for (const p of S.seats) if (p) amt += Math.max(0, Math.min(p.total, lvl) - prev);
    let el = lv.filter(p => p.total >= lvl); if (!el.length) el = lv; prev = lvl; if (!amt) continue;
    const best = Math.max(...el.map(p => p.score)), w = el.filter(p => p.score === best), sh = Math.floor(amt / w.length); let rem = amt - sh * w.length;
    for (const p of w) { const g = sh + (rem-- > 0 ? 1 : 0); p.stack += g; got.set(p, (got.get(p) || 0) + g) }
  }
  const tot = [...got.values()].reduce((a, b) => a + b, 0);
  const ws = [...got.keys()].filter(p => got.get(p) > p.total || got.size === 1);
  for (const [p, g] of got) { p.gain = g; p.win = true; L(S, `${p.name} wins ${g} — ${hname(p.score)}`, 'w') }
  const nm = ws.map(p => p.name);
  S.banner = (nm.length > 1 ? nm.join(' & ') + ' split ' + tot : (nm[0] || '') + ' wins ' + tot) + (ws[0] ? ' · ' + hname(ws[0].score) : '');
  for (const p of lv) delete p.score;
  endHand(G, now);
}
function endHand(G, now) { const S = G.pub; S.over = true; S.toAct = -1; S.deadline = now + NEXT_MS; for (const p of S.seats) if (p) p.bet = 0 }

export function act(G, i, type, to, now) {
  const S = G.pub, p = S.seats[i], toCall = S.cur - p.bet; let t;
  if (type === 'check' && toCall > 0) type = 'call';
  if (type === 'fold') { p.folded = true; t = 'folds' }
  else if (type === 'check') t = 'checks';
  else if (type === 'call') { const a = Math.min(toCall, p.stack); put(p, a); t = `calls ${a}`; if (!S.street) p.pfC = true }
  else {
    const mx = p.bet + p.stack; to = Math.min(Math.max(Math.round(+to || 0), minTo(S)), mx);
    if (to <= S.cur) { const a = Math.min(toCall, p.stack); put(p, a); t = `calls ${a}` }
    else {
      const bet0 = S.cur === 0; put(p, to - p.bet); if (to - S.cur >= S.minR) S.minR = to - S.cur; S.cur = to;
      for (const q of S.seats) if (q && q !== p) q.acted = false;
      if (!S.street) { S.raises++; p.pfLevel = S.raises } else p.agg++;
      t = (bet0 ? 'bets ' : 'raises to ') + to;
    }
  }
  if (!p.stack && type !== 'fold') { p.allIn = true; t += ' (all-in)' }
  p.acted = true; p.last = t; L(S, `${p.name} ${t}`);
  S.toAct = (i + 1) % 6; proceed(G, now);
}

/* ---------- bots ---------- */
function isIP(S, i) { const o = j => (j - S.dealer - 1 + 12) % 6, m = o(i); return S.seats.every((q, j) => j === i || !inH(q) || q.folded || o(j) < m) }
export function botDecide(G, i) {
  const S = G.pub, p = S.seats[i], hc = G.sec.hands[i], sty = S.lvl === 'casual' ? CAS : STY[p.sty || 'TAG'], toCall = S.cur - p.bet, pot = potSize(S), r = Math.random(), BB = S.bb;
  const fold = toCall ? ['fold'] : ['check'], eff = p.bet + p.stack;
  if (!S.street) {
    const pct = pctOf(hc[0], hc[1]), pos = p.pos, cf = toCall / eff;
    if (!S.raises) {
      const limp = S.seats.filter(q => inH(q) && !q.folded && q.pfC).length;
      const th = ({ UTG: .14, MP: .19, CO: .27, BTN: .44, SB: .36, BB: .14 }[pos] || .2) * sty.open - limp * .02;
      if (pct < th) return ['raise', BB * (pos === 'SB' ? 3 : 2.5) + limp * BB];
      if (!toCall) return ['check'];
      if (pos === 'SB' && limp && pct < .4) return ['call'];
      return fold;
    }
    if (S.raises === 1) {
      const ip = pos === 'BTN' || pos === 'CO';
      let callTh = pos === 'BB' ? (toCall <= BB * 2.5 ? .42 : toCall <= BB * 4 ? .3 : .17) : ip ? .18 : pos === 'SB' ? .08 : .12;
      if (cf > .35) callTh = .05;
      if (pct < .045 * sty.agg || (pct > .13 && pct < .24 && r < .1 * sty.bluff && cf < .15)) { const t = Math.round(S.cur * (ip ? 3 : 3.8)); return ['raise', t > eff * .45 ? eff : t] }
      return pct < callTh * (sty.loose ? 2.4 : 1) ? ['call'] : fold;
    }
    if (pct < .022 || (S.raises === 2 && pct < .03)) { const t = Math.round(S.cur * 2.3); return ['raise', t > eff * .4 ? eff : t] }
    if (pct < .06 && cf < .4 || pct < .035) return ['call'];
    return fold;
  }
  const opps = S.seats.filter(q => q && q !== p && inH(q) && !q.folded).map(q => ({ range: rangeOf(q), agg: q.agg })), n = opps.length;
  const e = equity(hc, S.board, opps, 350).eq, ip = isIP(S, i), po = toCall / (pot + toCall);
  const betTo = f => { let a = Math.max(BB, Math.round(pot * f)); if (a > p.stack * .7) a = p.stack; return p.bet + a };
  const raiseTo = () => { let t = S.cur + Math.round((pot + toCall) * .8); if (t > eff * .6) t = eff; return t };
  const strong = n === 1 ? .72 : .58, good = n === 1 ? .55 : .4, drawy = S.street < 3 && e > .28 && e < .5;
  if (!toCall) {
    if (e > strong) return r < .82 ? ['raise', betTo(.6 + r * .15)] : ['check'];
    if (e > good) return r < .55 * sty.agg ? ['raise', betTo(.5)] : ['check'];
    if (drawy && r < .35 * sty.agg) return ['raise', betTo(.6)];
    if (n === 1 && r < (ip ? .26 : .12) * sty.bluff) return ['raise', betTo(S.street === 3 ? .75 : .5)];
    return ['check'];
  }
  const imp = S.street === 1 ? .04 : S.street === 2 ? .02 : 0;
  if (e > Math.max(.8, strong + .08)) return r < .6 * sty.agg ? ['raise', raiseTo()] : ['call'];
  if (e > strong && r < .25 * sty.agg) return ['raise', raiseTo()];
  if (e + imp + (sty.loose ? .12 : 0) > po + .02) return ['call'];
  if (drawy && n === 1 && r < .08 * sty.bluff && p.stack > toCall * 3) return ['raise', raiseTo()];
  return ['fold'];
}

/* advance timers: start next hand, let a bot act, or time out an idle player */
export function tick(G, now) {
  const S = G.pub; if (!S.running || now < S.deadline) return false;
  if (S.over) { startHand(G, now); return true }
  const i = S.toAct, p = S.seats[i]; if (!p) return false;
  if (p.bot) { const d = botDecide(G, i); act(G, i, d[0], d[1], now); return true }
  p.timeouts = (p.timeouts || 0) + 1; if (p.timeouts >= 2) { p.sitOut = true; L(S, `${p.name} timed out and is sitting out`) }
  act(G, i, S.cur - p.bet > 0 ? 'fold' : 'check', 0, now); return true;
}
