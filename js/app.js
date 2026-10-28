// Radar Classifiche - pezzo 1: schede e chiave YouTube.
(function () {
  'use strict';

  var CHIAVE_KEY = 'rc-chiave-youtube';

  // ---------- memoria del browser (può mancare: niente errori) ----------
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function togli(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ---------- schede ----------
  var schede = document.querySelectorAll('.scheda');
  function mostra(nome) {
    schede.forEach(function (s) { s.classList.toggle('attiva', s.dataset.vai === nome); });
    document.querySelectorAll('.pagina').forEach(function (p) {
      p.classList.toggle('attiva', p.id === 'pagina-' + nome);
    });
    if (location.hash !== '#' + nome) history.replaceState(null, '', '#' + nome);
  }
  schede.forEach(function (s) { s.addEventListener('click', function () { mostra(s.dataset.vai); }); });
  var iniziale = (location.hash || '').slice(1);
  if (['analizza', 'robot', 'guida'].indexOf(iniziale) >= 0) mostra(iniziale);

  // ---------- chiave ----------
  var campo = document.getElementById('chiave-campo');
  var stato = document.getElementById('chiave-stato');
  var esito = document.getElementById('chiave-esito');
  var salva = document.getElementById('chiave-salva');
  var dettagli = document.getElementById('chiave-dettagli');

  function aggiornaStato() {
    var k = leggi(CHIAVE_KEY);
    stato.textContent = k ? 'Chiave YouTube salvata ✓' : 'Chiave YouTube: non salvata';
    if (!k) dettagli.open = true;
  }

  // Prova la chiave con la richiesta più economica (1 credito): i dati di un video pubblico.
  function provaChiave(k) {
    var url = 'https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=' + encodeURIComponent(k);
    return fetch(url).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok) return { ok: true };
        var motivo = (d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || '';
        var msg = 'YouTube ha rifiutato la chiave.';
        if (/keyInvalid|badRequest/.test(motivo)) msg = 'La chiave non è valida: controlla di averla copiata tutta.';
        else if (/accessNotConfigured/.test(motivo)) msg = 'La chiave c\'è, ma nel progetto Google non hai abilitato "YouTube Data API v3".';
        else if (/quotaExceeded|dailyLimitExceeded/.test(motivo)) msg = 'La chiave funziona, ma i crediti di oggi sono finiti. Si ricaricano verso le 9 di mattina.';
        else if (/ipRefererBlocked|forbidden/.test(motivo)) msg = 'La chiave ha delle restrizioni che bloccano questo sito.';
        return { ok: false, msg: msg };
      });
    }).catch(function () { return { ok: false, msg: 'Non riesco a raggiungere YouTube: controlla la connessione.' }; });
  }

  salva.addEventListener('click', function () {
    var k = (campo.value || '').trim();
    if (!k) { esito.className = 'esito ko'; esito.textContent = 'Incolla prima la chiave.'; return; }
    salva.disabled = true; esito.className = 'esito'; esito.textContent = 'Provo la chiave…';
    provaChiave(k).then(function (r) {
      salva.disabled = false;
      if (r.ok) {
        if (!scrivi(CHIAVE_KEY, k)) { esito.className = 'esito ko'; esito.textContent = 'La chiave funziona, ma questo browser non mi lascia salvarla.'; return; }
        campo.value = '';
        esito.className = 'esito ok'; esito.textContent = 'Funziona! Chiave salvata in questo browser (ha usato 1 credito).';
        aggiornaStato(); dettagli.open = false;
      } else {
        esito.className = 'esito ko'; esito.textContent = r.msg;
      }
    });
  });

  document.getElementById('chiave-togli').addEventListener('click', function () {
    togli(CHIAVE_KEY); esito.className = 'esito'; esito.textContent = 'Chiave tolta da questo browser.'; aggiornaStato();
  });

  aggiornaStato();
  window.RC = { leggiChiave: function () { return leggi(CHIAVE_KEY); } };
})();
