// Country name → ISO code + continent, from the static `world-countries` dataset (same source as the register form,
// so the names saved on businesses line up). Flags are real SVG files in /public/flags (named by ISO-2 code) instead
// of emoji, because Windows does not draw flag emoji — it shows two letters.
import worldCountries from "world-countries";

export interface CountryInfo {
  code: string;      // ISO 3166-1 alpha-2, lower-case — also the flag file name
  name: string;
  continent: Continent;
}

export type Continent = "Africa" | "Asia" | "Europe" | "North America" | "South America" | "Oceania" | "Antarctica";

export const CONTINENTS: Continent[] = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function continentOf(region: string, subregion: string): Continent {
  if (region === "Americas") return subregion === "South America" ? "South America" : "North America";
  if (region === "Africa" || region === "Asia" || region === "Europe" || region === "Oceania") return region;
  return "Antarctica";
}

// Names people (or older data) use that differ from the dataset's common name.
const ALIASES: Record<string, string> = {
  "congo kinshasa": "CD", "democratic republic of the congo": "CD", "drc": "CD", "congo brazzaville": "CG", "republic of the congo": "CG",
  "ivory coast": "CI", "cote d ivoire": "CI", "swaziland": "SZ", "eswatini": "SZ", "uae": "AE", "uk": "GB", "england": "GB", "scotland": "GB",
  "usa": "US", "united states of america": "US", "russia": "RU", "tanzania": "TZ", "south korea": "KR", "north korea": "KP", "cape verde": "CV",
  "czech republic": "CZ", "burma": "MM", "macedonia": "MK", "palestine": "PS", "vatican": "VA", "east timor": "TL",
};

let index: Map<string, CountryInfo> | null = null;
function build(): Map<string, CountryInfo> {
  const m = new Map<string, CountryInfo>();
  const byCode = new Map<string, CountryInfo>();
  for (const c of worldCountries) {
    const info: CountryInfo = { code: c.cca2.toLowerCase(), name: c.name.common, continent: continentOf(c.region, c.subregion) };
    byCode.set(c.cca2, info);
    for (const n of [c.name.common, c.name.official, c.cca2, c.cca3, ...(c.altSpellings ?? [])]) if (n) m.set(norm(n), info);
  }
  for (const [alias, code] of Object.entries(ALIASES)) { const info = byCode.get(code); if (info) m.set(alias, info); }
  return m;
}

/** Look a saved country name up; null when it isn't a recognisable country. */
export function countryInfo(name: string): CountryInfo | null {
  index ??= build();
  return index.get(norm(name)) ?? null;
}

export const COUNTRY_NAMES = worldCountries.map(c => c.name.common).sort();
