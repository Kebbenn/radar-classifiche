// Radar Classifiche - pezzo 3: grafici, scheda "Come farlo", file Excel, ricerche salvate.
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function corto(x) {
    if (x == null) return '—';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace('.', ',') + ' Mln';
    if (x >= 1e3) return Math.round(x / 1e3) + 'k';
    return String(Math.round(x));
  }

  // ---------- GRAFICI: barre orizzontali, un solo colore, numero a fine barra ----------
  // righe: [{nome, valore, nota}] ; valore null = "non trovato"
  function barre(titolo, spiega, righe) {
    var max = Math.max.apply(null, righe.map(function (r) { return r.valore || 0; }).concat([1]));
    var alto = 34, sx = 150, larg = 560, w = sx + larg + 90, h = righe.length * alto + 6;
    var svg = '<svg class="grafico" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(titolo) + '">';
    righe.forEach(function (r, i) {
      var y = i * alto + 4, bw = r.valore ? Math.max(4, r.valore / max * larg) : 0;
      var testo = r.valore == null ? 'non trovato' : corto(r.valore);
      svg += '<g class="riga-g"><title>' + esc(r.nome + ': ' + testo + (r.nota ? ' · ' + r.nota : '')) + '</title>' +
        '<rect class="area" x="0" y="' + y + '" width="' + w + '" height="' + (alto - 4) + '" fill="transparent"/>' +
        '<text class="etic" x="' + (sx - 10) + '" y="' + (y + alto / 2) + '" text-anchor="end" dominant-baseline="middle">' + esc(r.nome) + '</text>' +
        (bw ? '<path class="barra-g" d="M' + sx + ' ' + (y + 6) + 'h' + (bw - 4) + 'a4 4 0 0 1 4 4v' + (alto - 24) + 'a4 4 0 0 1 -4 4h' + (-(bw - 4)) + 'z"/>' : '') +
        '<text class="valore" x="' + (sx + bw + 8) + '" y="' + (y + alto / 2) + '" dominant-baseline="middle">' + esc(testo) + (r.nota ? ' <tspan class="nota">' + esc(r.nota) + '</tspan>' : '') + '</text></g>';
    });
    svg += '<line class="asse" x1="' + sx + '" x2="' + sx + '" y1="0" y2="' + h + '"/></svg>';
    return '<div class="carta-voto"><h3>' + esc(titolo) + '</h3><p class="muto piccolo">' + spiega + '</p>' + svg + '</div>';
  }

  function grafici(r) {
    var p = r.periodi || {};
    var h = '<div class="riquadro"><h2>Grafici</h2><div class="due">';
    h += barre('Andamento mese per mese', 'Views tipiche dei video più visti in ogni mese. Se la barra di sopra è la più lunga, il tema cresce.', [
      { nome: 'ultimo mese', valore: p.tipicheUltimi30 },
      { nome: 'il mese prima', valore: p.tipicheDa30a60 },
      { nome: '5-6 mesi fa', valore: p.tipicheDa150a180, nota: p.tipicheDa150a180 == null ? '(solo Profonda)' : '' }
    ]);
    h += barre('Quanto fa un video normale, per grandezza del canale', 'Views tipiche dei video usciti da 5 a 30 giorni. Guarda la riga dei canali come il tuo.',
      (r.perGrandezza || []).map(function (b) { return { nome: b.nome, valore: b.mediana, nota: b.shorts + ' video' }; }));
    h += barre('Views tipiche per durata', 'Tutti i video trovati, divisi per quanto durano.',
      ((r.durata && r.durata.fasce) || []).map(function (f) { return { nome: f.nome, valore: f.shorts >= 3 ? f.mediana : null, nota: f.shorts + ' video' }; }));
    h += '</div></div>';
    return h;
  }

  // ---------- COME FARLO: le regole del corso applicate all'argomento ----------
  function comeFarlo(arg, r) {
    var A = arg.charAt(0).toUpperCase() + arg.slice(1);
    var punti = [];
    var tipo = r.tipo === 'sicura' ? 'È un\'<b>idea sicura</b>: contala tra le 3 idee già provate del metodo 3-2.'
      : r.tipo === 'prova' ? 'È un\'<b>idea da provare</b>: contala tra le 2 prove nuove del metodo 3-2.'
      : 'Il voto è basso: <b>meglio non farla</b>, o cercare un argomento più largo.';
    punti.push(['Che tipo di idea è', tipo + ' (su 5 video: 3 idee già provate, 2 prove nuove)', 'regola 6']);
    var parole = (r.parole || []).slice(0, 4).map(function (p) { return '"' + esc(p.parola) + '"'; });
    punti.push(['Titolo', 'Forma semplice: <b>Ranking the Best ' + esc(A) + ' Moments</b>' +
      (parole.length ? '. Nei titoli che vanno meglio tornano spesso: ' + parole.join(', ') + '. Prendi spunto da lì.' : '.') +
      ' Se puoi, tienilo largo ("animali" batte "cani").', 'regola 8']);
    if (r.durata && r.durata.tipicaDeiMigliori && r.shorts >= 10)
      punti.push(['Durata', 'Parti da circa <b>' + r.durata.tipicaDeiMigliori + ' secondi</b> (quanto durano i video che vanno meglio). Poi adattala al tempo che la gente guarda di solito i tuoi video.', 'regola 31']);
    punti.push(['Primi secondi', 'Entra subito nell\'azione, descrivi quello che si vede, poche cose che si muovono. Parola chiave colorata e numero ben visibile. Niente transizioni all\'inizio.', 'regole 19, 20, 21']);
    punti.push(['Ordine delle clip', 'Parti dal 3, 4 o 5, non dal più forte. Metti la clip migliore alla fine o penultima. Ogni clip un\'emozione diversa da quella prima.', 'regole 16, 17']);
    punti.push(['La tua voce', 'Un piccolo commento a voce all\'inizio e a metà, che sorprenda. Rende il video tuo e lo protegge.', 'regola 22']);
    if (r.sicurezza && r.sicurezza.semaforo !== 'verde')
      punti.push(['Attenzione', 'Alcuni video su questo tema hanno: <b>' + r.sicurezza.motivi.map(function (m) { return esc(m.motivo); }).join(', ') + '</b>. Scegli clip dove nessuno si fa male e dillo nel video.', 'regole 13, 14']);
    if (r.senzaLingua && r.senzaLingua.giudizio === 'si')
      punti.push(['Lingua', 'Va forte in più lingue: tieni il testo al minimo, si capisce anche senza parole.', 'regola 9']);
    punti.push(['Dove trovare le clip', 'Prima TikTok, poi YouTube, poi Instagram, poi Reddit. Scrivi il nome di chi ha fatto la clip nella descrizione.', 'regole 27, 28']);
    if (r.parole && r.parole.length)
      punti.push(['Idee figlie', 'Tieni la forma e cambia il soggetto. Esempio: se va "' + esc(r.parole[0].parola) + '" con ' + esc(arg) + ', prova la stessa forma con un argomento vicino e analizzalo qui.', 'regola 3']);
    punti.push(['Dopo', 'Giudica dopo 8-12 giorni, non dopo un solo video.', 'regola 32']);
    return '<div class="riquadro"><h2>Come farlo</h2><p class="muto piccolo">Le regole del corso applicate a "' + esc(arg) + '". Tra parentesi il numero della regola nel manuale.</p>' +
      punti.map(function (p) { return '<div class="voce voce-lunga"><span><b>' + p[0] + '</b><br>' + p[1] + '</span><i class="muto piccolo">' + p[2] + '</i></div>'; }).join('') + '</div>';
  }

  // ---------- FILE PER EXCEL (CSV con ; e virgola per i decimali, come Excel in italiano) ----------
  function cella(x) {
    if (x == null) return '';
    if (typeof x === 'number') return String(Math.round(x * 100) / 100).replace('.', ',');
    var s = String(x);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function scaricaExcel(rec) {
    var r = rec.risultato;
    var righe = [
      ['Argomento', rec.argomento], ['Data', new Date(rec.quando).toLocaleString('it-IT')], ['Ricerca', rec.modo],
      ['Voto', r.voto], ['Giudizio', r.giudizio], ['Viralità', r.viralita && r.viralita.voto], ['Opportunità', r.opportunita && r.opportunita.voto],
      ['Replicabilità', r.replicabilita && r.replicabilita.voto], ['Andamento', r.trend && r.trend.stato], ['Sicurezza', r.sicurezza && r.sicurezza.semaforo], [],
      ['Titolo', 'Canale', 'Iscritti canale', 'Views', 'Views al giorno', 'Volte meglio del solito', 'Durata (s)', 'Giorni fa', 'Gruppo', 'Link']
    ];
    rec.video.slice().sort(function (a, b) { return b.views - a.views; }).forEach(function (v) {
      righe.push([v.titolo, v.canale, v.iscritti, v.views, v.vpd, v.xCanale, v.durata, Math.round(v.giorni),
        v.top && v.normale ? 'più visti + normali' : (v.top ? 'più visti' : (v.normale ? 'normali' : '')), 'https://www.youtube.com/shorts/' + v.id]);
    });
    var testo = '﻿' + righe.map(function (r) { return r.map(cella).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
    a.download = 'radar-' + rec.argomento.replace(/[^\w-]+/g, '-') + '-' + rec.quando.slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- RICERCHE SALVATE (solo in questo browser) ----------
  var KEY = 'rc-ricerche', MAX = 25;
  function leggi() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function scrivi(l) {
    while (l.length) {
      try { localStorage.setItem(KEY, JSON.stringify(l)); return true; } catch (e) { l.pop(); } // se non c'è spazio toglie la più vecchia
    }
    return false;
  }
  var CAMPI = ['id', 'titolo', 'canale', 'canaleId', 'iscritti', 'views', 'vpd', 'xCanale', 'durata', 'giorni', 'top', 'normale', 'miniatura'];
  function salva(rec) {
    var corto = { id: Date.now().toString(36), argomento: rec.argomento, modo: rec.modo, quando: rec.quando, crediti: rec.crediti, risultato: rec.risultato,
      video: rec.video.map(function (v) { var o = {}; CAMPI.forEach(function (k) { if (v[k] != null) o[k] = v[k]; }); return o; }) };
    var l = leggi(); l.unshift(corto); l = l.slice(0, MAX);
    scrivi(l);
    return corto;
  }
  function togli(id) { scrivi(leggi().filter(function (x) { return x.id !== id; })); }

  window.Extra = { grafici: grafici, comeFarlo: comeFarlo, scaricaExcel: scaricaExcel, salva: salva, leggi: leggi, togli: togli };
})();
