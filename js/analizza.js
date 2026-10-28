// Radar Classifiche - pagina "Analizza": prende l'argomento, chiama YouTube, mostra il voto.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('an-form'), campo = $('an-argomento'), modo = $('an-modo'), vai = $('an-vai');
  var stato = $('an-stato'), costo = $('an-costo'), out = $('an-risultato');
  if (!form) return;

  function n(x) { return x == null ? '—' : Math.round(x).toLocaleString('it-IT'); }
  function corto(x) {
    if (x == null) return '—';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace('.', ',') + ' Mln';
    if (x >= 1e3) return Math.round(x / 1e3) + 'k';
    return String(Math.round(x));
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function colore(v) { return v >= 60 ? 'verde' : (v >= 40 ? 'giallo' : 'rosso'); }

  function mostraCosto() {
    costo.textContent = 'Userà circa ' + n(YT.costoStimato(modo.value)) + ' crediti YouTube su 10.000 al giorno. ' +
      (modo.value === 'veloce' ? 'Veloce: 3 ricerche.' : 'Profonda: 6 ricerche, più video e dati più sicuri.');
  }
  modo.addEventListener('change', mostraCosto); mostraCosto();

  var NOMI_TREND = { cresce: 'Sta crescendo', nuovo: 'Argomento nuovo, sta partendo', stabile: 'Stabile', cala: 'Sta calando', morendo: 'Sta morendo', fermo: 'Fermo: quasi nessuno lo fa più', nonTrovato: 'non trovato' };
  var NOMI_SEM = { verde: '🟢 Sicuro', giallo: '🟡 Attenzione', rosso: '🔴 Rischioso' };
  var NOMI_LINGUA = { si: 'Sì, funziona in più lingue', forse: 'Forse (2 lingue)', nonControllato: 'Non controllato (per ora cerco solo in inglese)' };

  var NT = '<span class="muto">non trovato</span>';
  function x(v) { return v == null ? NT : '×' + String(v).replace('.', ','); }
  function blocco(titolo, voto, spiega, voci) {
    return '<div class="carta-voto"><h3>' + titolo + ' <span style="float:right">' + (voto == null ? '—' : voto) + '</span></h3>' +
      '<div class="barra"><span style="width:' + (voto || 0) + '%"></span></div>' +
      '<p class="muto piccolo">' + spiega + '</p>' +
      voci.map(function (v) { return '<div class="voce"><span>' + v[0] + '</span><b>' + v[1] + '</b></div>'; }).join('') + '</div>';
  }

  function disegna(rec) {
    var arg = rec.argomento, r = rec.risultato, dati = { video: rec.video, crediti: rec.crediti };
    if (!r.shorts) {
      out.innerHTML = '<div class="riquadro"><h2>Non trovato</h2><p>Non ho trovato Shorts di classifiche su "' + esc(arg) + '" negli ultimi 6 mesi. Prova con un\'altra parola (in inglese).</p></div>';
      return;
    }
    var v = r.viralita, o = r.opportunita, p = r.replicabilita;
    var h = '';
    h += '<div class="riquadro"><div class="voto-grande"><div class="cerchio ' + colore(r.voto) + '">' + r.voto + '</div><div>' +
      '<h2 style="margin:0">' + esc(arg) + ': ' + r.giudizio + '</h2>' +
      '<p><span class="etichetta ' + r.tipo + '">' + (r.tipo === 'sicura' ? 'Idea sicura' : r.tipo === 'prova' ? 'Idea da provare' : 'Da scartare') + '</span>' +
      '<span class="muto piccolo">' + new Date(rec.quando).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + ' · Ho guardato ' + r.shorts + ' Shorts di classifiche di ' + r.canali + ' canali · ' + n(dati.crediti) + ' crediti usati</span></p>' +
      (r.aggiustamenti.length ? '<p class="muto piccolo">' + r.aggiustamenti.map(function (a) { return (a.punti > 0 ? '+' : '') + (a.punti || '') + ' ' + a.motivo; }).join(' · ') + '</p>' : '') +
      r.avvisi.map(function (a) { return '<p class="esito ko">' + esc(a) + '</p>'; }).join('') +
      '<p><button class="bottone" type="button" id="an-excel">Scarica per Excel</button></p>' +
      '</div></div></div>';

    h += '<div class="tre">';
    h += blocco('Viralità', v.voto, 'L\'argomento sta tirando adesso?', [
      ['Views dei più visti: ultimo mese contro il mese prima', x(v.ora.rapporto)],
      ['Canali che ci fanno bei numeri nell\'ultimo mese', v.canaliForti.quanti],
      ['Video normali con più views che iscritti (×2)', v.piccoliBotto.su >= 8 ? v.piccoliBotto.quanti + ' su ' + v.piccoliBotto.su : NT]
    ]);
    h += blocco('Opportunità', o.voto, 'Un canale piccolo come il tuo può farcela?', [
      ['Video normali di canali sotto 10k iscritti che superano 10k views', o.piccoli.quanti >= 3 ? o.piccoli.sopra10k + ' su ' + o.piccoli.quanti + ' (tipico: ' + corto(o.piccoli.mediana) + ')' : NT],
      ['Canali nuovi (meno di 3 mesi) che vanno bene', o.canaliNuovi.sopraMedia + ' su ' + o.canaliNuovi.nuovi],
      ['Quota di views dei 5 canali più grossi', o.spazio.quotaTop5Pct + '%']
    ]);
    h += blocco('Replicabilità', p.voto, 'Funziona di continuo o è stata fortuna?', [
      ['Canali che lo rifanno e vanno bene', p.ripete.canaliRipetuti >= 2 ? p.ripete.vannoBene + ' su ' + p.ripete.canaliRipetuti : NT],
      ['Video normali oltre 10k / 100k / 1 Mln', p.probabilita.su >= 8 ? p.probabilita.sopra10k + ' / ' + p.probabilita.sopra100k + ' / ' + p.probabilita.sopra1M + ' (su ' + p.probabilita.su + ')' : NT],
      ['Ultimo mese contro 5-6 mesi fa' + (p.regge.rapporto == null ? ' (solo Profonda)' : ''), x(p.regge.rapporto)]
    ]);
    h += '</div>';

    h += '<div class="riquadro"><h2>Le regole del corso</h2>' +
      '<div class="voce"><span>Andamento (i più visti dell\'ultimo mese contro quelli del mese prima)</span><b>' + NOMI_TREND[r.trend.stato] + '</b></div>' +
      '<div class="voce"><span>Si capisce senza parole? (va forte in più lingue)</span><b>' + NOMI_LINGUA[r.senzaLingua.giudizio] + '</b></div>' +
      '<div class="voce"><span>Sicurezza (risse, sangue, morti, armi…)</span><b>' + NOMI_SEM[r.sicurezza.semaforo] +
        (r.sicurezza.motivi.length ? ' · ' + r.sicurezza.motivi.map(function (m) { return m.motivo; }).join(', ') : '') + '</b></div>' +
      '<div class="voce"><span>Durata che va meglio</span><b>' + (r.durata.tipicaDeiMigliori && r.shorts >= 10 ? 'circa ' + r.durata.tipicaDeiMigliori + ' secondi (quanto durano i video che vanno meglio)' : NT) + '</b></div>' +
      '<div class="voce"><span>Views tipiche di un video normale (usciti da 5-30 giorni)</span><b>' + (r.normali.mediana == null ? NT : corto(r.normali.mediana)) + '</b></div>' +
      '<div class="voce"><span>Quanta gente raggiunge (views ultimi 30 giorni)</span><b>' + corto(r.grandezza.viewsUltimi30) + '</b></div>' +
      '<div class="voce"><span>Commenti ogni 1.000 views</span><b>' + (r.commenti.ogni1000 == null ? NT : String(r.commenti.ogni1000).replace('.', ',')) + '</b></div>' +
      '</div>';

    if (r.modelli.length) {
      h += '<div class="riquadro"><h2>Video da copiare come modello</h2><p class="muto piccolo">Quelli andati molto meglio del solito per il loro canale.</p><ul class="modelli">' +
        r.modelli.map(function (m) {
          var vid = dati.video.filter(function (x) { return x.id === m.id; })[0] || {};
          return '<li>' + (vid.miniatura ? '<img src="' + esc(vid.miniatura) + '" alt="" loading="lazy">' : '') +
            '<div><a href="https://www.youtube.com/shorts/' + esc(m.id) + '" target="_blank" rel="noopener">' + esc(m.titolo) + '</a>' +
            '<div class="muto piccolo">' + esc(m.canale) + ' (' + corto(m.iscritti) + ' iscritti) · ' + corto(m.views) + ' views · ×' +
            String(m.xCanale).replace('.', ',') + ' rispetto al solito · ' + (m.durata || '?') + ' s</div></div></li>';
        }).join('') + '</ul></div>';
    }
    h += Extra.grafici(r) + Extra.comeFarlo(arg, r);
    out.innerHTML = h;
    var b = document.getElementById('an-excel');
    if (b) b.addEventListener('click', function () { Extra.scaricaExcel(rec); });
  }

  // ---------- ricerche salvate ----------
  var box = $('an-salvate');
  function aggiornaSalvate() {
    var l = Extra.leggi();
    if (!l.length) { box.innerHTML = '<p class="muto piccolo">Ancora nessuna ricerca salvata. Ogni analisi si salva da sola in questo browser.</p>'; return; }
    box.innerHTML = '<ul class="salvate">' + l.map(function (x) {
      var v = x.risultato.voto;
      return '<li><span class="pallino ' + colore(v) + '">' + v + '</span><span class="nome-s"><b>' + esc(x.argomento) + '</b> <span class="muto piccolo">' +
        new Date(x.quando).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + x.modo + '</span></span>' +
        '<button class="bottone piccolo-b" data-apri="' + x.id + '">Apri</button><button class="bottone secondario piccolo-b" data-togli="' + x.id + '" aria-label="Togli">Togli</button></li>';
    }).join('') + '</ul>';
  }
  box.addEventListener('click', function (e) {
    var t = e.target, id;
    if ((id = t.getAttribute('data-apri'))) {
      var rec = Extra.leggi().filter(function (x) { return x.id === id; })[0];
      if (rec) { disegna(rec); stato.className = 'esito'; stato.textContent = 'Ricerca salvata del ' + new Date(rec.quando).toLocaleString('it-IT') + ' (nessun credito usato).'; out.scrollIntoView({ behavior: 'smooth' }); }
    } else if ((id = t.getAttribute('data-togli'))) { Extra.togli(id); aggiornaSalvate(); }
  });
  aggiornaSalvate();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var arg = campo.value.trim();
    var chiave = window.RC && window.RC.leggiChiave();
    if (!chiave) { stato.className = 'esito ko'; stato.textContent = 'Prima salva la chiave YouTube qui sopra.'; return; }
    if (!arg) return;
    vai.disabled = true; out.innerHTML = '';
    stato.className = 'esito'; stato.textContent = 'Cerco…';
    YT.raccogli(arg, modo.value, chiave, function (t) { stato.textContent = t; })
      .then(function (dati) {
        var lista = Motore.prepara(dati.video, dati.canali);
        var r = Motore.analizza(lista, { argomento: arg });
        stato.className = 'esito ok';
        stato.textContent = 'Fatto. Video trovati: ' + dati.trovati + ', tenuti come classifiche su "' + arg + '": ' + lista.length + '. Scartati: ' + dati.scartati.orizzontali + ' orizzontali (non Shorts), ' + dati.scartati.lunghi + ' troppo lunghi, ' + dati.scartati.nonClassifica + ' non classifiche, ' + dati.scartati.altroArgomento + ' su altro argomento.';
        var rec = { argomento: arg, modo: modo.value, quando: new Date().toISOString(), risultato: r, video: lista, crediti: dati.crediti };
        window.RC.ultima = rec;
        disegna(Extra.salva(rec) || rec);
        aggiornaSalvate();
      })
      .catch(function (err) { stato.className = 'esito ko'; stato.textContent = err.message || 'Qualcosa è andato storto.'; })
      .then(function () { vai.disabled = false; });
  });
})();
