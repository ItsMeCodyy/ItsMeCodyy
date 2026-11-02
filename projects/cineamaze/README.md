# Cineamaze

Cineamaze is a clean movie and TV discovery front end built around live TMDB metadata and CineSrc playback.

## Features

- Live TMDB trending movies and TV shows
- Real TMDB posters, backdrops, cast, recommendations, trailers, genres, and provider data
- Browse by streaming provider using TMDB watch-provider filters
- Movie and TV genre/year/sort filters
- CineSrc movie playback by TMDB ID
- CineSrc TV playback with season and episode selectors
- Local Watch History with playback progress and resume support
- YouTube-style vertical Shorts feed using current movie trailers
- Save titles from Shorts, details, or the hero into My List
- Local custom lists
- Search
- Playback settings for autoplay, mute, auto-next, intro skipping, quality, and reduced motion
- Animated liquid background on the Lists experience
- Responsive desktop and mobile layouts
- Lucide SVG icons only — no emoji UI icons

## Project structure

```text
cineamaze/
├── api/
│   └── tmdb.js
├── app.js
├── index.html
├── styles.css
├── vercel.json
└── README.md
```

## TMDB key

The browser does not contain the TMDB API key. Requests go through `/api/tmdb.js`, which reads `TMDB_API_KEY` from the Vercel environment.

## Local development

Because the project uses a Vercel serverless API route, use Vercel's local development server instead of a plain static HTTP server.

```bash
vercel dev
```

Set `TMDB_API_KEY` in your local Vercel environment before running.

## Data storage

My List, custom lists, Watch History, and settings are stored locally in the browser with `localStorage`.
