// TX Poker dealer: the only place that knows the deck and everyone's hole cards.
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as C from "./core.js";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const rid = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.random() * 32 | 0]).join("");
const tok = () => crypto.randomUUID().replace(/-/g, "");
const clean = (s: unknown) => String(s ?? "").replace(/[<>&"'`]/g, "").trim().slice(0, 14) || "Player";

class Bad extends Error {}
const need = (c: unknown, m: string) => { if (!c) throw new Bad(m) };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    return json(await handle(b));
  } catch (e) {
    return json({ error: e instanceof Bad ? e.message : "Server error: " + (e as Error).message }, e instanceof Bad ? 400 : 500);
  }
});

// deno-lint-ignore no-explicit-any
type G = { pub: any; sec: any };

async function handle(b: any) {
  const now = Date.now();
  if (b.op === "create") {
    const G: G = { pub: C.newState(), sec: { tokens: {}, deck: [], hands: [] } };
    const S = G.pub, t = tok();
    S.seats[0] = C.newPlayer(clean(b.name));
    const bots = Math.max(0, Math.min(5, +b.bots || 0));
    for (let i = 1; i <= bots; i++) S.seats[i] = C.newPlayer(C.botName(S), true);
    if (b.lvl === "strong") S.lvl = "strong";
    G.sec.tokens[0] = t;
    C.L(S, `${S.seats[0].name} opened the table`);
    for (let k = 0; k < 5; k++) {
      const id = rid();
      const { error } = await db.from("rooms").insert({ id, state: S });
      if (error) continue;
      await db.from("room_secrets").insert({ id, data: G.sec });
      return { room: id, seat: 0, token: t, state: S, cards: null };
    }
    throw new Error("could not create room");
  }

  const room = String(b.room || "").toUpperCase();
  need(/^[A-Z0-9]{5}$/.test(room), "Bad room code");

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await db.rpc("load_room", { rid: room });
    if (error) throw new Error(error.message);
    need(data, "Room not found");
    const G: G = { pub: data.state, sec: data.secret }, S = G.pub;
    let me = -1;
    for (const [k, v] of Object.entries(G.sec.tokens || {})) if (v && v === b.token) me = +k;
    if (me >= 0 && !S.seats[me]) me = -1;
    let changed = true, extra: Record<string, unknown> = {};

    switch (b.op) {
      case "view": changed = false; break;
      case "tick": changed = C.tick(G, now); break;
      case "join": {
        if (me >= 0) { changed = false; break }
        let seat = S.seats.findIndex((p: any) => !p);
        if (seat < 0) seat = S.seats.findIndex((p: any) => p && p.bot && (!p.inHand || p.folded || S.over));
        need(seat >= 0, "Table is full");
        const old = S.seats[seat];
        if (old && old.bot) C.L(S, `${old.name} gives up the seat`);
        S.seats[seat] = C.newPlayer(clean(b.name));
        const t = tok(); G.sec.tokens[seat] = t; me = seat; extra = { token: t };
        if (!S.seats.some((p: any, i: number) => p && !p.bot && i !== seat && G.sec.tokens[i])) S.host = seat;
        C.L(S, `${S.seats[seat].name} sat down`);
        break;
      }
      case "act": {
        need(me >= 0, "You are not seated");
        need(!S.over && S.toAct === me, "Not your turn");
        S.seats[me].timeouts = 0;
        C.act(G, me, String(b.type), +b.to || 0, now);
        break;
      }
      case "start": need(me === S.host, "Only the host can start"); S.running = true; if (S.over) C.startHand(G, now); break;
      case "pause": need(me === S.host, "Only the host can pause"); S.running = false; break;
      case "addbot": {
        need(me === S.host, "Only the host can add bots");
        const seat = S.seats.findIndex((p: any) => !p); need(seat >= 0, "No empty seat");
        S.seats[seat] = C.newPlayer(C.botName(S), true); C.L(S, `${S.seats[seat].name} (bot) sat down`); break;
      }
      case "kick": {
        need(me === S.host, "Only the host can remove players");
        const k = +b.seat, p = S.seats[k]; need(p && k !== me, "Nobody to remove");
        if (p.inHand && !S.over && !p.folded) {
          p.leave = true;
          if (S.toAct === k) C.act(G, k, "fold", 0, now); else { p.folded = true; p.last = "folds"; C.proceed(G, now) }
        } else { S.seats[k] = null; delete G.sec.tokens[k] }
        C.L(S, `${p.name} was removed`); break;
      }
      case "leave": {
        need(me >= 0, "You are not seated");
        const p = S.seats[me];
        if (p.inHand && !S.over && !p.folded) {
          p.leave = true;
          if (S.toAct === me) C.act(G, me, "fold", 0, now); else { p.folded = true; p.last = "folds"; C.proceed(G, now) }
        } else { C.L(S, `${p.name} left the table`); S.seats[me] = null; delete G.sec.tokens[me] }
        if (S.host === me) { const h = S.seats.findIndex((q: any, i: number) => q && !q.bot && i !== me && G.sec.tokens[i]); if (h >= 0) S.host = h }
        break;
      }
      case "rebuy": {
        need(me >= 0, "You are not seated");
        const p = S.seats[me];
        need(p.stack < S.start, "You already have a full stack");
        need(!p.inHand || p.folded || S.over, "Wait until you're out of the hand");
        p.buyin += S.start - p.stack; p.stack = S.start; p.sitOut = false; C.L(S, `${p.name} rebuys to ${S.start}`); break;
      }
      case "sit": {
        need(me >= 0, "You are not seated");
        const p = S.seats[me]; p.sitOut = !!b.out; p.timeouts = 0; C.L(S, `${p.name} ${p.sitOut ? "sits out" : "is back"}`); break;
      }
      case "settings": {
        need(me === S.host, "Only the host can change settings");
        if (b.lvl === "casual" || b.lvl === "strong") S.lvl = b.lvl;
        if ([15000, 30000, 60000].includes(+b.turnMs)) S.turnMs = +b.turnMs;
        if ([1, 2, 5].includes(+b.sb)) { S.sb = +b.sb; S.bb = +b.sb * 2 }
        break;
      }
      default: throw new Bad("Unknown op");
    }

    if (changed) {
      const { data: ok, error: e2 } = await db.rpc("save_room", { rid: room, v: data.version, st: S, sec: G.sec });
      if (e2) throw new Error(e2.message);
      if (!ok) { if (b.op === "tick") return { state: null, busy: true }; continue }
    }
    const cards = me >= 0 && S.seats[me]?.inHand && G.sec.hands?.[me] ? G.sec.hands[me] : null;
    return { room, seat: me, state: S, cards, hand: S.hand, ...extra };
  }
  throw new Bad("Table is busy, try again");
}
