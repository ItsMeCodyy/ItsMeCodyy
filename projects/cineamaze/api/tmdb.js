const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: "TMDB_API_KEY is not configured" });
  }

  const requestedPath = String(request.query.path || "");

  if (!/^\/[A-Za-z0-9_\-/]+$/.test(requestedPath)) {
    return response.status(400).json({ error: "Invalid TMDB path" });
  }

  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(request.query)) {
    if (key === "path" || rawValue === undefined) {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      params.append(key, String(value));
    }
  }

  params.set("api_key", apiKey);

  if (!params.has("language")) {
    params.set("language", "en-US");
  }

  const upstreamUrl = `${TMDB_BASE_URL}${requestedPath}?${params.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    const body = await upstream.text();

    response.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=3600"
    );
    response.setHeader("Content-Type", "application/json; charset=utf-8");

    return response.status(upstream.status).send(body);
  } catch (error) {
    console.error("TMDB proxy error", error);
    return response.status(502).json({ error: "TMDB request failed" });
  }
}
