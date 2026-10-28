// Radar Classifiche - pagina "Le ricerche del robot": legge data/robot/*.json (nessun credito usato).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('rb-giorno'), stato = $('rb-stato'), out = $('rb-risultato');
  if (!sel) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function corto(x) {
    if (x == null) return 'non trovato';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace('.', ',') + ' Mln';
    if (x >= 1e3) return Math.round(x / 1e3) + 'k';
    return String(Math.round(x));
  }
  function colore(v) { return v >= 60 ? 'verde' : (v >= 40 ? 'giallo' : 'rosso'); }
  var TREND = { cresce: 'Sta crescendo', nuovo: 'Nuovo', stabile: 'Stabile', cala: 'Sta calando', morendo: 'Sta morendo', fermo: 'Fermo', nonTrovato: 'non trovato' };
  var SEM = { verde: '🟢 Sicuro', giallo: '🟡 Attenzione', rosso: '🔴 Rischioso' };
  function carica(file) {
    return fetch('data/robot/' + file + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('manca'); return r.json(); });
  }

  function riga(x) {
    var tipo = x.tipo === 'sicura' ? '<span class="etichetta sicura">Idea sicura</span>' : x.tipo === 'prova' ? '<span class="etichetta prova">Da provare</span>' : '<span class="etichetta no">Da scartare</span>';
    var dettagli = '';
    dettagli += '<div class="voce"><span>Viralità / Opportunità / Replicabilità</span><b>' + [x.viralita, x.opportunita, x.replicabilita].map(function (v) { return v == null ? '—' : v; }).join(' / ') + '</b></div>';
    dettagli += '<div class="voce"><span>Views tipiche di un video normale</span><b>' + corto(x.viewsTipicheNormale) + '</b></div>';
    if (x.piccoliSopra10k) dettagli += '<div class="voce"><span>Video normali di canali piccoli oltre 10k</span><b>' + x.piccoliSopra10k.quanti + ' su ' + x.piccoliSopra10k.su + '</b></div>';
    dettagli += '<div class="voce"><span>Sicurezza</span><b>' + (SEM[x.sicurezza] || '—') + (x.motiviRischio && x.motiviRischio.length ? ' · ' + esc(x.motiviRischio.join(', ')) : '') + '</b></div>';
    if (x.durataMigliori) dettagli += '<div class="voce"><span>Durata dei video che vanno meglio</span><b>circa ' + x.durataMigliori + ' s</b></div>';
    if (x.paroleForti && x.paroleForti.length) dettagli += '<div class="voce"><span>Parole che tornano nei migliori</span><b>' + esc(x.paroleForti.join(', ')) + '</b></div>';
    (x.avvisi || []).forEach(function (a) { dettagli += '<p class="esito ko">' + esc(a) + '</p>'; });
    if (x.modelli && x.modelli.length) dettagli += '<p class="piccolo"><b>Video modello</b></p><ul class="modelli">' + x.modelli.map(function (m) {
      return '<li><div><a href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.titolo) + '</a><div class="muto piccolo">' + esc(m.canale) + ' (' + corto(m.iscritti) + ' iscritti) · ' + corto(m.views) + ' views · ×' + String(m.xCanale).replace('.', ',') + ' rispetto al solito</div></div></li>';
    }).join('') + '</ul>';
    dettagli += '<p><button class="bottone piccolo-b" data-analizza="' + esc(x.argomento) + '">Analizza a fondo (Profonda)</button></p>';
    return '<details class="rb-riga"><summary><span class="pallino ' + colore(x.voto) + '">' + x.voto + '</span><span class="nome-s"><b>' + esc(x.argomento) + '</b> ' + tipo +
      '<br><span class="muto piccolo">' + esc(x.giudizio) + ' · ' + (TREND[x.andamento] || '—') + (x.canaliNellaScoperta ? ' · trovato su ' + x.canaliNellaScoperta + ' canali negli ultimi 3 giorni' : '') + (x.ricerca === 'profonda' ? ' · analisi Profonda' : '') + '</span></span></summary>' +
      '<div class="rb-dettagli">' + dettagli + '</div></details>';
  }

  function mostra(d) {
    var quando = new Date(d.quando).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' });
    stato.className = 'esito ok';
    stato.textContent = 'Giro del ' + quando + ' · ' + d.videoScoperti + ' classifiche scoperte negli ultimi 3 giorni · ' + d.crediti + ' crediti usati dal robot.';
    var h = '';
    if (d.errori && d.errori.length) h += '<div class="riquadro"><h3>Problemi del giro</h3>' + d.errori.map(function (e) { return '<p class="esito ko">' + esc(e) + '</p>'; }).join('') + '</div>';
    h += '<div class="riquadro"><h2>Argomenti scoperti oggi</h2>' + (d.scoperte.length ? d.scoperte.map(riga).join('') : '<p class="muto">non trovato</p>') + '</div>';
    h += '<div class="riquadro"><h2>Argomenti che segui</h2><p class="muto piccolo">Si cambiano nel file data/seguiti.json del repository.</p>' + (d.seguiti.length ? d.seguiti.map(riga).join('') : '<p class="muto">non trovato</p>') + '</div>';
    out.innerHTML = h;
  }

  out.addEventListener('click', function (e) {
    var arg = e.target.getAttribute && e.target.getAttribute('data-analizza');
    if (!arg) return;
    $('an-argomento').value = arg; $('an-modo').value = 'profonda'; $('an-modo').dispatchEvent(new Event('change'));
    location.hash = 'analizza';
    var t = document.querySelector('[data-vai="analizza"]'); if (t) t.click();
    $('an-stato').className = 'esito'; $('an-stato').textContent = 'Pronto: premi "Analizza" per la ricerca Profonda su "' + arg + '" (circa 600 crediti).';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  sel.addEventListener('change', function () {
    stato.className = 'esito'; stato.textContent = 'Carico…';
    carica('storico/' + sel.value + '.json').then(mostra).catch(function () { stato.className = 'esito ko'; stato.textContent = 'Non trovo il giro di quel giorno.'; });
  });

  carica('indice.json').then(function (ind) {
    sel.innerHTML = (ind.giorni || []).map(function (g) { return '<option value="' + g + '">' + new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' }) + '</option>'; }).join('');
    return carica('ultimo.json').then(mostra);
  }).catch(function () {
    stato.className = 'esito';
    stato.textContent = 'Il robot non ha ancora fatto il primo giro. Quando avrà la chiave YouTube partirà ogni mattina da solo.';
  });
})();
