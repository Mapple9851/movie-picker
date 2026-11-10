// Stand-in for TMDB / OMDb / the barcode database, so the robot can be tested without real keys.
const movie = (id, title, year, extra = {}) => ({ id, title, original_title: title, release_date: `${year}-06-01`, popularity: 10, ...extra });
const SEARCH = {
  'the thing': [movie(1091, 'The Thing', 1982), movie(60935, 'The Thing', 2011)],
  'fanatic': [movie(28501, 'Fanatic', 1965), movie(999, 'The Fanatic', 2019)],
  'pet sematary': [movie(157433, 'Pet Sematary', 2019), movie(8913, 'Pet Sematary', 1989)],
  'jaws': [movie(578, 'Jaws', 1975), movie(579, 'Jaws 2', 1978)],
  'totally unknown film': [],
};
const DETAILS = {
  1091: { imdb_id: 'tt0084787', overview: 'Antarctic researchers meet a shape-shifting alien.', poster_path: '/thing.jpg', runtime: 109, genres: [{ name: 'Horror' }], keywords: { keywords: [{ name: 'antarctica' }, { name: 'snow' }] } },
  28501: { imdb_id: 'tt0059163', overview: 'A woman is held captive by her late fiance\'s mother.', poster_path: '/fanatic.jpg', runtime: 97, genres: [{ name: 'Horror' }], keywords: { keywords: [] } },
  8913: { imdb_id: 'tt0098084', overview: 'Sometimes dead is better.', poster_path: '/pet89.jpg', runtime: 103, genres: [{ name: 'Horror' }], keywords: { keywords: [] } },
  157433: { imdb_id: 'tt0837563', overview: 'A remake.', poster_path: '/pet19.jpg', runtime: 100, genres: [{ name: 'Horror' }], keywords: { keywords: [] } },
  578: { imdb_id: 'tt0073195', overview: 'A shark terrorises a beach town.', poster_path: '/jaws.jpg', runtime: 124, genres: [{ name: 'Thriller' }, { name: 'Adventure' }], keywords: { keywords: [{ name: 'beach' }] } },
};
const TV = { id: 66732, name: 'Stranger Things', original_name: 'Stranger Things', first_air_date: '2016-07-15', popularity: 99 };
const RATINGS = { tt0084787: '8.2', tt0059163: '6.3', tt0098084: '6.5', tt0837563: '5.7', tt0073195: '8.1', tt4574334: '8.6' };
export const calls = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input)); calls.push(url.href);
  const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
  if (url.hostname === 'api.themoviedb.org') {
    if (!url.searchParams.get('api_key')) return json({}, 401);
    const p = url.pathname.replace('/3', '');
    if (p === '/search/movie') {
      let res = SEARCH[url.searchParams.get('query').toLowerCase()] || [];
      const y = url.searchParams.get('year'); if (y) res = res.filter((r) => r.release_date.startsWith(y));
      return json({ results: res });
    }
    if (p === '/search/tv') return json({ results: url.searchParams.get('query').toLowerCase() === 'stranger things' ? [TV] : [] });
    let m = /^\/movie\/(\d+)$/.exec(p); if (m) return DETAILS[m[1]] ? json(DETAILS[m[1]]) : json({}, 404);
    if (p === '/tv/66732') return json({ overview: 'Kids, a lab, and the Upside Down.', poster_path: '/st.jpg', external_ids: { imdb_id: 'tt4574334' }, keywords: { results: [{ name: '1980s' }] }, genres: [{ name: 'Drama' }], created_by: [{ name: 'The Duffer Brothers' }] });
    if (p === '/tv/66732/season/2') return json({ poster_path: '/st-s2.jpg', overview: 'Season two overview.' });
    return json({}, 404);
  }
  if (url.hostname === 'www.omdbapi.com') {
    const id = url.searchParams.get('i');
    if (id) return json(RATINGS[id] ? { Response: 'True', imdbID: id, imdbRating: RATINGS[id], Poster: 'N/A', Plot: 'N/A' } : { Response: 'False' });
    if ((url.searchParams.get('t') || '').toLowerCase() === 'jaws') return json({ Response: 'True', imdbID: 'tt0073195', imdbRating: '8.1', Poster: 'https://img.example/jaws.jpg', Plot: 'Shark.', Runtime: '124 min', Year: '1975', Genre: 'Thriller, Adventure' });
    return json({ Response: 'False' });
  }
  if (url.hostname === 'api.upcitemdb.com') {
    return json(url.searchParams.get('upc') === '111' ? { items: [{ title: 'Jaws [4K Ultra HD + Blu-ray]' }] } : { items: [] });
  }
  return json({}, 404);
};
