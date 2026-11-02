const TMDB_PROXY_URL = "/api/tmdb";
const TMDB_IMAGE_URL = "https://image.tmdb.org/t/p";
const CINESRC_ORIGIN = "https://cinesrc.st";

const STORAGE_KEYS = {
  watchlist: "cineamazeWatchlist",
  lists: "cineamazeLists",
  history: "cineamazeHistory",
  settings: "cineamazeSettings",
};

const DEFAULT_SETTINGS = {
  autoplay: true,
  muted: false,
  autonext: true,
  autoskip: false,
  quality: "",
  reduceMotion: false,
};

const PREFERRED_PROVIDER_IDS = [
  8,
  9,
  337,
  350,
  15,
  1899,
  531,
  386,
  283,
  43,
  526,
];

const state = {
  route: "home",
  previousRoute: "home",
  hero: null,
  details: null,
  activeProvider: null,
  providerCatalog: [],
  movieGenres: [],
  tvGenres: [],
  moviePage: 1,
  tvPage: 1,
  movieTotalPages: 1,
  tvTotalPages: 1,
  playerItem: null,
  playerSeason: 1,
  playerEpisode: 1,
  playerSeasonData: null,
  lastHistoryWrite: 0,
  shorts: [],
  shortsLoaded: false,
  shortsObserver: null,
  settings: loadSettings(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function safe(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function image(path, size = "w500") {
  return path ? `${TMDB_IMAGE_URL}/${size}${path}` : "";
}

function poster(path, size = "w500") {
  return image(path, size);
}

function backdrop(path, size = "original") {
  return image(path, size);
}

function mediaType(item) {
  return item?.media_type || (item?.first_air_date ? "tv" : "movie");
}

function titleOf(item) {
  return item?.title || item?.name || "Untitled";
}

function releaseDateOf(item) {
  return item?.release_date || item?.first_air_date || "";
}

function releaseYearOf(item) {
  const date = releaseDateOf(item);
  return date ? date.slice(0, 4) : "";
}

function formatRuntime(minutes) {
  if (!minutes || Number.isNaN(Number(minutes))) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) {
    return `${mins}m`;
  }

  return `${hours}h ${mins}m`;
}

function truncate(value, length = 150) {
  const text = String(value || "").trim();

  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length - 1).trim()}…`;
}

function debounce(callback, delay = 280) {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
}

async function tmdb(path, params = {}) {
  const search = new URLSearchParams({ path });

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    search.set(key, String(value));
  }

  const response = await fetch(`${TMDB_PROXY_URL}?${search.toString()}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.status_message || payload.error || "TMDB request failed");
  }

  return response.json();
}

function loadSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}"),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(nextSettings) {
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
  };

  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  applySettings();
}

function applySettings() {
  document.documentElement.classList.toggle(
    "reduce-motion",
    Boolean(state.settings.reduceMotion)
  );

  for (const video of $$(".liquid-video")) {
    if (state.settings.reduceMotion) {
      video.pause();
    } else if (video.closest(".page.active")) {
      video.play().catch(() => {});
    }
  }
}

function getStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getWatchlist() {
  return getStoredArray(STORAGE_KEYS.watchlist);
}

function saveWatchlist(items) {
  setStoredArray(STORAGE_KEYS.watchlist, items);
  syncSavedButtons();
}

function getLists() {
  return getStoredArray(STORAGE_KEYS.lists);
}

function saveLists(items) {
  setStoredArray(STORAGE_KEYS.lists, items);
  renderLists();
}

function getHistory() {
  return getStoredArray(STORAGE_KEYS.history);
}

function saveHistory(items) {
  setStoredArray(STORAGE_KEYS.history, items.slice(0, 100));

  if (state.route === "history") {
    renderHistory();
  }
}

function normalizeMediaItem(item) {
  return {
    id: item.id,
    media_type: mediaType(item),
    title: item.title || null,
    name: item.name || null,
    overview: item.overview || "",
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    release_date: item.release_date || null,
    first_air_date: item.first_air_date || null,
    vote_average: item.vote_average || 0,
  };
}

function isSaved(item) {
  const type = mediaType(item);
  return getWatchlist().some(
    (entry) => entry.id === item.id && mediaType(entry) === type
  );
}

function addToWatchlist(item) {
  const normalized = normalizeMediaItem(item);
  const watchlist = getWatchlist();
  const existingIndex = watchlist.findIndex(
    (entry) =>
      entry.id === normalized.id &&
      mediaType(entry) === normalized.media_type
  );

  if (existingIndex >= 0) {
    watchlist.splice(existingIndex, 1);
    saveWatchlist(watchlist);
    showToast(`${titleOf(item)} removed from My List`);
    renderLists();
    return false;
  }

  watchlist.unshift(normalized);
  saveWatchlist(watchlist);
  showToast(`${titleOf(item)} saved to My List`);
  renderLists();
  return true;
}

function syncSavedButtons() {
  const detailsButton = $("#detailsAdd");

  if (detailsButton && state.details) {
    detailsButton.classList.toggle("saved", isSaved(state.details));
    detailsButton.innerHTML = isSaved(state.details)
      ? '<i data-lucide="check"></i>'
      : '<i data-lucide="plus"></i>';
  }

  if (state.hero) {
    const heroButton = $("#heroAdd");
    heroButton.classList.toggle("saved", isSaved(state.hero));
    heroButton.innerHTML = isSaved(state.hero)
      ? '<i data-lucide="check"></i>'
      : '<i data-lucide="plus"></i>';
  }

  for (const button of $$(".short-save")) {
    const item = state.shorts.find(
      (entry) => String(entry.id) === String(button.dataset.id)
    );

    if (!item) {
      continue;
    }

    button.classList.toggle("saved", isSaved(item));
    button.innerHTML = isSaved(item)
      ? '<i data-lucide="bookmark-check"></i>'
      : '<i data-lucide="bookmark-plus"></i>';
  }

  refreshIcons();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 1900);
}

function mediaCard(item) {
  const type = mediaType(item);
  const title = safe(titleOf(item));
  const year = releaseYearOf(item);
  const score = item.vote_average ? Number(item.vote_average).toFixed(1) : "—";
  const posterUrl = poster(item.poster_path, "w500");

  if (!posterUrl) {
    return "";
  }

  return `
    <article
      class="media-card"
      tabindex="0"
      role="button"
      data-open-id="${item.id}"
      data-media-type="${type}"
      aria-label="Open ${title}"
    >
      <img loading="lazy" src="${posterUrl}" alt="${title} poster" />
      <div class="media-card-shade"></div>
      <div class="media-card-meta">
        <strong>${title}</strong>
        <small>${safe(year)}${year ? " · " : ""}${type === "tv" ? "Series" : "Movie"} · ${score}</small>
      </div>
    </article>
  `;
}

function metaHTML(item, details = null) {
  const values = [];
  const year = releaseYearOf(item);

  if (year) {
    values.push(safe(year));
  }

  if (details) {
    const type = mediaType(item);
    const runtime =
      type === "tv"
        ? details.episode_run_time?.[0]
        : details.runtime;

    if (runtime) {
      values.push(formatRuntime(runtime));
    }
  }

  if (item.vote_average) {
    values.push(
      `<span class="score-meta"><i data-lucide="star" fill="currentColor"></i>${Number(item.vote_average).toFixed(1)}</span>`
    );
  }

  if (details?.genres?.length) {
    values.push(details.genres.slice(0, 2).map((genre) => genre.name).join(" · "));
  }

  return values
    .map((value, index) => {
      const dot = index ? '<span class="meta-dot"></span>' : "";
      const content = String(value).startsWith('<span class="score-meta">')
        ? value
        : `<span>${safe(value)}</span>`;
      return `${dot}${content}`;
    })
    .join("");
}

function setLoadingGrid(root, count = 12) {
  root.innerHTML = Array.from({ length: count }, () => (
    '<div class="media-card skeleton" aria-hidden="true"></div>'
  )).join("");
}

async function initHome() {
  if ($("#trendingMovies").children.length) {
    return;
  }

  try {
    const [movies, shows, mixed] = await Promise.all([
      tmdb("/trending/movie/week"),
      tmdb("/trending/tv/week"),
      tmdb("/trending/all/day"),
    ]);

    const movieItems = movies.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "movie" }));

    const showItems = shows.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "tv" }));

    const mixedItems = mixed.results.filter(
      (item) => item.poster_path && ["movie", "tv"].includes(item.media_type)
    );

    state.hero = movieItems.find((item) => item.backdrop_path) || movieItems[0];

    renderHero(state.hero);

    $("#trendingMovies").innerHTML = movieItems.slice(0, 14).map(mediaCard).join("");
    $("#trendingShows").innerHTML = showItems.slice(0, 14).map(mediaCard).join("");
    $("#popularMixed").innerHTML = mixedItems.slice(0, 14).map(mediaCard).join("");

    await loadProviders();
    refreshIcons();
  } catch (error) {
    console.error(error);
    showToast("Could not load Cineamaze right now");
  }
}

function renderHero(item) {
  if (!item) {
    return;
  }

  $("#heroImage").style.backgroundImage = `url("${backdrop(item.backdrop_path || item.poster_path)}")`;
  $("#heroTitle").textContent = titleOf(item);
  $("#heroMeta").innerHTML = metaHTML(item);
  $("#heroOverview").textContent = truncate(item.overview, 240);
  syncSavedButtons();
}

async function loadProviders() {
  if (state.providerCatalog.length) {
    renderProviderRow();
    return;
  }

  try {
    const data = await tmdb("/watch/providers/movie", {
      watch_region: "US",
    });

    const preferred = PREFERRED_PROVIDER_IDS
      .map((id) => data.results.find((provider) => provider.provider_id === id))
      .filter(Boolean);

    state.providerCatalog = preferred.length
      ? preferred
      : data.results.slice(0, 11);

    renderProviderRow();
  } catch (error) {
    console.error(error);
  }
}

function renderProviderRow() {
  $("#providerRow").innerHTML = state.providerCatalog
    .map((provider) => `
      <button
        class="provider-card"
        data-provider-id="${provider.provider_id}"
        aria-label="Browse ${safe(provider.provider_name)}"
      >
        <span class="provider-logo-shell">
          <img
            loading="lazy"
            src="${poster(provider.logo_path, "w185")}" 
            alt="${safe(provider.provider_name)}"
          />
        </span>
        <span>${safe(provider.provider_name)}</span>
      </button>
    `)
    .join("");
}

async function openProvider(providerId) {
  const provider = state.providerCatalog.find(
    (item) => item.provider_id === Number(providerId)
  );

  if (!provider) {
    return;
  }

  state.activeProvider = provider;

  $("#providerPageTitle").textContent = provider.provider_name;
  $("#providerPageLogo").src = poster(provider.logo_path, "w185");
  $("#providerPageLogo").alt = `${provider.provider_name} logo`;
  $("#providerPageSubtitle").textContent = `Movies and shows available from ${provider.provider_name} in the United States.`;

  setLoadingGrid($("#providerMovies"), 12);
  setLoadingGrid($("#providerShows"), 12);
  go("provider");

  try {
    const [movies, shows] = await Promise.all([
      tmdb("/discover/movie", {
        watch_region: "US",
        with_watch_providers: provider.provider_id,
        sort_by: "popularity.desc",
        include_adult: "false",
      }),
      tmdb("/discover/tv", {
        watch_region: "US",
        with_watch_providers: provider.provider_id,
        sort_by: "popularity.desc",
        include_adult: "false",
      }),
    ]);

    const movieItems = movies.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "movie" }));

    const showItems = shows.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "tv" }));

    $("#providerMovies").innerHTML = movieItems.map(mediaCard).join("");
    $("#providerShows").innerHTML = showItems.map(mediaCard).join("");

    const heroItem = movieItems.find((item) => item.backdrop_path) || showItems[0];

    if (heroItem?.backdrop_path) {
      $("#providerHeroBackdrop").style.backgroundImage = `url("${backdrop(heroItem.backdrop_path)}")`;
    }

    refreshIcons();
  } catch (error) {
    console.error(error);
    $("#providerMovies").innerHTML = "";
    $("#providerShows").innerHTML = "";
    showToast(`Could not load ${provider.provider_name}`);
  }
}

async function loadGenres() {
  if (state.movieGenres.length && state.tvGenres.length) {
    return;
  }

  try {
    const [movies, shows] = await Promise.all([
      tmdb("/genre/movie/list"),
      tmdb("/genre/tv/list"),
    ]);

    state.movieGenres = movies.genres || [];
    state.tvGenres = shows.genres || [];

    populateGenreSelect($("#movieGenre"), state.movieGenres);
    populateGenreSelect($("#tvGenre"), state.tvGenres);
  } catch (error) {
    console.error(error);
  }
}

function populateGenreSelect(select, genres) {
  const currentValue = select.value;
  const firstOption = select.querySelector("option")?.outerHTML || "";

  select.innerHTML = firstOption + genres
    .map((genre) => `<option value="${genre.id}">${safe(genre.name)}</option>`)
    .join("");

  select.value = currentValue;
}

function populateYearSelect(select) {
  if (select.options.length > 1) {
    return;
  }

  const currentYear = new Date().getFullYear();

  for (let year = currentYear + 1; year >= 1980; year -= 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }
}

async function loadUpcoming() {
  if ($("#upcomingStrip").children.length) {
    return;
  }

  try {
    const data = await tmdb("/movie/upcoming", { region: "US" });
    const items = data.results.filter((item) => item.backdrop_path).slice(0, 3);

    $("#upcomingStrip").innerHTML = items
      .map((item) => `
        <article
          class="feature-card"
          tabindex="0"
          role="button"
          data-open-id="${item.id}"
          data-media-type="movie"
        >
          <img loading="lazy" src="${backdrop(item.backdrop_path, "w780")}" alt="${safe(titleOf(item))}" />
          <div class="feature-card-copy">
            <small>Upcoming</small>
            <h3>${safe(titleOf(item))}</h3>
          </div>
        </article>
      `)
      .join("");
  } catch (error) {
    console.error(error);
  }
}

async function loadMovies(reset = false) {
  await loadGenres();
  populateYearSelect($("#movieYear"));

  if (reset) {
    state.moviePage = 1;
    $("#moviesGrid").innerHTML = "";
  }

  const page = state.moviePage;
  const genre = $("#movieGenre").value;
  const year = $("#movieYear").value;
  const sortBy = $("#movieSort").value;
  const loadButton = $("#loadMoreMovies");

  loadButton.disabled = true;
  loadButton.textContent = "Loading";

  if (reset) {
    setLoadingGrid($("#moviesGrid"), 18);
  }

  try {
    const data = await tmdb("/discover/movie", {
      page,
      sort_by: sortBy,
      include_adult: "false",
      include_video: "false",
      with_genres: genre,
      primary_release_year: year,
      "vote_count.gte": sortBy === "vote_average.desc" ? 250 : undefined,
    });

    const items = data.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "movie" }));

    if (reset) {
      $("#moviesGrid").innerHTML = "";
    }

    $("#moviesGrid").insertAdjacentHTML(
      "beforeend",
      items.map(mediaCard).join("")
    );

    state.movieTotalPages = Math.min(data.total_pages || 1, 500);
    state.moviePage += 1;
    loadButton.hidden = state.moviePage > state.movieTotalPages;
    refreshIcons();
  } catch (error) {
    console.error(error);

    if (reset) {
      $("#moviesGrid").innerHTML = "";
    }

    showToast("Could not load movies");
  } finally {
    loadButton.disabled = false;
    loadButton.textContent = "Load more";
  }
}

async function loadShows(reset = false) {
  await loadGenres();
  populateYearSelect($("#tvYear"));

  if (reset) {
    state.tvPage = 1;
    $("#showsGrid").innerHTML = "";
  }

  const page = state.tvPage;
  const genre = $("#tvGenre").value;
  const year = $("#tvYear").value;
  const sortBy = $("#tvSort").value;
  const loadButton = $("#loadMoreShows");

  loadButton.disabled = true;
  loadButton.textContent = "Loading";

  if (reset) {
    setLoadingGrid($("#showsGrid"), 18);
  }

  try {
    const data = await tmdb("/discover/tv", {
      page,
      sort_by: sortBy,
      include_adult: "false",
      include_null_first_air_dates: "false",
      with_genres: genre,
      first_air_date_year: year,
      "vote_count.gte": sortBy === "vote_average.desc" ? 150 : undefined,
    });

    const items = data.results
      .filter((item) => item.poster_path)
      .map((item) => ({ ...item, media_type: "tv" }));

    if (reset) {
      $("#showsGrid").innerHTML = "";
    }

    $("#showsGrid").insertAdjacentHTML(
      "beforeend",
      items.map(mediaCard).join("")
    );

    state.tvTotalPages = Math.min(data.total_pages || 1, 500);
    state.tvPage += 1;
    loadButton.hidden = state.tvPage > state.tvTotalPages;
    refreshIcons();
  } catch (error) {
    console.error(error);

    if (reset) {
      $("#showsGrid").innerHTML = "";
    }

    showToast("Could not load shows");
  } finally {
    loadButton.disabled = false;
    loadButton.textContent = "Load more";
  }
}

async function openDetails(id, type) {
  state.previousRoute = state.route === "details" ? state.previousRoute : state.route;

  try {
    const [details, providers] = await Promise.all([
      tmdb(`/${type}/${id}`, {
        append_to_response: "credits,videos,recommendations",
      }),
      tmdb(`/${type}/${id}/watch/providers`).catch(() => ({ results: {} })),
    ]);

    state.details = {
      ...details,
      media_type: type,
    };

    $("#detailsBackdrop").style.backgroundImage = `url("${backdrop(details.backdrop_path || details.poster_path)}")`;
    $("#detailsTitle").textContent = titleOf(details);
    $("#detailsType").textContent = type === "tv" ? "Series" : "Movie";
    $("#detailsMeta").innerHTML = metaHTML(state.details, details);
    $("#detailsOverview").textContent = details.overview || "No overview available.";

    renderCast(details.credits?.cast || []);
    renderRecommendations(details.recommendations?.results || [], type);
    renderWatchProviders(providers.results?.US);
    go("details");
    syncSavedButtons();
    refreshIcons();
  } catch (error) {
    console.error(error);
    showToast("Could not load details");
  }
}

function renderCast(cast) {
  $("#castRail").innerHTML = cast
    .slice(0, 14)
    .map((person) => `
      <article class="cast-person">
        <div class="cast-photo">
          ${
            person.profile_path
              ? `<img loading="lazy" src="${poster(person.profile_path, "w185")}" alt="${safe(person.name)}" />`
              : ""
          }
        </div>
        <strong>${safe(person.name)}</strong>
        <small>${safe(person.character || "")}</small>
      </article>
    `)
    .join("");
}

function renderRecommendations(items, fallbackType) {
  const normalized = items
    .filter((item) => item.poster_path)
    .slice(0, 14)
    .map((item) => ({
      ...item,
      media_type: item.media_type || fallbackType,
    }));

  $("#recommendationsRail").innerHTML = normalized.map(mediaCard).join("");
}

function renderWatchProviders(regionData) {
  const root = $("#watchProviders");

  if (!regionData) {
    root.innerHTML = "";
    return;
  }

  const providerGroups = [
    ...(regionData.flatrate || []),
    ...(regionData.free || []),
    ...(regionData.ads || []),
    ...(regionData.rent || []),
  ];

  const uniqueProviders = [
    ...new Map(
      providerGroups.map((provider) => [provider.provider_id, provider])
    ).values(),
  ].slice(0, 10);

  if (!uniqueProviders.length) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = `
    <div class="provider-label">Available from</div>
    <div class="provider-logos">
      ${uniqueProviders
        .map((provider) => `
          <a
            class="watch-provider"
            href="${safe(regionData.link)}"
            target="_blank"
            rel="noopener noreferrer"
            title="${safe(provider.provider_name)}"
          >
            <img src="${poster(provider.logo_path, "w92")}" alt="${safe(provider.provider_name)}" />
          </a>
        `)
        .join("")}
    </div>
  `;
}

function trailerFor(item) {
  const videos = item?.videos?.results || [];

  return (
    videos.find(
      (video) =>
        video.site === "YouTube" &&
        video.type === "Trailer" &&
        video.official
    ) ||
    videos.find(
      (video) => video.site === "YouTube" && video.type === "Trailer"
    ) ||
    videos.find(
      (video) => video.site === "YouTube" && video.type === "Teaser"
    ) ||
    videos.find((video) => video.site === "YouTube")
  );
}

function historyMatch(item, season = 1, episode = 1) {
  const type = mediaType(item);

  return getHistory().find((entry) => {
    if (entry.id !== item.id || entry.media_type !== type) {
      return false;
    }

    if (type === "tv") {
      return entry.season === season && entry.episode === episode;
    }

    return true;
  });
}

function cineSrcUrl(item, season = 1, episode = 1) {
  const type = mediaType(item);
  const baseUrl =
    type === "tv"
      ? `${CINESRC_ORIGIN}/embed/tv/${item.id}`
      : `${CINESRC_ORIGIN}/embed/movie/${item.id}`;

  const params = new URLSearchParams({
    autoplay: String(state.settings.autoplay),
    muted: String(state.settings.muted),
    controls: "true",
    back: "close",
    color: "#ffffff",
    prioritize: "true",
    autonext: String(state.settings.autonext),
    autoskip: String(state.settings.autoskip),
  });

  if (type === "tv") {
    params.set("s", String(season));
    params.set("e", String(episode));
  }

  if (state.settings.quality) {
    params.set("quality", state.settings.quality);
  }

  const history = historyMatch(item, season, episode);

  if (history?.currentTime > 10 && history?.duration > 0) {
    const completion = history.currentTime / history.duration;

    if (completion < 0.95) {
      params.set("t", String(Math.floor(history.currentTime)));
      params.set("continueprompt", "true");
    }
  }

  return `${baseUrl}?${params.toString()}`;
}

async function getSeasonEpisodes(item, seasonNumber) {
  try {
    return await tmdb(`/tv/${item.id}/season/${seasonNumber}`);
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function setupTvSelectors(item, season = 1, episode = 1) {
  const seasons = (item.seasons || []).filter(
    (entry) => entry.season_number > 0 && (entry.episode_count || 0) > 0
  );

  const seasonSelect = $("#playerSeason");
  const episodeSelect = $("#playerEpisode");

  if (!seasons.length) {
    $("#playerSubbar").hidden = true;
    return { season: 1, episode: 1 };
  }

  seasonSelect.innerHTML = seasons
    .map(
      (entry) => `
        <option value="${entry.season_number}">
          Season ${entry.season_number}
        </option>
      `
    )
    .join("");

  if (!seasons.some((entry) => entry.season_number === Number(season))) {
    season = seasons[0].season_number;
  }

  seasonSelect.value = String(season);

  const seasonData = await getSeasonEpisodes(item, season);
  const episodes = seasonData?.episodes || [];

  state.playerSeasonData = seasonData;

  episodeSelect.innerHTML = episodes
    .map((entry) => `
      <option value="${entry.episode_number}">
        Episode ${entry.episode_number}${entry.name ? ` — ${safe(entry.name)}` : ""}
      </option>
    `)
    .join("");

  if (episodes.length && !episodes.some((entry) => entry.episode_number === Number(episode))) {
    episode = episodes[0].episode_number;
  }

  episodeSelect.value = String(episode);
  $("#playerSubbar").hidden = false;

  return {
    season: Number(season),
    episode: Number(episode),
  };
}

function openPlayerModal() {
  $("#playerModal").classList.add("open");
  $("#playerModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function mountCineSrc(item, season = 1, episode = 1) {
  state.playerItem = item;
  state.playerSeason = Number(season);
  state.playerEpisode = Number(episode);

  const type = mediaType(item);
  const subtitle =
    type === "tv"
      ? `${titleOf(item)} · S${season} E${episode}`
      : titleOf(item);

  $("#playerTitle").textContent = subtitle;
  $("#playerStatus").textContent = "CineSrc";
  $("#playerFrame").innerHTML = `
    <iframe
      id="cineSrcFrame"
      src="${cineSrcUrl(item, season, episode)}"
      title="${safe(titleOf(item))} player"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
      referrerpolicy="origin"
    ></iframe>
  `;

  openPlayerModal();
  recordHistory(item, 0, 0, season, episode, false);
}

async function playCineSrc(item, season = 1, episode = 1) {
  let fullItem = item;
  const type = mediaType(item);

  if (type === "tv" && !item?.seasons) {
    try {
      fullItem = await tmdb(`/tv/${item.id}`);
      fullItem.media_type = "tv";
    } catch (error) {
      console.error(error);
      showToast("Could not load episodes");
      return;
    }
  }

  if (type === "tv") {
    const selected = await setupTvSelectors(fullItem, season, episode);
    season = selected.season;
    episode = selected.episode;
  } else {
    $("#playerSubbar").hidden = true;
  }

  mountCineSrc(fullItem, season, episode);
}

async function playTrailer(item) {
  let fullItem = item;

  if (!item?.videos) {
    try {
      fullItem = await tmdb(`/${mediaType(item)}/${item.id}`, {
        append_to_response: "videos",
      });
      fullItem.media_type = mediaType(item);
    } catch (error) {
      console.error(error);
      showToast("Trailer unavailable");
      return;
    }
  }

  const trailer = trailerFor(fullItem);

  $("#playerTitle").textContent = `${titleOf(fullItem)} — Trailer`;
  $("#playerStatus").textContent = "YouTube";
  $("#playerSubbar").hidden = true;

  if (!trailer) {
    $("#playerFrame").innerHTML = `
      <div class="player-empty">No trailer was returned for this title.</div>
    `;
  } else {
    $("#playerFrame").innerHTML = `
      <iframe
        src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0"
        title="${safe(titleOf(fullItem))} trailer"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
  }

  openPlayerModal();
}

function closePlayer() {
  $("#playerModal").classList.remove("open");
  $("#playerModal").setAttribute("aria-hidden", "true");
  $("#playerFrame").innerHTML = "";
  $("#playerSubbar").hidden = true;

  state.playerItem = null;
  state.playerSeasonData = null;

  syncBodyModalState();
}

function recordHistory(
  item,
  currentTime = 0,
  duration = 0,
  season = 1,
  episode = 1,
  throttle = true
) {
  const now = Date.now();

  if (throttle && now - state.lastHistoryWrite < 5000) {
    return;
  }

  state.lastHistoryWrite = now;

  const type = mediaType(item);
  const history = getHistory();
  const normalized = normalizeMediaItem(item);

  const matchingIndex = history.findIndex((entry) => {
    if (entry.id !== item.id || entry.media_type !== type) {
      return false;
    }

    if (type === "tv") {
      return entry.season === Number(season) && entry.episode === Number(episode);
    }

    return true;
  });

  const previous = matchingIndex >= 0 ? history[matchingIndex] : null;

  const entry = {
    ...normalized,
    season: type === "tv" ? Number(season) : null,
    episode: type === "tv" ? Number(episode) : null,
    currentTime: Number(currentTime) || previous?.currentTime || 0,
    duration: Number(duration) || previous?.duration || 0,
    lastWatched: now,
  };

  if (matchingIndex >= 0) {
    history.splice(matchingIndex, 1);
  }

  history.unshift(entry);
  saveHistory(history);
}

function renderHistory() {
  const root = $("#historyList");
  const history = getHistory();

  $("#clearHistory").disabled = !history.length;

  if (!history.length) {
    root.innerHTML = `
      <div class="history-empty">
        <div>
          <i data-lucide="history"></i>
          <div>Nothing watched yet.</div>
        </div>
      </div>
    `;
    refreshIcons();
    return;
  }

  root.innerHTML = history
    .map((entry, index) => {
      const progress = entry.duration > 0
        ? Math.min(100, Math.round((entry.currentTime / entry.duration) * 100))
        : 0;

      const episodeLabel = entry.media_type === "tv"
        ? `Season ${entry.season} · Episode ${entry.episode}`
        : "Movie";

      return `
        <article class="history-card">
          <div class="history-poster">
            ${
              entry.poster_path
                ? `<img src="${poster(entry.poster_path, "w185")}" alt="${safe(titleOf(entry))} poster" />`
                : ""
            }
          </div>

          <div class="history-copy">
            <h3>${safe(titleOf(entry))}</h3>
            <p>${episodeLabel}${progress ? ` · ${progress}% watched` : ""}</p>
            <div class="progress-track" aria-label="${progress}% watched">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>

          <div class="history-actions">
            <button class="button button-primary history-resume" data-history-index="${index}">
              <i data-lucide="play"></i>
              <span>${progress > 0 && progress < 95 ? "Resume" : "Watch"}</span>
            </button>

            <button class="round-button history-remove" data-history-index="${index}" aria-label="Remove from history">
              <i data-lucide="x"></i>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  refreshIcons();
}

function renderLists() {
  const watchlist = getWatchlist();
  const customLists = getLists();
  const root = $("#userListsPanel");

  if (!watchlist.length && !customLists.length) {
    root.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">
          <i data-lucide="bookmark"></i>
        </span>
        <h3>No lists yet</h3>
        <p>Save a movie from Home, Shorts, search, or a detail page to start your Watchlist.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  const defaultList = {
    name: "Watchlist",
    description: "Movies and shows you saved across Cineamaze.",
    items: watchlist,
  };

  const lists = [defaultList, ...customLists];

  root.innerHTML = `
    <div class="list-grid">
      ${lists.map(renderUserListCard).join("")}
    </div>
  `;

  refreshIcons();
}

function renderUserListCard(list) {
  const items = Array.isArray(list.items) ? list.items : [];
  const posters = items.filter((item) => item.poster_path).slice(0, 4);

  const posterStrip = posters.length
    ? posters
        .map(
          (item) => `<img src="${poster(item.poster_path, "w185")}" alt="" />`
        )
        .join("")
    : `
      <span class="list-poster-placeholder"><i data-lucide="film"></i></span>
      <span class="list-poster-placeholder"><i data-lucide="tv"></i></span>
      <span class="list-poster-placeholder"><i data-lucide="clapperboard"></i></span>
      <span class="list-poster-placeholder"><i data-lucide="bookmark"></i></span>
    `;

  return `
    <article class="user-list-card">
      <div class="list-poster-strip">${posterStrip}</div>
      <h3>${safe(list.name || "Untitled list")}</h3>
      <p>${safe(list.description || "A Cineamaze collection.")}</p>
      <small>${items.length} ${items.length === 1 ? "title" : "titles"}</small>
    </article>
  `;
}

async function renderPublicLists() {
  const root = $("#publicListGrid");

  if (root.children.length) {
    return;
  }

  const collections = [
    { name: "Late-night thrillers", genre: 53, query: "movie" },
    { name: "New horror", genre: 27, query: "movie" },
    { name: "Easy comedy", genre: 35, query: "movie" },
    { name: "Science fiction", genre: 878, query: "movie" },
    { name: "Crime series", genre: 80, query: "tv" },
    { name: "Animated favorites", genre: 16, query: "movie" },
  ];

  root.innerHTML = collections
    .map(
      (collection) => `
        <article class="collection-card skeleton" data-collection="${safe(collection.name)}"></article>
      `
    )
    .join("");

  try {
    const loaded = await Promise.all(
      collections.map(async (collection) => {
        const endpoint = collection.query === "tv" ? "/discover/tv" : "/discover/movie";
        const data = await tmdb(endpoint, {
          with_genres: collection.genre,
          sort_by: "popularity.desc",
          include_adult: "false",
        });

        return {
          ...collection,
          items: data.results.filter((item) => item.poster_path).slice(0, 4),
        };
      })
    );

    root.innerHTML = loaded.map(renderCollectionCard).join("");
    refreshIcons();
  } catch (error) {
    console.error(error);
    root.innerHTML = "";
    showToast("Could not load collections");
  }
}

function renderCollectionCard(collection) {
  return `
    <article
      class="collection-card"
      tabindex="0"
      role="button"
      data-collection-genre="${collection.genre}"
      data-collection-type="${collection.query}"
      data-collection-name="${safe(collection.name)}"
    >
      <div class="collection-mosaic">
        ${collection.items
          .map(
            (item) => `<img src="${poster(item.poster_path, "w342")}" alt="" />`
          )
          .join("")}
      </div>
      <div class="collection-copy">
        <h3>${safe(collection.name)}</h3>
        <p>Current popular picks</p>
      </div>
    </article>
  `;
}

async function openCollection(genreId, type) {
  if (type === "tv") {
    go("shows");
    await loadGenres();
    $("#tvGenre").value = String(genreId);
    await loadShows(true);
    return;
  }

  go("movies");
  await loadGenres();
  $("#movieGenre").value = String(genreId);
  await loadMovies(true);
}

async function loadShorts() {
  if (state.shortsLoaded) {
    setupShortsObserver();
    return;
  }

  const root = $("#shortsFeed");
  root.innerHTML = '<div class="short-slide skeleton"></div>';

  try {
    const trending = await tmdb("/trending/movie/week");
    const candidates = trending.results
      .filter((item) => item.backdrop_path || item.poster_path)
      .slice(0, 12);

    const enriched = await Promise.all(
      candidates.map(async (item) => {
        try {
          const details = await tmdb(`/movie/${item.id}`, {
            append_to_response: "videos",
          });

          return {
            ...item,
            ...details,
            media_type: "movie",
          };
        } catch {
          return {
            ...item,
            media_type: "movie",
          };
        }
      })
    );

    state.shorts = enriched.filter((item) => trailerFor(item) || item.poster_path);
    state.shortsLoaded = true;

    root.innerHTML = state.shorts.map(renderShortSlide).join("");
    syncSavedButtons();
    setupShortsObserver();
    refreshIcons();
  } catch (error) {
    console.error(error);
    root.innerHTML = "";
    showToast("Could not load Shorts");
  }
}

function renderShortSlide(item) {
  const trailer = trailerFor(item);
  const trailerUrl = trailer
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(trailer.key)}`
    : "";

  const background = backdrop(item.backdrop_path || item.poster_path, "original");

  return `
    <article class="short-slide" data-short-id="${item.id}">
      <div class="short-backdrop" style="background-image: url('${background}')"></div>
      <div class="short-shade"></div>

      <div class="short-label">
        <i data-lucide="play-square"></i>
        <span>Movie trailers</span>
      </div>

      <div class="short-stage">
        <div class="short-video-shell">
          ${
            trailerUrl
              ? `<iframe data-short-src="${trailerUrl}" title="${safe(titleOf(item))} trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
              : `<img class="short-poster-fallback" src="${poster(item.poster_path, "w780")}" alt="${safe(titleOf(item))} poster" />`
          }
        </div>

        <div class="short-content">
          <h2>${safe(titleOf(item))}</h2>
          <p>${safe(truncate(item.overview, 120))}</p>
        </div>

        <div class="short-actions">
          <button class="short-action short-save" data-id="${item.id}" aria-label="Save to My List">
            <i data-lucide="bookmark-plus"></i>
          </button>

          <button class="short-action short-details" data-id="${item.id}" aria-label="View details">
            <i data-lucide="info"></i>
          </button>

          <button class="short-action short-watch" data-id="${item.id}" aria-label="Watch movie">
            <i data-lucide="play"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function setupShortsObserver() {
  state.shortsObserver?.disconnect();

  const slides = $$(".short-slide", $("#shortsFeed"));

  if (!slides.length) {
    return;
  }

  state.shortsObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const frame = $("iframe[data-short-src]", entry.target);

        if (!frame) {
          continue;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
          if (!frame.src || frame.src === "about:blank") {
            frame.src = frame.dataset.shortSrc;
          }
        } else if (frame.src && frame.src !== "about:blank") {
          frame.src = "about:blank";
        }
      }
    },
    {
      root: $("#shortsFeed"),
      threshold: [0, 0.62, 1],
    }
  );

  slides.forEach((slide) => state.shortsObserver.observe(slide));
}

function renderSearchResults(items) {
  const root = $("#searchResults");

  root.innerHTML = items
    .filter(
      (item) =>
        ["movie", "tv"].includes(mediaType(item)) &&
        (item.backdrop_path || item.poster_path)
    )
    .slice(0, 8)
    .map((item) => `
      <button
        class="search-result"
        data-open-id="${item.id}"
        data-media-type="${mediaType(item)}"
      >
        <img
          src="${backdrop(item.backdrop_path || item.poster_path, "w500")}" 
          alt="${safe(titleOf(item))}"
        />
        <span class="search-result-copy">
          <strong>${safe(titleOf(item))}</strong>
          <small>${safe(releaseYearOf(item))} · ${mediaType(item) === "tv" ? "Series" : "Movie"}</small>
        </span>
      </button>
    `)
    .join("");
}

const runGlobalSearch = debounce(async (query) => {
  const value = query.trim();

  if (!value) {
    $("#searchResults").innerHTML = "";
    return;
  }

  try {
    const data = await tmdb("/search/multi", {
      query: value,
      include_adult: "false",
    });

    renderSearchResults(data.results || []);
  } catch (error) {
    console.error(error);
  }
}, 260);

function openSearch() {
  $("#searchLayer").classList.add("open");
  $("#searchLayer").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  setTimeout(() => $("#globalSearch").focus(), 50);
}

function closeSearch() {
  $("#searchLayer").classList.remove("open");
  $("#searchLayer").setAttribute("aria-hidden", "true");
  syncBodyModalState();
}

function openListModal() {
  $("#listModal").classList.add("open");
  $("#listModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => $("#newListName").focus(), 50);
}

function closeListModal() {
  $("#listModal").classList.remove("open");
  $("#listModal").setAttribute("aria-hidden", "true");
  syncBodyModalState();
}

function openSettings() {
  $("#menuPopover").classList.remove("open");

  $("#settingAutoplay").checked = state.settings.autoplay;
  $("#settingMuted").checked = state.settings.muted;
  $("#settingAutonext").checked = state.settings.autonext;
  $("#settingAutoskip").checked = state.settings.autoskip;
  $("#settingQuality").value = state.settings.quality;
  $("#settingReduceMotion").checked = state.settings.reduceMotion;

  $("#settingsModal").classList.add("open");
  $("#settingsModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeSettings() {
  $("#settingsModal").classList.remove("open");
  $("#settingsModal").setAttribute("aria-hidden", "true");
  syncBodyModalState();
}

function syncBodyModalState() {
  const anyOpen =
    $("#searchLayer").classList.contains("open") ||
    $("#listModal").classList.contains("open") ||
    $("#settingsModal").classList.contains("open") ||
    $("#playerModal").classList.contains("open");

  document.body.classList.toggle("modal-open", anyOpen);
}

function go(route) {
  const pageMap = {
    home: "homePage",
    movies: "moviesPage",
    shows: "showsPage",
    provider: "providerPage",
    lists: "listsPage",
    discover: "discoverPage",
    history: "historyPage",
    shorts: "shortsPage",
    details: "detailsPage",
  };

  if (!pageMap[route]) {
    return;
  }

  state.route = route;

  $$(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageMap[route]);
  });

  $$(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });

  $("#menuPopover").classList.remove("open");
  $("#menuPopover").setAttribute("aria-hidden", "true");

  if (route !== "shorts") {
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  if (route === "home") {
    initHome();
  }

  if (route === "movies") {
    loadUpcoming();

    if (!$("#moviesGrid").children.length) {
      loadMovies();
    }
  }

  if (route === "shows" && !$("#showsGrid").children.length) {
    loadShows();
  }

  if (route === "lists") {
    renderLists();
  }

  if (route === "discover") {
    renderPublicLists();
  }

  if (route === "history") {
    renderHistory();
  }

  if (route === "shorts") {
    loadShorts();
  } else {
    state.shortsObserver?.disconnect();

    for (const frame of $$("#shortsFeed iframe")) {
      frame.src = "about:blank";
    }
  }

  for (const video of $$(".liquid-video")) {
    if (state.settings.reduceMotion) {
      video.pause();
      continue;
    }

    if (video.closest(".page.active")) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  refreshIcons();
}

function createCustomList() {
  const name = $("#newListName").value.trim();
  const description = $("#newListDescription").value.trim();

  if (!name) {
    showToast("Give your list a name");
    return;
  }

  const lists = getLists();
  lists.unshift({
    id: crypto.randomUUID?.() || `list-${Date.now()}`,
    name,
    description,
    items: [],
  });

  saveLists(lists);

  $("#newListName").value = "";
  $("#newListDescription").value = "";
  closeListModal();
  showToast("List created");
}

function saveSettingsFromForm() {
  saveSettings({
    autoplay: $("#settingAutoplay").checked,
    muted: $("#settingMuted").checked,
    autonext: $("#settingAutonext").checked,
    autoskip: $("#settingAutoskip").checked,
    quality: $("#settingQuality").value,
    reduceMotion: $("#settingReduceMotion").checked,
  });

  closeSettings();
  showToast("Settings saved");
}

function findShortItem(id) {
  return state.shorts.find((item) => String(item.id) === String(id));
}

function handleOpenCard(target) {
  const openable = target.closest("[data-open-id][data-media-type]");

  if (!openable) {
    return false;
  }

  openDetails(openable.dataset.openId, openable.dataset.mediaType);
  closeSearch();
  return true;
}

function handleKeyboardOpen(event) {
  if (!["Enter", " "].includes(event.key)) {
    return;
  }

  const openable = event.target.closest("[data-open-id][data-media-type]");

  if (openable) {
    event.preventDefault();
    openDetails(openable.dataset.openId, openable.dataset.mediaType);
  }

  const collection = event.target.closest("[data-collection-genre]");

  if (collection) {
    event.preventDefault();
    openCollection(collection.dataset.collectionGenre, collection.dataset.collectionType);
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const routeButton = event.target.closest(".route-button[data-route]");

    if (routeButton) {
      go(routeButton.dataset.route);
      return;
    }

    if (handleOpenCard(event.target)) {
      return;
    }

    const providerButton = event.target.closest("[data-provider-id]");

    if (providerButton) {
      openProvider(providerButton.dataset.providerId);
      return;
    }

    const collection = event.target.closest("[data-collection-genre]");

    if (collection) {
      openCollection(collection.dataset.collectionGenre, collection.dataset.collectionType);
      return;
    }
  });

  document.addEventListener("keydown", handleKeyboardOpen);

  $("#heroPlay").addEventListener("click", () => {
    if (state.hero) {
      playCineSrc(state.hero);
    }
  });

  $("#heroAdd").addEventListener("click", () => {
    if (state.hero) {
      addToWatchlist(state.hero);
    }
  });

  $("#heroInfo").addEventListener("click", () => {
    if (state.hero) {
      openDetails(state.hero.id, "movie");
    }
  });

  $("#detailsWatch").addEventListener("click", () => {
    if (state.details) {
      playCineSrc(state.details);
    }
  });

  $("#detailsTrailer").addEventListener("click", () => {
    if (state.details) {
      playTrailer(state.details);
    }
  });

  $("#detailsAdd").addEventListener("click", () => {
    if (state.details) {
      addToWatchlist(state.details);
    }
  });

  $("#detailsBack").addEventListener("click", () => {
    go(state.previousRoute || "home");
  });

  $("#loadMoreMovies").addEventListener("click", () => loadMovies());
  $("#loadMoreShows").addEventListener("click", () => loadShows());

  $("#movieGenre").addEventListener("change", () => loadMovies(true));
  $("#movieYear").addEventListener("change", () => loadMovies(true));
  $("#movieSort").addEventListener("change", () => loadMovies(true));

  $("#tvGenre").addEventListener("change", () => loadShows(true));
  $("#tvYear").addEventListener("change", () => loadShows(true));
  $("#tvSort").addEventListener("change", () => loadShows(true));

  $("#openSearch").addEventListener("click", openSearch);
  $("#closeSearch").addEventListener("click", closeSearch);
  $("#globalSearch").addEventListener("input", (event) => {
    runGlobalSearch(event.target.value);
  });

  $("#searchLayer").addEventListener("click", (event) => {
    if (event.target === $("#searchLayer")) {
      closeSearch();
    }
  });

  $("#openMenu").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#menuPopover");
    const open = !menu.classList.contains("open");

    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
  });

  $("#openSettings").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", closeSettings);
  $("#saveSettings").addEventListener("click", saveSettingsFromForm);

  $("#settingsModal").addEventListener("click", (event) => {
    if (event.target === $("#settingsModal")) {
      closeSettings();
    }
  });

  $("#createList").addEventListener("click", openListModal);
  $("#closeListModal").addEventListener("click", closeListModal);
  $("#saveList").addEventListener("click", createCustomList);

  $("#listModal").addEventListener("click", (event) => {
    if (event.target === $("#listModal")) {
      closeListModal();
    }
  });

  $("#discoverSearch").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();

    for (const card of $$(".collection-card")) {
      const label = card.dataset.collectionName?.toLowerCase() || card.textContent.toLowerCase();
      card.hidden = query && !label.includes(query);
    }
  });

  $("#clearHistory").addEventListener("click", () => {
    if (!getHistory().length) {
      return;
    }

    localStorage.removeItem(STORAGE_KEYS.history);
    renderHistory();
    showToast("Watch history cleared");
  });

  $("#historyList").addEventListener("click", (event) => {
    const resumeButton = event.target.closest(".history-resume");
    const removeButton = event.target.closest(".history-remove");

    if (resumeButton) {
      const entry = getHistory()[Number(resumeButton.dataset.historyIndex)];

      if (entry) {
        playCineSrc(entry, entry.season || 1, entry.episode || 1);
      }
    }

    if (removeButton) {
      const history = getHistory();
      history.splice(Number(removeButton.dataset.historyIndex), 1);
      saveHistory(history);
    }
  });

  $("#shortsFeed").addEventListener("click", (event) => {
    const saveButton = event.target.closest(".short-save");
    const detailsButton = event.target.closest(".short-details");
    const watchButton = event.target.closest(".short-watch");

    const actionButton = saveButton || detailsButton || watchButton;

    if (!actionButton) {
      return;
    }

    const item = findShortItem(actionButton.dataset.id);

    if (!item) {
      return;
    }

    if (saveButton) {
      addToWatchlist(item);
    }

    if (detailsButton) {
      openDetails(item.id, "movie");
    }

    if (watchButton) {
      playCineSrc(item);
    }
  });

  $("#closePlayer").addEventListener("click", closePlayer);

  $("#playerSeason").addEventListener("change", async (event) => {
    if (!state.playerItem) {
      return;
    }

    const season = Number(event.target.value);
    const selected = await setupTvSelectors(state.playerItem, season, 1);
    mountCineSrc(state.playerItem, selected.season, selected.episode);
  });

  $("#playerEpisode").addEventListener("change", (event) => {
    if (!state.playerItem) {
      return;
    }

    const episode = Number(event.target.value);
    mountCineSrc(state.playerItem, state.playerSeason, episode);
  });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest("#menuPopover") &&
      !event.target.closest("#openMenu")
    ) {
      $("#menuPopover").classList.remove("open");
      $("#menuPopover").setAttribute("aria-hidden", "true");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeSearch();
    closeSettings();
    closeListModal();

    if ($("#playerModal").classList.contains("open")) {
      closePlayer();
    }
  });

  window.addEventListener("message", handleCineSrcMessage);
}

function handleCineSrcMessage(event) {
  if (event.origin !== CINESRC_ORIGIN || !state.playerItem) {
    return;
  }

  const data = event.data || {};

  switch (data.type) {
    case "cinesrc:ready":
      $("#playerStatus").textContent = "Ready";
      break;

    case "cinesrc:play":
      $("#playerStatus").textContent = "Playing";
      recordHistory(
        state.playerItem,
        0,
        0,
        state.playerSeason,
        state.playerEpisode,
        false
      );
      break;

    case "cinesrc:pause":
      $("#playerStatus").textContent = "Paused";
      break;

    case "cinesrc:timeupdate":
      recordHistory(
        state.playerItem,
        data.currentTime,
        data.duration,
        state.playerSeason,
        state.playerEpisode,
        true
      );
      break;

    case "cinesrc:ended":
      recordHistory(
        state.playerItem,
        data.duration || 0,
        data.duration || 0,
        state.playerSeason,
        state.playerEpisode,
        false
      );
      break;

    case "cinesrc:nextepisode":
      state.playerSeason = Number(data.season) || state.playerSeason;
      state.playerEpisode = Number(data.episode) || state.playerEpisode;
      $("#playerSeason").value = String(state.playerSeason);
      $("#playerEpisode").value = String(state.playerEpisode);
      $("#playerTitle").textContent = `${titleOf(state.playerItem)} · S${state.playerSeason} E${state.playerEpisode}`;
      break;

    case "cinesrc:error":
      $("#playerStatus").textContent = "Playback error";
      showToast("The stream returned an error");
      break;

    case "cinesrc:close":
      closePlayer();
      break;

    default:
      break;
  }
}

async function initialize() {
  applySettings();
  bindEvents();
  refreshIcons();

  await Promise.all([
    initHome(),
    loadGenres(),
  ]);

  populateYearSelect($("#movieYear"));
  populateYearSelect($("#tvYear"));
  refreshIcons();
}

initialize();
