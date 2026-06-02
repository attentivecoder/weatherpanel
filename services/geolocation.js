import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

/**
 * GeolocationService (schema-driven)
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

    abort() {
        this._session?.abort();
    }

    destroy() {
        this.abort();
        this._session = null;
    }

    /* ---------------------------------------------------------
     * IP GEOLOCATION
     * --------------------------------------------------------- */

    async getCurrentLocation() {
        if (!this._session)
            return null;

        const provider = this._settings.get_enum('ipgeo-provider');

        if (provider === IP_API)
            return await this._tryIpApi() ?? await this._tryIpInfo();

        return await this._tryIpInfo() ?? await this._tryIpApi();
    }

    _normalizeIpLocation({ city, region, country, lat, lon }) {
        return {
            label: city ?? null,
            region: region ?? null,
            postcode: null,
            country: country ?? null,
            lat: Number(lat),
            lon: Number(lon),
        };
    }

    async _tryIpApi() {
        try {
            const json = await this._getJson('https://ipapi.co/json/');
            if (!this._session) return null;

            if (json?.city && json?.latitude && json?.longitude) {
                return this._normalizeIpLocation({
                    city: json.city,
                    region: json.region,
                    country: json.country_name ?? json.country,
                    lat: json.latitude,
                    lon: json.longitude,
                });
            }
        } catch (e) {
            log('ipapi.co failed: ' + e.message);
        }
        return null;
    }

    async _tryIpInfo() {
        try {
            const json = await this._getJson('https://ipinfo.io/json');
            if (!this._session) return null;

            if (json?.loc) {
                const [lat, lon] = json.loc.split(',').map(Number);

                return this._normalizeIpLocation({
                    city: json.city,
                    region: json.region,
                    country: json.country,
                    lat,
                    lon,
                });
            }
        } catch (e) {
            log('ipinfo.io failed: ' + e.message);
        }
        return null;
    }

    /* ---------------------------------------------------------
     * REVERSE GEOCODING
     * --------------------------------------------------------- */

    async reverseGeocode(loc) {
        if (!this._session || !loc?.lat || !loc?.lon)
            return null;

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const r = await this._reverseOpenMeteo(loc);
            if (r?.label)
                return r;

            return await this._reverseNominatim(loc);
        }

        const r = await this._reverseNominatim(loc);
        if (r?.label)
            return r;

        return await this._reverseOpenMeteo(loc);
    }

    async _reverseNominatim(loc) {
        const url =
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lon}&addressdetails=1`;

        const json = await this._getJson(url);
        if (!this._session)
            return null;

        if (json?.address) {
            const a = json.address;

            const label =
                a.city ||
                a.town ||
                a.village ||
                a.hamlet ||
                a.locality ||
                a.municipality ||
                null;

            return {
                label,
                region: a.state ?? a.region ?? a.county ?? null,
                postcode: a.postcode ?? null,
                country: a.country ?? loc.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
            };
        }

        return {
            label: null,
            region: null,
            postcode: null,
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    async _reverseOpenMeteo(loc) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${loc.lat}&longitude=${loc.lon}&language=en&format=json`;

        const json = await this._getJson(url);
        if (!this._session)
            return null;

        if (json?.results?.length > 0) {
            const r = json.results[0];

            return {
                label: r.name ?? null,
                region: r.admin1 ?? r.admin2 ?? null,
                postcode: r.postcode ?? null,
                country: r.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
            };
        }

        return {
            label: null,
            region: null,
            postcode: null,
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    /* ---------------------------------------------------------
     * FORWARD GEOCODING
     * --------------------------------------------------------- */

    async searchCity(query) {
        if (!this._session || !query?.trim())
            return [];

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const r = await this._searchOpenMeteo(query);
            if (r.length > 0)
                return r;

            return await this._searchNominatim(query);
        }

        const r = await this._searchNominatim(query);
        if (r.length > 0)
            return r;

        return await this._searchOpenMeteo(query);
    }

    async _searchNominatim(query) {
        const url =
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(query)}`;

        const json = await this._getJson(url);
        if (!this._session || !Array.isArray(json))
            return [];

        return json.map(r => {
            const a = r.address ?? {};

            const label =
                a.city ||
                a.town ||
                a.village ||
                a.hamlet ||
                a.locality ||
                r.display_name ||
                null;

            return {
                label,
                region: a.state ?? null,
                postcode: a.postcode ?? null,
                country: a.country ?? null,
                lat: Number(r.lat),
                lon: Number(r.lon),
            };
        });
    }

    async _searchOpenMeteo(query) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

        const json = await this._getJson(url);
        if (!this._session || !json?.results)
            return [];

        return json.results.map(r => ({
            label: r.name ?? null,
            region: r.admin1 ?? null,
            postcode: r.postcode ?? null,
            country: r.country ?? null,
            lat: r.latitude,
            lon: r.longitude,
        }));
    }

    /* ---------------------------------------------------------
     * HTTP
     * --------------------------------------------------------- */

    _getJson(url) {
        return new Promise(resolve => {
            if (!this._session)
                return resolve(null);

            const msg = new Soup.Message({
                method: 'GET',
                uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
            });

            msg.request_headers.append('User-Agent', 'weatherpanel');

            this._session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, res) => {
                    try {
                        if (!this._session)
                            return resolve(null);

                        const bytes = session.send_and_read_finish(res);
                        const text = new TextDecoder().decode(bytes.get_data());
                        resolve(JSON.parse(text));
                    } catch {
                        resolve(null);
                    }
                }
            );
        });
    }
}
