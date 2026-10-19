import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gettext from 'gettext';

// Used by both the shell and the preferences, so bind to the domain
// directly instead of importing an extension-specific gettext.
const _ = s => Gettext.dgettext('weatherpanel', s);

// Format numbers the way the user's locale does (e.g. 11,3 in Danish).
function formatNumber(value, decimals) {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/* ---------------------------
 * Temperature
 * -------------------------- */

export function formatTemperature(value, unit = 'celsius', decimals = 1) {
    if (value === null || value === undefined)
        return '–';

    const v = Number(value);
    if (Number.isNaN(v))
        return '–';

    let result;

    switch (unit) {
        case 'fahrenheit':
            result = (v * 9/5) + 32;
            return `${formatNumber(result, decimals)}°F`;

        case 'kelvin':
            result = v + 273.15;
            return `${formatNumber(result, decimals)} K`;

        case 'celsius':
        default:
            return `${formatNumber(v, decimals)}°C`;
    }
}

/* ---------------------------
 * Wind
 * -------------------------- */

// Compass points, translated when displayed.
const N_ = s => s;
const WIND_DIRECTIONS = [
    N_('N'), N_('NE'), N_('E'), N_('SE'),
    N_('S'), N_('SW'), N_('W'), N_('NW'),
];

// Upper bounds in m/s of Beaufort forces 0-11; anything above is 12.
const BEAUFORT_LIMITS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];

function toBeaufort(ms) {
    const force = BEAUFORT_LIMITS.findIndex(limit => ms < limit);

    return force === -1 ? 12 : force;
}

export function formatWind(speed, directionDeg, unit = 'ms', decimals = 1) {
    if (speed === null || speed === undefined)
        return '–';

    const s = Number(speed);
    if (Number.isNaN(s))
        return '–';

    let converted = s;
    let unitLabel = unit;

    switch (unit) {
        case 'kmh':
            converted = s * 3.6;
            unitLabel = 'km/h';
            break;

        case 'mph':
            converted = s * 2.23693629;
            unitLabel = 'mph';
            break;

        case 'knots':
            converted = s * 1.94384449;
            unitLabel = _('knots');
            break;

        case 'beaufort':
            converted = toBeaufort(s);
            unitLabel = _('Bft');
            decimals = 0;
            break;

        case 'ms':
        default:
            converted = s;
            unitLabel = 'm/s';
            break;
    }

    const dir =
        directionDeg === null || directionDeg === undefined
            ? ''
            : _(WIND_DIRECTIONS[Math.round(directionDeg / 45) % 8]);

    const speedStr = `${formatNumber(converted, decimals)} ${unitLabel}`;

    return dir ? `${dir} ${speedStr}` : speedStr;
}

/* ---------------------------
 * Pressure
 * -------------------------- */

export function formatPressure(hPa, unit = 'hpa', decimals = 1) {
    if (hPa === null || hPa === undefined)
        return '–';

    const p = Number(hPa);
    if (Number.isNaN(p))
        return '–';

    let value = p;
    let label = 'hPa';

    switch (unit) {
        case 'bar':
            value = p / 1000;
            label = 'bar';
            break;

        case 'inhg':
            value = p / 33.8639;
            label = 'inHg';
            break;

        case 'mmhg':
            value = p * 0.750061683;
            label = 'mmHg';
            break;

        case 'kpa':
            value = p / 10;
            label = 'kPa';
            break;
            
        case 'hpa':
        default:
            value = p;
            label = 'hPa';
            break;
    }

    return `${formatNumber(value, decimals)} ${label}`;
}

/* ---------------------------
 * Time formatting
 * -------------------------- */

// Follow the clock format chosen in GNOME Settings rather than the
// locale, so e.g. an English system with a 24-hour clock gets 14:00.
let interfaceSettings = null;

function use12HourClock() {
    interfaceSettings ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

    return interfaceSettings.get_string('clock-format') === '12h';
}

export function formatTime(timestamp, locale = null) {
    if (!timestamp)
        return '–';

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime()))
        return '–';

    let loc = locale || GLib.get_language_names()[0] || 'en';

    loc = loc.replace(/\.UTF-8$/i, '');

    loc = loc.replace('_', '-');

    const options = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: use12HourClock(),
    };

    try {
        return date.toLocaleTimeString(loc, options);
    } catch (e) {
        return date.toLocaleTimeString('en-US', options);
    }
}

/* ---------------------------
 * General helpers
 * -------------------------- */

export function capitalize(str) {
    if (!str || typeof str !== 'string')
        return '';

    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function safeText(value, fallback = '–') {
    if (value === null || value === undefined)
        return fallback;

    const s = String(value).trim();
    return s.length ? s : fallback;
}


/* ---------------------------
 * Percent / precipitation / days
 * -------------------------- */

export function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value)))
        return '–';

    return `${Math.round(Number(value))} %`;
}

export function formatPrecip(mm, unit = 'mm') {
    if (mm === null || mm === undefined || Number.isNaN(Number(mm)))
        return '–';

    if (unit === 'in')
        return `${formatNumber(Number(mm) / 25.4, 2)} in`;

    return `${formatNumber(Number(mm), 1)} mm`;
}

export function formatWeekday(ms) {
    return capitalize(new Date(ms).toLocaleDateString(undefined, { weekday: 'long' }));
}
