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
  // Le ricerche prendono i più visti di 3 periodi alla pari:
  // A = ultimi 30 giorni, B = da 30 a 60 giorni fa, C = da 150 a 180 giorni fa (solo nella Profonda). Tutti lunghi uguali.
  // Quando un dato manca il valore è null: si scrive "non trovato" e non conta nel voto.
  function media(pesi) {
    var tot = 0, p = 0;
    pesi.forEach(function (x) { if (x[0] != null) { tot += x[0] * x[1]; p += x[1]; } });
    return p ? tot / p : null;
  }
  function analizza(lista, opzioni) {
    opzioni = opzioni || {};
    var n = lista.length;
    var r = { shorts: n, avvisi: [] };
    if (n < 10) {
      r.pochiDati = true;
      r.avvisi.push('Ho trovato solo ' + n + ' Shorts: i risultati sono poco affidabili.');
    }
    if (!n) { r.voto = 0; r.giudizio = 'Nessuno Short trovato'; r.tipo = 'no'; return r; }

    var views = lista.map(function (v) { return v.views; });
    var medianaNicchia = mediana(views);
    r.medianaNicchia = tondo(medianaNicchia);
    // T = i più visti di ogni periodo; N = i video normali (ultimi usciti, andati bene o male)
    var haGruppi = lista.some(function (v) { return v.top || v.normale; });
    var T = haGruppi ? lista.filter(function (v) { return v.top; }) : lista;
    var N = haGruppi ? lista.filter(function (v) { return v.normale; }) : lista;
    var nOk = N.length >= 8;
    var medianaN = nOk ? mediana(N.map(function (v) { return v.views; })) : null;
    r.normali = { quanti: N.length, mediana: medianaN == null ? null : tondo(medianaN) };
    var A = T.filter(function (v) { return v.giorni <= 30; });
    var Amaturi = A.filter(function (v) { return v.giorni >= 3; }); // i video di 1-2 giorni non sono ancora cresciuti
    var B = T.filter(function (v) { return v.giorni > 30 && v.giorni <= 60; });
    var C = T.filter(function (v) { return v.giorni > 150 && v.giorni <= 180; });
    function topMediana(g) {
      var s = g.map(function (v) { return v.views; }).sort(function (a, b) { return b - a; }).slice(0, 20);
      return s.length >= 3 ? mediana(s) : null;
    }
    var mA = topMediana(Amaturi), mB = topMediana(B), mC = topMediana(C);
    r.periodi = { ultimi30: A.length, da30a60: B.length, da150a180: C.length,
      tipicheUltimi30: mA == null ? null : tondo(mA), tipicheDa30a60: mB == null ? null : tondo(mB), tipicheDa150a180: mC == null ? null : tondo(mC) };

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

    // ===== VIRALITÀ: l'argomento sta tirando adesso? =====
    var rapportoAB = (mA != null && mB != null && mB > 0) ? mA / mB : null;
    var vOra = rapportoAB == null ? null : scala(rapportoAB, 0.4, 1.8);
    var canaliA = {}; Amaturi.filter(function (v) { return v.views >= Math.max(medianaNicchia, 10000); }).forEach(function (v) { canaliA[v.canaleId] = 1; });
    var nCanaliForti = Object.keys(canaliA).length;
    var vCanali = A.length >= 3 ? scala(nCanaliForti, 0, 35) : null;
    var conIscr = N.filter(function (v) { return v.xIscritti != null; });
    var botto = conIscr.filter(function (v) { return v.xIscritti >= 2; }).length;
    var vBotto = conIscr.length >= 8 ? scala(botto / conIscr.length, 0.1, 0.85) : null;
    var vv = media([[vOra, 0.4], [vCanali, 0.3], [vBotto, 0.3]]);
    r.viralita = {
      voto: vv == null ? null : tondo(vv),
      ora: { voto: vOra == null ? null : tondo(vOra), rapporto: rapportoAB == null ? null : Math.round(rapportoAB * 100) / 100 },
      canaliForti: { voto: vCanali == null ? null : tondo(vCanali), quanti: nCanaliForti },
      piccoliBotto: { voto: vBotto == null ? null : tondo(vBotto), quanti: botto, su: conIscr.length }
    };

    // ===== OPPORTUNITÀ: un canale piccolo può farcela? =====
    var piccoli = N.filter(function (v) { return v.iscritti > 0 && v.iscritti < 10000; });
    var vp = piccoli.map(function (v) { return v.views; });
    var medPiccoli = piccoli.length ? mediana(vp) : null;
    var piccoliSopra10k = piccoli.filter(function (v) { return v.views >= 10000; }).length;
    var oPiccoli = (nOk && piccoli.length >= 3) ? scala(piccoliSopra10k / piccoli.length, 0.05, 0.75) : null;
    var canaliNuovi = canali.filter(function (c) { return c.nuovo; });
    var nuoviSopra = canaliNuovi.filter(function (c) { return c.video.some(function (v) { return v.views > medianaNicchia; }); }).length;
    var oNuovi = scala(nuoviSopra, 0, 8);
    var top5 = canali.slice(0, 5).reduce(function (a, c) { return a + c.views; }, 0);
    var quotaTop5 = viewsTot > 0 ? top5 / viewsTot : 1;
    var oSpazio = canali.length >= 6 ? scala(1 - quotaTop5, 0.1, 0.7) : null;
    var ov = media([[oPiccoli, 0.45], [oNuovi, 0.2], [oSpazio, 0.35]]);
    r.opportunita = {
      voto: ov == null ? null : tondo(ov),
      piccoli: { voto: oPiccoli == null ? null : tondo(oPiccoli), sopra10k: piccoliSopra10k, mediana: medPiccoli == null ? null : tondo(medPiccoli), quanti: piccoli.length,
        fascia: piccoli.length ? [tondo(percentile(vp, 0.25)), tondo(percentile(vp, 0.75))] : null },
      canaliNuovi: { voto: tondo(oNuovi), nuovi: canaliNuovi.length, sopraMedia: nuoviSopra },
      spazio: { voto: oSpazio == null ? null : tondo(oSpazio), quotaTop5Pct: tondo(quotaTop5 * 100),
        top5: canali.slice(0, 5).map(function (c) { return { nome: c.nome, iscritti: c.iscritti, views: c.views, quotaPct: tondo(c.views / Math.max(viewsTot, 1) * 100) }; }) }
    };

    // ===== REPLICABILITÀ: funziona di continuo o è fortuna? =====
    var ripetuti = canali.filter(function (c) { return c.video.length >= 3; });
    var ripetutiOk = ripetuti.filter(function (c) {
      var sopra = c.video.filter(function (v) { return v.views > medianaNicchia; }).length;
      return sopra / c.video.length >= 0.5;
    }).length;
    var rRipete = ripetuti.length >= 2 ? scala(ripetutiOk / ripetuti.length, 0.1, 0.95) : null;
    var rapportoAC = (mA != null && mC != null && mC > 0) ? mA / mC : null;
    var rRegge = rapportoAC == null ? null : scala(rapportoAC, 0.3, 1.2);
    var sopra100k = N.filter(function (v) { return v.views >= 100000; }).length;
    var rProb = nOk ? scala(sopra100k / N.length, 0.02, 0.4) : null;
    var rv = media([[rRipete, 0.4], [rRegge, 0.25], [rProb, 0.35]]);
    r.replicabilita = {
      voto: rv == null ? null : tondo(rv),
      ripete: { voto: rRipete == null ? null : tondo(rRipete), canaliRipetuti: ripetuti.length, vannoBene: ripetutiOk },
      regge: { voto: rRegge == null ? null : tondo(rRegge), rapporto: rapportoAC == null ? null : Math.round(rapportoAC * 100) / 100 },
      probabilita: { voto: rProb == null ? null : tondo(rProb), sopra100k: sopra100k, sopra10k: N.filter(function (v) { return v.views >= 10000; }).length,
        sopra1M: N.filter(function (v) { return v.views >= 1000000; }).length, su: N.length }
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
      giudizio: nLingue >= 3 ? 'si' : (nLingue === 2 ? 'forse' : 'nonControllato')
    };

    // Andamento: i più visti degli ultimi 30 giorni contro i più visti dei 2 mesi prima
    var stato;
    if (Amaturi.length < 3 && B.length >= 3) stato = 'fermo';
    else if (Amaturi.length >= 3 && B.length < 3) stato = 'nuovo';
    else if (rapportoAB == null) stato = 'nonTrovato';
    else if (rapportoAB >= 1.3) stato = 'cresce';
    else if (rapportoAB >= 0.7) stato = 'stabile';
    else if (rapportoAB >= 0.45) stato = 'cala';
    else stato = 'morendo';
    r.trend = { stato: stato, rapporto: rapportoAB == null ? null : Math.round(rapportoAB * 100) / 100 };

    // Grandezza
    var perCanale30 = {};
    A.forEach(function (v) { perCanale30[v.canaleId] = (perCanale30[v.canaleId] || 0) + v.views; });
    var max30 = 0; for (var k in perCanale30) max30 = Math.max(max30, perCanale30[k]);
    r.grandezza = { viewsUltimi30: A.reduce(function (a, v) { return a + v.views; }, 0), migliorCanale30: max30 };

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
      f.shorts = dentro.length; f.mediana = dentro.length ? tondo(mediana(dentro.map(function (v) { return v.views; }))) : null;
    });
    var valide = fasce.filter(function (f) { return f.shorts >= 3; });
    var migliore = valide.slice().sort(function (a, b) { return b.mediana - a.mediana; })[0] || null;
    var buoni = lista.filter(function (v) { return v.views >= percentile(views, 0.75) && v.durata; });
    r.durata = { fasce: fasce, migliore: migliore ? migliore.nome : null,
      tipicaDeiMigliori: buoni.length ? tondo(mediana(buoni.map(function (v) { return v.durata; }))) : null };

    // Commenti e like ogni 1.000 views (con 2 decimali: sugli Shorts sono numeri piccoli)
    var conComm = lista.filter(function (v) { return v.views > 0 && v.commenti != null; });
    var sv = conComm.reduce(function (a, v) { return a + v.views; }, 0);
    var due = function (x) { return Math.round(x * 100) / 100; };
    r.commenti = { ogni1000: sv > 0 ? due(conComm.reduce(function (a, v) { return a + v.commenti; }, 0) / sv * 1000) : null,
      likeOgni1000: sv > 0 ? due(conComm.reduce(function (a, v) { return a + (v.likes || 0); }, 0) / sv * 1000) : null };

    // I video modello: i più forti rispetto al loro canale
    r.modelli = lista.filter(function (v) { return v.xCanale != null && v.views >= 50000 && !v.rischi.length; })
      .sort(function (a, b) { return b.xCanale - a.xCanale; }).slice(0, 8)
      .map(function (v) { return { id: v.id, titolo: v.titolo, canale: v.canale, iscritti: v.iscritti, views: v.views, vpd: tondo(v.vpd), xCanale: Math.round(v.xCanale * 10) / 10, durata: v.durata }; });

    // ===== VOTO FINALE =====
    var base = media([[r.viralita.voto, 0.35], [r.opportunita.voto, 0.3], [r.replicabilita.voto, 0.35]]);
    if (base == null) base = 0;
    var aggiustamenti = [];
    if (r.sicurezza.semaforo === 'rosso') { base -= 20; aggiustamenti.push({ motivo: 'tema a rischio per le regole di YouTube', punti: -20 }); }
    else if (r.sicurezza.semaforo === 'giallo') { base -= 7; aggiustamenti.push({ motivo: 'alcuni video a rischio: scegli bene le clip', punti: -7 }); }
    if (stato === 'morendo' || stato === 'fermo') { base -= 15; aggiustamenti.push({ motivo: stato === 'fermo' ? 'quasi nessuno lo fa più' : 'il tema sta morendo', punti: -15 }); }
    else if (stato === 'cala') { base -= 7; aggiustamenti.push({ motivo: 'il tema sta calando', punti: -7 }); }
    else if (stato === 'cresce' || stato === 'nuovo') { base += 5; aggiustamenti.push({ motivo: 'il tema sta crescendo', punti: 5 }); }
    if (r.senzaLingua.giudizio === 'si') { base += 5; aggiustamenti.push({ motivo: 'funziona in più lingue: si capisce senza parole', punti: 5 }); }
    if (stato === 'morendo' || stato === 'fermo') { base = Math.min(base, 39); }
    if (r.pochiDati) { base = Math.min(base, 55); aggiustamenti.push({ motivo: 'pochi dati: voto limitato a 55', punti: 0 }); }
    r.voto = tondo(limita(base, 0, 100));
    r.aggiustamenti = aggiustamenti;
    r.giudizio = r.voto >= 60 ? 'Sì, vale la pena' : (r.voto >= 40 ? 'Da provare' : 'Meglio di no');
    r.tipo = (r.voto >= 60 && (r.replicabilita.voto || 0) >= 55 && r.sicurezza.semaforo !== 'rosso') ? 'sicura' : (r.voto >= 40 ? 'prova' : 'no');
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
