import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

/**
 * GeolocationService (dynamic provider version)
 *
 * - IP geolocation provider (user‑selectable):
 *      • ipapi.co
 *      • ipinfo.io
 *
 * - Geocoding provider (user‑selectable):
 *      • OpenStreetMap
 *      • Open‑Meteo geocoding
 *
 * Notes:
 * - All network requests include a User-Agent header.
 * - Returns null on failure instead of throwing.
 */

const IP_API = 0;
const IP_INFO = 1;

const GEO_OSM = 0;
const GEO_OPEN_METEO = 1;

export class GeolocationService {
    constructor(settings) {
        this._settings = settings;
        this._session = new Soup.Session();
    }

    /* ---------------------------------------------------------
     * 1. Get device location using IP geolocation
     * --------------------------------------------------------- */
    async getCurrentLocation() {
        const provider = this._settings.get_enum('ipgeo-provider');

        if (provider === IP_API) {
            // ipapi.co first, fallback ipinfo.io
            const loc = await this._tryIpApi() ?? await this._tryIpInfo();
            return loc;
        } else {
            // ipinfo.io first, fallback ipapi.co
            const loc = await this._tryIpInfo() ?? await this._tryIpApi();
            return loc;
        }
    }

    async _tryIpApi() {
        try {
            const json = await this._getJson('https://ipapi.co/json/');

            if (json && json.city && json.latitude && json.longitude) {
                return {
                    city: json.city,
                    region: json.region ?? null,
                    country: json.country_name ?? json.country ?? null,
                    lat: Number(json.latitude),
                    lon: Number(json.longitude),
                    accuracy: 20000,
                    raw: json,
                };
            }
        } catch (e) {
            log('ipapi.co failed: ' + e.message);
        }
        return null;
    }

    async _tryIpInfo() {
        try {
            const json = await this._getJson('https://ipinfo.io/json');

            if (json && json.loc) {
                const [lat, lon] = json.loc.split(',').map(Number);

                return {
                    city: json.city ?? null,
                    region: json.region ?? null,
                    country: json.country ?? null,
                    lat,
                    lon,
                    accuracy: 50000,
                    raw: json,
                };
            }
        } catch (e) {
            log('ipinfo.io failed: ' + e.message);
        }
        return null;
    }

    /* ---------------------------------------------------------
     * 2. Reverse geocoding (coordinates → city)
     * --------------------------------------------------------- */
    async reverseGeocode(loc) {
        if (!loc || !loc.lat || !loc.lon)
            return null;

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const result = await this._reverseGeocodeOpenMeteo(loc);
            if (result?.name !== 'Unknown')
                return result;

            // Fallback to OpenStreetMap
            return await this._reverseGeocodeNominatim(loc);
        }

        const result = await this._reverseGeocodeNominatim(loc);
        if (result?.name !== 'Unknown')
            return result;

        // Fallback to Open‑Meteo
        return await this._reverseGeocodeOpenMeteo(loc);
    }

    async _reverseGeocodeNominatim(loc) {
        const url =
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lon}&addressdetails=1`;

        const json = await this._getJsonWithUA(url);

        if (json?.address) {
            const addr = json.address;

            const name =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.hamlet ||
                addr.locality ||
                addr.municipality ||
                null;

            return {
                name: name ?? 'Unknown',
                country: addr.country ?? loc.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
            };
        }

        return {
            name: loc.city ?? 'Unknown',
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    _buildDisplayName(r) {
        const parts = [];

        // Postal code + name if available
        if (r.postcodes?.length)
            parts.push(`${r.postcodes[0]} ${r.name}`);
        else
            parts.push(r.name);

        if (r.admin3) parts.push(r.admin3);
        if (r.admin2) parts.push(r.admin2);
        if (r.admin1) parts.push(r.admin1);
        if (r.country) parts.push(r.country);

        return parts.join(', ');
    }

    async _reverseGeocodeOpenMeteo(loc) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/reverse?` +
            `latitude=${loc.lat}&longitude=${loc.lon}&language=en&format=json`;

        const json = await this._getJson(url);

        if (json?.results?.length > 0) {
            const r = json.results[0];

            return {
                name: this._buildDisplayName(r),
                country: r.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
                raw: r,
            };
        }

        return {
            name: loc.city ?? 'Unknown',
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    /* ---------------------------------------------------------
     * 3. Forward geocoding (search by city name or postal code)
     * --------------------------------------------------------- */
    async searchCity(query) {
        if (!query || !query.trim())
            return [];

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const results = await this._searchOpenMeteo(query);
            if (results.length > 0)
                return results;

            // Fallback to OpenStreetMap
            return await this._searchNominatim(query);
        }

        const results = await this._searchNominatim(query);
        if (results.length > 0)
            return results;

        // Fallback to Open‑Meteo
        return await this._searchOpenMeteo(query);
    }

    async _searchNominatim(query) {
        const url =
            `https://nominatim.openstreetmap.org/search?` +
            `format=json&addressdetails=1&limit=10&q=${encodeURIComponent(query)}`;

        const json = await this._getJsonWithUA(url);

        if (!Array.isArray(json) || json.length === 0)
            return [];

        return json.map(r => {
            const addr = r.address ?? {};

            const name =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.hamlet ||
                addr.locality ||
                r.display_name ||
                query;

            return {
                name,
                country: addr.country ?? null,
                lat: Number(r.lat),
                lon: Number(r.lon),
            };
        });
    }

    async _searchOpenMeteo(query) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/search?` +
            `name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

        const json = await this._getJson(url);

        if (!json?.results)
            return [];

        return json.results.map(r => ({
            name: this._buildDisplayName(r),
            country: r.country ?? null,
            lat: r.latitude,
            lon: r.longitude,
            raw: r,
        }));
    }

    /* ---------------------------------------------------------
     * HTTP helpers
     * --------------------------------------------------------- */
    _getJson(url) {
        return new Promise((resolve) => {
            const msg = Soup.Message.new('GET', url);
            msg.request_headers.append('User-Agent', 'weatherpanel');

            this._session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, res) => {
                    try {
                        const bytes = session.send_and_read_finish(res);
                        const text = new TextDecoder().decode(bytes.get_data());
                        resolve(JSON.parse(text));
                    } catch (e) {
                        resolve(null);
                    }
                }
            );
        });
    }

    _getJsonWithUA(url) {
        return new Promise((resolve, reject) => {
            const msg = Soup.Message.new('GET', url);
            msg.request_headers.append('User-Agent', 'weatherpanel');

            this._session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, res) => {
                    try {
                        const bytes = session.send_and_read_finish(res);
                        const text = new TextDecoder().decode(bytes.get_data());
                        resolve(JSON.parse(text));
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }
}

