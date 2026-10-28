// Radar Classifiche - parla con YouTube (search, videos, channels) e conta i crediti usati.
(function (root) {
  'use strict';
  var BASE = 'https://www.googleapis.com/youtube/v3/';

  function Contatore() { this.crediti = 0; }

  function errore(j, status) {
    var motivo = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    var testi = {
      quotaExceeded: 'Hai finito i crediti YouTube di oggi (10.000). Si ricaricano alle 9 di mattina circa.',
      keyInvalid: 'La chiave non è valida. Controllala in alto.',
      accessNotConfigured: 'Nella chiave non è attivo "YouTube Data API v3".',
      ipRefererBlocked: 'La chiave non permette di essere usata da questo sito.',
      forbidden: 'YouTube ha rifiutato la richiesta.'
    };
    var e = new Error(testi[motivo] || ('YouTube ha risposto con un errore (' + (motivo || status) + ').'));
    e.motivo = motivo; return e;
  }

  function chiama(percorso, parametri, chiave, contatore, costo) {
    var q = Object.keys(parametri).map(function (k) { return k + '=' + encodeURIComponent(parametri[k]); }).join('&');
    return fetch(BASE + percorso + '?' + q + '&key=' + encodeURIComponent(chiave)).then(function (r) {
      contatore.crediti += costo;
      return r.json().then(function (j) { if (!r.ok) throw errore(j, r.status); return j; });
    });
  }

  // Le ricerche da fare per un argomento. Ogni ricerca costa 100 crediti.
  // Prendono i più visti di ogni periodo, così il confronto tra "adesso" e "prima" è alla pari.
  var PERIODI = { A: [0, 30], An: [5, 30], B: [30, 60], C: [150, 180] };
  // tipo 'top' = i più visti del periodo (per capire se cresce o cala)
  // tipo 'normali' = gli ultimi usciti, andati bene o male (per capire le possibilità vere)
  function ricerche(argomento, modo) {
    var a = argomento.trim();
    var lista = [
      { q: a + ' ranking', p: 'A', tipo: 'top' }, { q: a + ' ranking', p: 'B', tipo: 'top' },
      { q: a + ' ranking', p: 'An', tipo: 'normali' }
    ];
    if (modo === 'profonda') lista = lista.concat([
      { q: a + ' ranking', p: 'C', tipo: 'top' },
      { q: a + ' ranking', p: 'B', tipo: 'normali' },
      { q: a + ' ranked', p: 'An', tipo: 'normali' }
    ]);
    return lista;
  }
  function costoStimato(modo) {
    var n = ricerche('x', modo).length;
    return n * 100 + n * 2 + 2; // ricerche + dettagli video + canali (stima)
  }

  function aPezzi(lista, n) { var o = []; for (var i = 0; i < lista.length; i += n) o.push(lista.slice(i, i + n)); return o; }

  // Prende tutto: ritorna {video:[], canali:{}, crediti, scartati}
  function raccogli(argomento, modo, chiave, avanza) {
    var M = root.Motore;
    var cont = new Contatore();
    avanza = avanza || function () {};
    var ora = Date.now();
    function giorniFa(g) { return new Date(ora - g * 86400000).toISOString(); }
    var lista = ricerche(argomento, modo);
    var ids = {};
    var fatte = 0;

    return Promise.all(lista.map(function (r) {
      return chiama('search', { part: 'snippet', type: 'video', videoDuration: 'short', maxResults: 50,
        q: r.q, order: r.tipo === 'top' ? 'viewCount' : 'date',
        publishedAfter: giorniFa(PERIODI[r.p][1]), publishedBefore: giorniFa(PERIODI[r.p][0]) }, chiave, cont, 100)
        .then(function (j) {
          (j.items || []).forEach(function (it) { if (it.id && it.id.videoId) { var g = ids[it.id.videoId] || (ids[it.id.videoId] = {}); g[r.tipo] = true; } });
          fatte++; avanza('Ricerche fatte: ' + fatte + ' di ' + lista.length);
        });
    })).then(function () {
      var tutti = Object.keys(ids);
      avanza('Leggo i numeri di ' + tutti.length + ' video…');
      return Promise.all(aPezzi(tutti, 50).map(function (p) {
        return chiama('videos', { part: 'snippet,statistics,contentDetails,player', id: p.join(','), maxHeight: 640 }, chiave, cont, 1);
      }));
    }).then(function (risposte) {
      var video = [];
      var scartati = { lunghi: 0, orizzontali: 0, nonClassifica: 0, altroArgomento: 0 };
      var rad = M.radici(argomento);
      risposte.forEach(function (j) {
        (j.items || []).forEach(function (it) {
          var s = it.snippet || {}, st = it.statistics || {};
          var dur = M.durataSecondi(it.contentDetails && it.contentDetails.duration);
          var testo = (s.title || '') + ' ' + (s.description || '') + ' ' + (s.tags || []).join(' ');
          if (dur == null || dur > 180) { scartati.lunghi++; return; }
          var pl = it.player || {};
          if (pl.embedWidth && pl.embedHeight && +pl.embedWidth > +pl.embedHeight) { scartati.orizzontali++; return; } // non è uno Short: è orizzontale
          var hashtag = ((s.description || '').match(/#[\p{L}\p{N}_]+/gu) || []).join(' ');
          if (!M.eClassifica(s.title) && !/#(rank|ranking|ranked|tierlist|top10|top5)\b/i.test(hashtag)) { scartati.nonClassifica++; return; }
          if (!M.parlaDi(testo, rad)) { scartati.altroArgomento++; return; }
          video.push({
            id: it.id, titolo: s.title, descrizione: (s.description || '').slice(0, 300),
            canaleId: s.channelId, canale: s.channelTitle, pubblicato: s.publishedAt,
            views: +st.viewCount || 0, likes: st.likeCount != null ? +st.likeCount : null,
            commenti: st.commentCount != null ? +st.commentCount : null,
            durata: dur, lingua: s.defaultAudioLanguage || s.defaultLanguage || '',
            top: !!(ids[it.id] && ids[it.id].top), normale: !!(ids[it.id] && ids[it.id].normali),
            miniatura: s.thumbnails && (s.thumbnails.medium || s.thumbnails.default || {}).url
          });
        });
      });
      var canaliIds = Object.keys(video.reduce(function (o, v) { o[v.canaleId] = 1; return o; }, {}));
      avanza('Leggo i dati di ' + canaliIds.length + ' canali…');
      return Promise.all(aPezzi(canaliIds, 50).map(function (p) {
        return chiama('channels', { part: 'snippet,statistics', id: p.join(','), maxResults: 50 }, chiave, cont, 1);
      })).then(function (rc) {
        var canali = {};
        rc.forEach(function (j) {
          (j.items || []).forEach(function (c) {
            var st = c.statistics || {};
            canali[c.id] = { iscritti: st.hiddenSubscriberCount ? 0 : (+st.subscriberCount || 0),
              videoTot: +st.videoCount || 0, viewsTot: +st.viewCount || 0, creato: c.snippet && c.snippet.publishedAt };
          });
        });
        return { video: video, canali: canali, crediti: cont.crediti, scartati: scartati, trovati: Object.keys(ids).length };
      });
    });
  }

  root.YT = { raccogli: raccogli, costoStimato: costoStimato, ricerche: ricerche };
})(typeof window !== 'undefined' ? window : this);
