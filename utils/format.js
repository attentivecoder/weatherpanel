import GLib from 'gi://GLib';

/**
 * Pure formatting utilities for weather data.
 * No side effects. No GNOME UI. No network logic.
 */

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
            return `${result.toFixed(decimals)}°F`;

        case 'kelvin':
            result = v + 273.15;
            return `${result.toFixed(decimals)} K`;

        case 'celsius':
        default:
            return `${v.toFixed(decimals)}°C`;
    }
}

/* ---------------------------
 * Wind
 * -------------------------- */

const WIND_DIRECTIONS = [
    'N', 'NE', 'E', 'SE',
    'S', 'SW', 'W', 'NW'
];

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
            unitLabel = 'knots';
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
            : WIND_DIRECTIONS[Math.round(directionDeg / 45) % 8];

    const speedStr = `${converted.toFixed(decimals)} ${unitLabel}`;

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

        case 'hpa':
        default:
            value = p;
            label = 'hPa';
            break;
    }

    return `${value.toFixed(decimals)} ${label}`;
}

/* ---------------------------
 * Time formatting
 * -------------------------- */

export function formatTime(timestamp, locale = null) {
    if (!timestamp)
        return '–';

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime()))
        return '–';

    // GNOME-safe locale fallback
    let loc = locale || GLib.get_language_names()[0] || 'en';

    // ❗ Strip encoding suffixes like ".UTF-8"
    loc = loc.replace(/\.UTF-8$/i, '');

    // ❗ Replace underscores with hyphens (required by ECMA-402)
    loc = loc.replace('_', '-');

    try {
        return date.toLocaleTimeString(loc, {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        // Final fallback
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
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

