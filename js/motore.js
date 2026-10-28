// Radar Classifiche - il "motore": tutti i calcoli, senza chiamate a YouTube.
// Funziona sia nel browser (window.Motore) sia in Node (module.exports) per poterlo provare.
(function (root) {
  'use strict';

  var GIORNO = 86400000;

  // ---------- piccoli aiuti ----------
  function mediana(a) {
    var s = a.filter(function (x) { return isFinite(x); }).sort(function (x, y) { return x - y; });
    if (!s.length) return 0;
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function percentile(a, p) {
    var s = a.filter(function (x) { return isFinite(x); }).sort(function (x, y) { return x - y; });
    if (!s.length) return 0;
    var i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
    return s[i];
  }
  function limita(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function tondo(x) { return Math.round(x); }
  // scala lineare: v <= a -> 0, v >= b -> 100
  function scala(v, a, b) { if (b === a) return 0; return limita((v - a) / (b - a) * 100, 0, 100); }

  function durataSecondi(iso) {
    var m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null;
  }

  // ---------- classifiche: parole che indicano il formato ----------
  // rank, ranks, ranked, ranking, rankings, tier list, top 3/5/7/10
  var RE_CLASSIFICA = /(^|[^\p{L}])(rank(s|ed|ing|ings)?|tier\s?list|top\s?(3|5|7|10))(?![\p{L}])/iu;
  function eClassifica(titolo) { return RE_CLASSIFICA.test(titolo || ''); }

  // ---------- l'argomento: il video parla davvero di quello? ----------
  function radici(argomento) {
    return (argomento || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .filter(function (w) { return w.length >= 3; })
      .map(function (w) { return w.length > 5 ? w.slice(0, w.length - 2) : w; });
  }
  function parlaDi(testo, rad) {
    if (!rad.length) return true;
    var t = (testo || '').toLowerCase();
    return rad.every(function (r) { return t.indexOf(r) >= 0; });
  }

  // ---------- lingua del titolo (stima semplice) ----------
  // parole tipiche di ogni lingua (tolte quelle che esistono anche in inglese, come "moments" o "die")
  var PAROLE_LINGUA = {
    es: ['los', 'las', 'mejores', 'momentos', 'más', 'peores', 'del', 'graciosos', 'clasificando', 'el', 'de'],
    pt: ['melhores', 'momentos', 'mais', 'piores', 'engraçados', 'os', 'das', 'dos', 'classificando', 'o', 'de'],
    it: ['migliori', 'momenti', 'più', 'peggiori', 'classifica', 'classifico', 'i', 'di', 'dei'],
    fr: ['meilleurs', 'meilleures', 'pires', 'drôles', 'les', 'des', 'du', 'classement', 'de'],
    de: ['besten', 'momente', 'lustigsten', 'der', 'das', 'und', 'schlechtesten'],
    id: ['terbaik', 'momen', 'paling', 'lucu', 'dan', 'yang'],
    tr: ['iyi', 'anlar', 'komik', 've', 'en']
  };
  var FORTI = { es: 'mejores|peores|graciosos|clasificando', pt: 'melhores|piores|engraçados', it: 'migliori|peggiori|classifica|classifico',
    fr: 'meilleurs|meilleures|pires|drôles|classement', de: 'besten|lustigsten|schlechtesten', id: 'terbaik|paling|lucu', tr: 'komik|anlar' };
  function linguaDi(v) {
    var l = (v.lingua || '').slice(0, 2).toLowerCase();
    if (l) return l;
    var t = v.titolo || '';
    if (/[؀-ۿ]/.test(t)) return 'ar';
    if (/[Ѐ-ӿ]/.test(t)) return 'ru';
    if (/[ऀ-ॿ]/.test(t)) return 'hi';
    if (/[฀-๿]/.test(t)) return 'th';
    if (/[가-힯]/.test(t)) return 'ko';
    if (/[぀-ヿ]/.test(t)) return 'ja';
    if (/[一-鿿]/.test(t)) return 'zh';
    var parole = t.toLowerCase().split(/[^\p{L}]+/u);
    var meglio = null, punti = 0;
    for (var k in PAROLE_LINGUA) {
      var pts = parole.filter(function (w) { return PAROLE_LINGUA[k].indexOf(w) >= 0; }).length;
      if (new RegExp('(^|[^\\p{L}])(' + FORTI[k] + ')(?![\\p{L}])', 'iu').test(t)) pts += 2;
      if (pts > punti) { punti = pts; meglio = k; }
    }
    if (punti >= 2) return meglio;
    return 'en';
  }

  // ---------- sicurezza (le 5 cose da evitare del corso) ----------
  var RISCHI = [
    { nome: 'risse e botte', re: /\b(fight|fights|slap|slaps|punch|punched|knockout|ko|beat ?down|brawl|pelea|briga)\b/i },
    { nome: 'sangue e ferite', re: /\b(blood|bloody|gore|injur(y|ies|ed)|broken bone|sangue)\b/i },
    { nome: 'morti', re: /\b(dead body|death|died|dies|killed|fatal|morte|muerte)\b/i },
    { nome: 'bambini in pericolo', re: /\b(kid|kids|child|baby|babies|toddler)\b.*\b(danger|almost|fall|nearly|accident)\b/i },
    { nome: 'contenuti per adulti', re: /\b(sexy|hot girl|bikini|nsfw|18\+|onlyfans|twerk)\b/i },
    { nome: 'armi', re: /\b(gun|guns|shooting|shot dead|weapon)\b/i }
  ];
  function rischiDi(titolo) {
    return RISCHI.filter(function (r) { return r.re.test(titolo || ''); }).map(function (r) { return r.nome; });
  }

  // ---------- prepara i video grezzi presi da YouTube ----------
  // video: {id,titolo,descrizione,canaleId,canale,pubblicato,views,likes,commenti,durata(sec),lingua}
  // canali: {id: {iscritti, videoTot, viewsTot, creato}}
  function prepara(video, canali, ora) {
    ora = ora || Date.now();
    return video.map(function (v) {
      var c = canali[v.canaleId] || {};
      var giorni = Math.max((ora - new Date(v.pubblicato).getTime()) / GIORNO, 1);
      var mediaCanale = c.videoTot > 0 ? c.viewsTot / c.videoTot : 0;
      var o = {};
      for (var k in v) o[k] = v[k];
      o.giorni = giorni;
      o.vpd = v.views / giorni;
      o.iscritti = c.iscritti || 0;
      o.mediaCanale = mediaCanale;
      o.xIscritti = c.iscritti > 0 ? v.views / c.iscritti : null;
      o.xCanale = mediaCanale > 0 ? v.views / mediaCanale : null;
      o.canaleCreato = c.creato || null;
      o.canaleNuovo = c.creato ? (ora - new Date(c.creato).getTime()) < 90 * GIORNO : false;
      o.linguaStimata = linguaDi(v);
      o.rischi = rischiDi(v.titolo);
      return o;
    });
  }

  // ---------- l'analisi completa di un argomento ----------
  function analizza(lista, opzioni) {
    opzioni = opzioni || {};
    var ora = opzioni.ora || Date.now();
    var n = lista.length;
    var r = { shorts: n, avvisi: [] };
    if (n < 10) {
      r.pochiDati = true;
      r.avvisi.push('Ho trovato solo ' + n + ' Shorts: i risultati sono poco affidabili.');
    }
    if (!n) { r.voto = 0; r.giudizio = 'Nessuno Short trovato'; return r; }

    var views = lista.map(function (v) { return v.views; });
    var medianaNicchia = mediana(views);
    r.medianaNicchia = tondo(medianaNicchia);

    // canali
    var perCanale = {};
    lista.forEach(function (v) {
      if (!perCanale[v.canaleId]) perCanale[v.canaleId] = { id: v.canaleId, nome: v.canale, iscritti: v.iscritti, nuovo: v.canaleNuovo, video: [] };
      perCanale[v.canaleId].video.push(v);
    });
    var canali = Object.keys(perCanale).map(function (k) { return perCanale[k]; });
    canali.forEach(function (c) { c.views = c.video.reduce(function (a, v) { return a + v.views; }, 0); });
    canali.sort(function (a, b) { return b.views - a.views; });
    r.canali = canali.length;
    var viewsTot = views.reduce(function (a, b) { return a + b; }, 0);
    r.viewsTotali = viewsTot;

    // ===== VIRALITÀ: l'argomento sta crescendo? =====
    var ult4 = lista.filter(function (v) { return v.giorni <= 28; }).length;
    var prec4 = lista.filter(function (v) { return v.giorni > 28 && v.giorni <= 56; }).length;
    var crescita = prec4 > 0 ? (ult4 - prec4) / prec4 : (ult4 > 0 ? 1 : 0);
    var vUscite = scala(crescita, -0.5, 1);
    var top20 = lista.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 20);
    var nuoviTop = top20.filter(function (v) { return v.giorni <= 30; }).length;
    var vCorrono = scala(nuoviTop / Math.max(top20.length, 1), 0, 0.5);
    var conIscr = lista.filter(function (v) { return v.xIscritti != null; });
    var botto = conIscr.filter(function (v) { return v.xIscritti >= 2; }).length;
    var vBotto = scala(botto / Math.max(conIscr.length, 1), 0.1, 0.6);
    r.viralita = {
      voto: tondo(vUscite * 0.4 + vCorrono * 0.3 + vBotto * 0.3),
      uscite: { voto: tondo(vUscite), ultime4: ult4, prime4: prec4, crescitaPct: tondo(crescita * 100) },
      corrono: { voto: tondo(vCorrono), nuoviTraTop20: nuoviTop, top: top20.length },
      piccoliBotto: { voto: tondo(vBotto), quanti: botto, su: conIscr.length }
    };

    // ===== OPPORTUNITÀ: un canale piccolo può farcela? =====
    var piccoli = lista.filter(function (v) { return v.iscritti > 0 && v.iscritti < 10000; });
    var medPiccoli = mediana(piccoli.map(function (v) { return v.views; }));
    var oPiccoli = piccoli.length >= 3 ? scala(medPiccoli / Math.max(medianaNicchia, 1), 0.1, 1) : 0;
    var canaliNuovi = canali.filter(function (c) { return c.nuovo; });
    var nuoviSopra = canaliNuovi.filter(function (c) { return c.video.some(function (v) { return v.views > medianaNicchia; }); }).length;
    var oNuovi = scala(nuoviSopra, 0, 8);
    var top5 = canali.slice(0, 5).reduce(function (a, c) { return a + c.views; }, 0);
    var quotaTop5 = viewsTot > 0 ? top5 / viewsTot : 1;
    var oSpazio = scala(1 - quotaTop5, 0.1, 0.7);
    r.opportunita = {
      voto: tondo(oPiccoli * 0.45 + oNuovi * 0.2 + oSpazio * 0.35),
      piccoli: { voto: tondo(oPiccoli), mediana: tondo(medPiccoli), quanti: piccoli.length,
        fascia: [tondo(percentile(piccoli.map(function (v) { return v.views; }), 0.25)), tondo(percentile(piccoli.map(function (v) { return v.views; }), 0.75))] },
      canaliNuovi: { voto: tondo(oNuovi), nuovi: canaliNuovi.length, sopraMedia: nuoviSopra },
      spazio: { voto: tondo(oSpazio), quotaTop5Pct: tondo(quotaTop5 * 100),
        top5: canali.slice(0, 5).map(function (c) { return { nome: c.nome, iscritti: c.iscritti, views: c.views, quotaPct: tondo(c.views / Math.max(viewsTot, 1) * 100) }; }) }
    };

    // ===== REPLICABILITÀ: si ripete o è fortuna? =====
    var ripetuti = canali.filter(function (c) { return c.video.length >= 3; });
    var ripetutiOk = ripetuti.filter(function (c) {
      var sopra = c.video.filter(function (v) { return v.views > medianaNicchia; }).length;
      return sopra / c.video.length >= 0.5;
    }).length;
    var rRipete = ripetuti.length ? scala(ripetutiOk / ripetuti.length, 0.1, 0.8) : 40;
    var recenti = lista.filter(function (v) { return v.giorni <= 90; });
    var vecchi = lista.filter(function (v) { return v.giorni > 90; });
    var medRec = mediana(recenti.map(function (v) { return v.vpd; }));
    var medVec = mediana(vecchi.map(function (v) { return v.vpd; }));
    var rapporto = medVec > 0 ? medRec / medVec : 1;
    var rRegge = (recenti.length >= 5 && vecchi.length >= 5) ? scala(rapporto, 0.3, 1.2) : 50;
    var sopra100k = lista.filter(function (v) { return v.views >= 100000; }).length;
    var rProb = scala(sopra100k / n, 0.02, 0.25);
    r.replicabilita = {
      voto: tondo(rRipete * 0.4 + rRegge * 0.25 + rProb * 0.35),
      ripete: { voto: tondo(rRipete), canaliRipetuti: ripetuti.length, vannoBene: ripetutiOk },
      regge: { voto: tondo(rRegge), rapporto: Math.round(rapporto * 100) / 100 },
      probabilita: { voto: tondo(rProb), sopra100k: sopra100k, sopra10k: lista.filter(function (v) { return v.views >= 10000; }).length,
        sopra1M: lista.filter(function (v) { return v.views >= 1000000; }).length, su: n }
    };

    // ===== REGOLE DEL CORSO =====
    // Senza lingua: il tema va forte in più lingue diverse?
    var forti = lista.filter(function (v) { return v.views >= medianaNicchia; });
    var lingueForti = {};
    forti.forEach(function (v) { lingueForti[v.linguaStimata] = (lingueForti[v.linguaStimata] || 0) + 1; });
    var nLingue = Object.keys(lingueForti).filter(function (l) { return lingueForti[l] >= 2; }).length;
    r.senzaLingua = {
      lingue: nLingue,
      elenco: Object.keys(lingueForti).sort(function (a, b) { return lingueForti[b] - lingueForti[a]; }).map(function (l) { return { lingua: l, shorts: lingueForti[l] }; }),
      giudizio: nLingue >= 3 ? 'si' : (nLingue === 2 ? 'forse' : 'no')
    };

    // Sta morendo? Confronta gli ultimi 30 giorni con i 30-90 giorni prima
    var ult30 = lista.filter(function (v) { return v.giorni <= 30; });
    var g3090 = lista.filter(function (v) { return v.giorni > 30 && v.giorni <= 90; });
    var canaliUlt30 = {}; ult30.forEach(function (v) { canaliUlt30[v.canaleId] = 1; });
    var canali3090 = {}; g3090.forEach(function (v) { canali3090[v.canaleId] = 1; });
    var medUlt30 = mediana(ult30.map(function (v) { return v.vpd; }));
    var med3090 = mediana(g3090.map(function (v) { return v.vpd; }));
    var stato = 'stabile';
    if (ult30.length >= 3 && g3090.length >= 3) {
      var ritmoUscite = ult30.length / (g3090.length / 2); // 30 gg contro media di 30 gg
      var ritmoViews = med3090 > 0 ? medUlt30 / med3090 : 1;
      if (ritmoUscite >= 1.2 && ritmoViews >= 0.7) stato = 'cresce';
      else if (ritmoUscite < 0.6 && ritmoViews < 0.8) stato = 'morendo';
      else if (ritmoViews < 0.5) stato = 'cala';
    } else if (ult30.length >= 3 && g3090.length < 3) stato = 'nuovo';
    else if (ult30.length < 3 && g3090.length >= 3) stato = 'fermo';
    r.trend = { stato: stato, ultimi30: ult30.length, prima30_90: g3090.length,
      canaliUltimi30: Object.keys(canaliUlt30).length, canaliPrima: Object.keys(canali3090).length };

    // Grandezza: quanta gente può raggiungere (visualizzazioni degli ultimi 30 giorni del canale più forte e di tutti)
    var perCanale30 = {};
    ult30.forEach(function (v) { perCanale30[v.canaleId] = (perCanale30[v.canaleId] || 0) + v.views; });
    var max30 = 0; for (var k in perCanale30) max30 = Math.max(max30, perCanale30[k]);
    r.grandezza = { viewsUltimi30: ult30.reduce(function (a, v) { return a + v.views; }, 0), migliorCanale30: max30 };

    // Sicurezza
    var conRischio = lista.filter(function (v) { return v.rischi.length; });
    var conteggio = {};
    conRischio.forEach(function (v) { v.rischi.forEach(function (x) { conteggio[x] = (conteggio[x] || 0) + 1; }); });
    var quotaRischio = conRischio.length / n;
    r.sicurezza = {
      semaforo: quotaRischio >= 0.25 ? 'rosso' : (quotaRischio >= 0.08 ? 'giallo' : 'verde'),
      quotaPct: tondo(quotaRischio * 100),
      motivi: Object.keys(conteggio).sort(function (a, b) { return conteggio[b] - conteggio[a]; }).map(function (x) { return { motivo: x, shorts: conteggio[x] }; })
    };

    // Durata migliore
    var fasce = [
      { nome: 'sotto 15 s', da: 0, a: 15 }, { nome: '15 - 30 s', da: 15, a: 30 },
      { nome: '30 - 60 s', da: 30, a: 60 }, { nome: 'oltre 1 min', da: 60, a: 9999 }
    ];
    fasce.forEach(function (f) {
      var dentro = lista.filter(function (v) { return v.durata != null && v.durata >= f.da && v.durata < f.a; });
      f.shorts = dentro.length; f.mediana = tondo(mediana(dentro.map(function (v) { return v.views; })));
    });
    var valide = fasce.filter(function (f) { return f.shorts >= 3; });
    var migliore = valide.slice().sort(function (a, b) { return b.mediana - a.mediana; })[0] || null;
    var buoni = lista.filter(function (v) { return v.views >= percentile(views, 0.75) && v.durata; });
    r.durata = { fasce: fasce, migliore: migliore ? migliore.nome : null,
      tipicaDeiMigliori: tondo(mediana(buoni.map(function (v) { return v.durata; }))) };

    // Commenti ogni 1.000
    var conComm = lista.filter(function (v) { return v.views > 0 && v.commenti != null; });
    var sv = conComm.reduce(function (a, v) { return a + v.views; }, 0);
    r.commenti = { ogni1000: sv > 0 ? Math.round(conComm.reduce(function (a, v) { return a + v.commenti; }, 0) / sv * 10000) / 10 : null,
      likeOgni1000: sv > 0 ? Math.round(conComm.reduce(function (a, v) { return a + (v.likes || 0); }, 0) / sv * 10000) / 10 : null };

    // I video modello: i più forti rispetto al loro canale (il "fuori serie" del corso)
    r.modelli = lista.filter(function (v) { return v.xCanale != null && v.views >= 50000 && !v.rischi.length; })
      .sort(function (a, b) { return b.xCanale - a.xCanale; }).slice(0, 8)
      .map(function (v) { return { id: v.id, titolo: v.titolo, canale: v.canale, iscritti: v.iscritti, views: v.views, vpd: tondo(v.vpd), xCanale: Math.round(v.xCanale * 10) / 10, durata: v.durata }; });

    // ===== VOTO FINALE =====
    var base = r.viralita.voto * 0.35 + r.opportunita.voto * 0.3 + r.replicabilita.voto * 0.35;
    var aggiustamenti = [];
    if (r.sicurezza.semaforo === 'rosso') { base -= 20; aggiustamenti.push({ motivo: 'tema a rischio per le regole di YouTube', punti: -20 }); }
    else if (r.sicurezza.semaforo === 'giallo') { base -= 7; aggiustamenti.push({ motivo: 'alcuni video a rischio: scegli bene le clip', punti: -7 }); }
    if (r.trend.stato === 'morendo') { base -= 15; aggiustamenti.push({ motivo: 'il tema sta morendo', punti: -15 }); }
    else if (r.trend.stato === 'cala') { base -= 7; aggiustamenti.push({ motivo: 'il tema sta calando', punti: -7 }); }
    else if (r.trend.stato === 'cresce' || r.trend.stato === 'nuovo') { base += 5; aggiustamenti.push({ motivo: 'il tema sta crescendo', punti: 5 }); }
    if (r.senzaLingua.giudizio === 'si') { base += 5; aggiustamenti.push({ motivo: 'funziona in più lingue: si capisce senza parole', punti: 5 }); }
    if (r.pochiDati) { base = Math.min(base, 55); aggiustamenti.push({ motivo: 'pochi dati: voto limitato a 55', punti: 0 }); }
    r.voto = tondo(limita(base, 0, 100));
    r.aggiustamenti = aggiustamenti;
    r.giudizio = r.voto >= 65 ? 'Sì, vale la pena' : (r.voto >= 45 ? 'Da provare' : 'Meglio di no');
    // metodo 3-2: sicura o prova?
    r.tipo = (r.voto >= 65 && r.replicabilita.voto >= 60 && r.sicurezza.semaforo !== 'rosso') ? 'sicura' : (r.voto >= 45 ? 'prova' : 'no');
    return r;
  }

  var Motore = {
    mediana: mediana, percentile: percentile, durataSecondi: durataSecondi,
    eClassifica: eClassifica, radici: radici, parlaDi: parlaDi, linguaDi: linguaDi, rischiDi: rischiDi,
    prepara: prepara, analizza: analizza
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motore;
  else root.Motore = Motore;
})(typeof window !== 'undefined' ? window : this);
