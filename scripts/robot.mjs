// Radar Classifiche - il robot del mattino.
// 1) Scopre le classifiche Shorts che vanno forte negli ultimi 3 giorni.
// 2) Ne ricava gli argomenti che tornano su più canali.
// 3) Analizza i migliori + gli argomenti seguiti con lo stesso motore del sito (ricerca Veloce).
// 4) Salva tutto in data/robot/ultimo.json e data/robot/storico/AAAA-MM-GG.json.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.join(QUI, '..');
const CHIAVE = process.env.YOUTUBE_API_KEY;
const TETTO = +(process.env.TETTO_CREDITI || 9500);   // il robot non supera mai questi crediti
const QUANTI_TEMI = +(process.env.QUANTI_TEMI || 16);
const PROFONDE = +(process.env.PROFONDE || 3);          // i migliori li rianalizza con la ricerca Profonda
const PROVA = process.env.ROBOT_PROVA === '1';          // usa un finto YouTube (per provarlo senza chiave)

if (!CHIAVE && !PROVA) { console.error('Manca il segreto YOUTUBE_API_KEY nelle impostazioni del repository.'); process.exit(1); }

// La chiave potrebbe accettare solo richieste dal sito: le mandiamo "come se" venissero dal sito.
const fetchVero = globalThis.fetch;
globalThis.fetch = (url, opz = {}) => fetchVero(url, { ...opz, headers: { ...(opz.headers || {}), Referer: 'https://kebbenn.github.io/radar-classifiche/' } });
if (PROVA) globalThis.fetch = (await import('./finto-youtube.mjs')).default;

globalThis.window = globalThis;
const Motore = require('../js/motore.js');
globalThis.Motore = Motore;
require('../js/youtube.js');
const YT = globalThis.YT;

let crediti = 0;
const errori = [];
const ora = Date.now();
const giorniFa = g => new Date(ora - g * 86400000).toISOString();

const pausa = ms => new Promise(ok => setTimeout(ok, PROVA ? 0 : ms));
async function chiama(percorso, parametri, costo, tentativo = 0) {
  if (crediti + costo > TETTO) throw Object.assign(new Error('tetto crediti raggiunto'), { tetto: true });
  const q = new URLSearchParams({ ...parametri, key: CHIAVE || 'FINTA' });
  const r = await fetch('https://www.googleapis.com/youtube/v3/' + percorso + '?' + q);
  const j = await r.json();
  if (!r.ok) {
    const m = j?.error?.errors?.[0]?.reason || r.status;
    if ((m === 'rateLimitExceeded' || m === 'userRateLimitExceeded' || r.status >= 500) && tentativo < 4) { await pausa([3000, 10000, 30000, 60000][tentativo]); return chiama(percorso, parametri, costo, tentativo + 1); }
    crediti += costo;
    throw Object.assign(new Error('YouTube: ' + m), { motivo: m });
  }
  crediti += costo;
  await pausa(400);
  return j;
}
const aPezzi = (l, n) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

// ---------- 1) SCOPERTA ----------
const CATEGORIE = [null, '15', '17', '23', '24', '22', '28', '2', '26', '20']; // tutte, animali, sport, comici, intrattenimento, persone, scienza, auto, fai da te, giochi
async function scopri() {
  const ids = new Set();
  for (const cat of CATEGORIE) {
    for (const q of ['ranking', 'ranked', 'tier list', 'top 10']) {
      if (q !== 'ranking' && cat) continue; // le altre parole solo senza categoria, per risparmiare
      const par = { part: 'snippet', type: 'video', videoDuration: 'short', maxResults: 50, q, order: 'viewCount', publishedAfter: giorniFa(3) };
      if (cat) par.videoCategoryId = cat;
      try { const j = await chiama('search', par, 100); (j.items || []).forEach(it => it.id?.videoId && ids.add(it.id.videoId)); }
      catch (e) { if (e.tetto || e.motivo === 'quotaExceeded') throw e; errori.push('scoperta ' + (cat || 'tutte') + ': ' + e.message); }
    }
  }
  const video = [];
  for (const p of aPezzi([...ids], 50)) {
    const j = await chiama('videos', { part: 'snippet,statistics,contentDetails,player', id: p.join(','), maxHeight: 640 }, 1);
    for (const it of j.items || []) {
      const s = it.snippet || {}, st = it.statistics || {}, pl = it.player || {};
      const dur = Motore.durataSecondi(it.contentDetails?.duration);
      if (dur == null || dur > 180) continue;
      if (pl.embedWidth && pl.embedHeight && +pl.embedWidth > +pl.embedHeight) continue;
      if (!Motore.eClassifica(s.title)) continue;
      const giorni = Math.max((ora - new Date(s.publishedAt)) / 86400000, 0.25);
      video.push({ id: it.id, titolo: s.title, canaleId: s.channelId, canale: s.channelTitle, views: +st.viewCount || 0, vpd: (+st.viewCount || 0) / giorni });
    }
  }
  return video;
}

// ---------- 2) ARGOMENTI dai titoli ----------
const GENERICHE = new Set(('the a an of in on at to for and or with from by is are be this that these those my your his her their it its ' +
  'best worst most top rank ranks ranked ranking rankings tier list moments moment part shorts short viral funny fyp foryou foryoupage ' +
  'trending video videos new random things thing what who when ever all time vs you me we i so very craziest funniest weirdest ' +
  'greatest biggest smallest strangest scariest coolest crazy cool insane epic famous people person world every which why how ' +
  'mejores peores momentos melhores piores momenti migliori peggiori meilleurs besten momente edition reaction reactions fails fail ' +
  'clips clip compilation season episode official full first last more than like just here there out up down over into let lets ' +
  'one two three four five six seven eight nine ten got get see watch try tried wait end until make made way ways ' +
  'legendary ultimate dangerous sound sounds edit edits satisfying amazing unbelievable unexpected hardest easiest rarest impossible ' +
  'strongest fastest smartest dumbest cutest wholesome scary scariest deadliest dramatic iconic unique real fake perfect extreme ' +
  'satisfy oddly expensive cheapest weird strange hilarious savage brutal rare classic popular famous level levels pov meme ' +
  'trend trends pro pros ballon edition version tiktok youtube instagram reels short shorts subscribe follow like comment').split(' '));
const radice = w => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

function argomenti(video, gia) {
  const termini = new Map();
  for (const v of video) {
    const parole = new Set();
    v.titolo.toLowerCase().replace(/#[^\s]+/g, ' ').split(/[^\p{L}]+/u).forEach(w => {
      if (w.length < 3 || GENERICHE.has(w) || /^\d+$/.test(w)) return;
      parole.add(w);
    });
    for (const w of parole) {
      const k = radice(w);
      if (!termini.has(k)) termini.set(k, { forme: {}, canali: new Map(), video: new Set() });
      const t = termini.get(k);
      t.forme[w] = (t.forme[w] || 0) + 1;
      t.video.add(v.id);
      t.canali.set(v.canaleId, Math.max(t.canali.get(v.canaleId) || 0, v.vpd));
    }
  }
  let lista = [...termini.entries()].filter(([, t]) => t.canali.size >= 2).map(([k, t]) => ({
    radice: k, parola: Object.entries(t.forme).sort((a, b) => b[1] - a[1])[0][0], canali: t.canali.size, video: t.video,
    punteggio: [...t.canali.values()].reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.punteggio - a.punteggio);
  // toglie i doppioni: due parole che stanno quasi sempre negli stessi video sono lo stesso argomento
  const scelti = [];
  for (const t of lista) {
    if (gia.has(t.radice)) continue;
    const doppio = scelti.some(s => { let c = 0; t.video.forEach(id => s.video.has(id) && c++); return c / Math.min(t.video.size, s.video.size) >= 0.7; });
    if (!doppio) scelti.push(t);
    if (scelti.length >= QUANTI_TEMI) break;
  }
  return scelti.map(t => ({ argomento: t.parola, canali: t.canali, viewsAlGiornoScoperta: Math.round(t.punteggio),
    esempi: video.filter(v => t.video.has(v.id)).sort((a, b) => b.vpd - a.vpd).slice(0, 3).map(v => ({ id: v.id, titolo: v.titolo, canale: v.canale, views: v.views })) }));
}

// ---------- 3) ANALISI (stesso motore del sito) ----------
function riassunto(arg, rec, extra) {
  const r = rec.r;
  return {
    argomento: arg, ...extra,
    voto: r.voto, giudizio: r.giudizio, tipo: r.tipo,
    viralita: r.viralita?.voto ?? null, opportunita: r.opportunita?.voto ?? null, replicabilita: r.replicabilita?.voto ?? null,
    andamento: r.trend?.stato, sicurezza: r.sicurezza?.semaforo, motiviRischio: (r.sicurezza?.motivi || []).map(m => m.motivo),
    senzaLingua: r.senzaLingua?.giudizio, shorts: r.shorts, canaliTrovati: r.canali,
    viewsTipicheNormale: r.normali?.mediana ?? null, durataMigliori: r.durata?.tipicaDeiMigliori ?? null,
    piccoliSopra10k: r.opportunita?.piccoli ? { quanti: r.opportunita.piccoli.sopra10k, su: r.opportunita.piccoli.quanti } : null,
    paroleForti: (r.parole || []).slice(0, 5).map(p => p.parola),
    aggiustamenti: r.aggiustamenti, avvisi: r.avvisi,
    modelli: (r.modelli || []).slice(0, 5).map(m => ({ ...m, link: 'https://www.youtube.com/shorts/' + m.id })),
    creditiUsati: rec.crediti, ricerca: rec.modo || 'veloce'
  };
}
async function analizza(arg, modo = 'veloce') {
  const costo = YT.costoStimato(modo);
  if (crediti + costo > TETTO) throw Object.assign(new Error('tetto crediti raggiunto'), { tetto: true });
  await pausa(2000); // una piccola pausa tra un argomento e l'altro
  const d = await YT.raccogli(arg, modo, CHIAVE || 'FINTA');
  crediti += d.crediti;
  const lista = Motore.prepara(d.video, d.canali, ora);
  return { r: Motore.analizza(lista, { argomento: arg, ora }), crediti: d.crediti, modo };
}

// ---------- via ----------
const seguiti = JSON.parse(fs.readFileSync(path.join(RADICE, 'data/seguiti.json'), 'utf8')).argomenti || [];
const risultato = { quando: new Date(ora).toISOString(), giorno: new Date(ora).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
  versione: 1, scoperte: [], seguiti: [], videoScoperti: 0, crediti: 0, tetto: TETTO, errori };
try {
  const video = await scopri();
  risultato.videoScoperti = video.length;
  const temi = argomenti(video, new Set(seguiti.map(s => radice(s.toLowerCase()))));
  console.log('Argomenti scoperti:', temi.map(t => t.argomento).join(', ') || 'nessuno');
  for (const arg of seguiti) {
    try { risultato.seguiti.push(riassunto(arg, await analizza(arg), { fonte: 'seguito' })); }
    catch (e) { if (e.tetto || e.motivo === 'quotaExceeded') throw e; errori.push(arg + ': ' + e.message); }
  }
  for (const t of temi) {
    try { risultato.scoperte.push(riassunto(t.argomento, await analizza(t.argomento), { fonte: 'scoperta', canaliNellaScoperta: t.canali, esempiScoperta: t.esempi })); }
    catch (e) { if (e.tetto || e.motivo === 'quotaExceeded') throw e; errori.push(t.argomento + ': ' + e.message); }
  }
  // i migliori: di nuovo con la ricerca Profonda (guarda anche 5-6 mesi fa e più video normali)
  risultato.scoperte.sort((a, b) => b.voto - a.voto);
  for (const x of risultato.scoperte.slice(0, PROFONDE)) {
    if (crediti + YT.costoStimato('profonda') > TETTO) break;
    try {
      const piu = riassunto(x.argomento, await analizza(x.argomento, 'profonda'), { fonte: 'scoperta', canaliNellaScoperta: x.canaliNellaScoperta, esempiScoperta: x.esempiScoperta, votoVeloce: x.voto });
      risultato.scoperte[risultato.scoperte.indexOf(x)] = piu;
    } catch (e) { if (e.tetto || e.motivo === 'quotaExceeded') throw e; errori.push(x.argomento + ' (profonda): ' + e.message); }
  }
} catch (e) {
  errori.push(e.tetto ? 'Mi sono fermato: raggiunto il tetto di ' + TETTO + ' crediti.' :
    e.motivo === 'quotaExceeded' ? 'Crediti YouTube di oggi finiti: mi sono fermato.' : 'Errore: ' + e.message);
}
risultato.scoperte.sort((a, b) => b.voto - a.voto);
risultato.crediti = crediti;

const dir = path.join(RADICE, 'data/robot'), dirS = path.join(dir, 'storico');
fs.mkdirSync(dirS, { recursive: true });
const testo = JSON.stringify(risultato, null, 1);
fs.writeFileSync(path.join(dir, 'ultimo.json'), testo);
fs.writeFileSync(path.join(dirS, risultato.giorno + '.json'), testo);
// tiene solo gli ultimi 60 giorni
const giorni = fs.readdirSync(dirS).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
giorni.slice(0, Math.max(0, giorni.length - 60)).forEach(f => fs.unlinkSync(path.join(dirS, f)));
fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify({ giorni: giorni.slice(-60).map(f => f.slice(0, 10)).reverse() }, null, 1));
console.log('Fatto. Crediti usati:', crediti, '· Argomenti analizzati:', risultato.scoperte.length + risultato.seguiti.length, '· Errori:', errori.length);
errori.forEach(e => console.log(' -', e));
if (!risultato.scoperte.length && !risultato.seguiti.length) process.exit(1);
