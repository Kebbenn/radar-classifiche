// Finto YouTube per provare il robot senza chiave (ROBOT_PROVA=1). Dati inventati.
let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const temi = ['volcano', 'lava', 'shark', 'tornado', 'snake', 'golf', 'parkour', 'magic tricks', 'dog', 'trampoline'];
const ora = Date.now();
const canali = Array.from({ length: 80 }, (_, i) => ({ id: 'C' + i, iscritti: Math.round(10 ** (2 + rnd() * 4)), creato: new Date(ora - (100 + i * 9) * 864e5).toISOString() }));
const video = [];
for (let i = 0; i < 1500; i++) {
  const t = temi[i % temi.length], c = canali[Math.floor(rnd() * 80)];
  const forza = t === 'shark' ? 1.6 : t === 'golf' ? 0.4 : 1;
  video.push({ id: 'V' + i, t: 'Ranking the best ' + t + ' moments ' + i, c, d: 15 + Math.floor(rnd() * 70),
    pub: new Date(ora - rnd() * 185 * 864e5).toISOString(), views: Math.round(forza * 10 ** (2.5 + rnd() * 4.5)) });
}
const risp = b => ({ ok: true, status: 200, json: async () => b });
export default async function (url) {
  const u = new URL(url), tipo = u.pathname.split('/').pop(), P = u.searchParams;
  if (tipo === 'search') {
    const q = (P.get('q') || '').toLowerCase().replace(/ (ranking|ranked)$/, '');
    const da = new Date(P.get('publishedAfter') || 0), a = P.get('publishedBefore') ? new Date(P.get('publishedBefore')) : new Date(ora + 1);
    let l = video.filter(v => new Date(v.pub) >= da && new Date(v.pub) < a && (q === 'ranking' || q === 'ranked' || v.t.toLowerCase().includes(q)));
    l.sort(P.get('order') === 'date' ? (x, y) => new Date(y.pub) - new Date(x.pub) : (x, y) => y.views - x.views);
    return risp({ items: l.slice(0, 50).map(v => ({ id: { videoId: v.id } })) });
  }
  if (tipo === 'videos') {
    const ids = new Set((P.get('id') || '').split(','));
    return risp({ items: video.filter(v => ids.has(v.id)).map(v => ({ id: v.id,
      snippet: { title: v.t, description: '', channelId: v.c.id, channelTitle: 'Canale ' + v.c.id, publishedAt: v.pub, thumbnails: {} },
      statistics: { viewCount: '' + v.views, likeCount: '' + Math.round(v.views * .03), commentCount: '' + Math.round(v.views * .0005) },
      contentDetails: { duration: 'PT' + v.d + 'S' }, player: { embedWidth: '360', embedHeight: '640' } })) });
  }
  if (tipo === 'channels') {
    const ids = new Set((P.get('id') || '').split(','));
    return risp({ items: canali.filter(c => ids.has(c.id)).map(c => ({ id: c.id, snippet: { publishedAt: c.creato },
      statistics: { subscriberCount: '' + c.iscritti, videoCount: '90', viewCount: '' + c.iscritti * 200 } })) });
  }
  return risp({ items: [] });
}
