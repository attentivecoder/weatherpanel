import GLib from 'gi://GLib';

/* ---------------------------------------------------------
 * Unit settings
 *
 * Each unit key is an enum in the schema; the order of the
 * nicks below must match the enum values. A key the user
 * never set ("Automatic") follows the region of the system
 * locale, so e.g. US users start with °F, mph, inHg and inches.
 * --------------------------------------------------------- */

export const UNIT_KEYS = {
    'unit': ['celsius', 'fahrenheit', 'kelvin'],
    'wind-speed-unit': ['kmh', 'mph', 'ms', 'knots', 'beaufort'],
    'pressure-unit': ['hpa', 'inhg', 'bar', 'mmhg', 'kpa'],
    'precipitation-unit': ['mm', 'in'],
};

// The US and places that follow its customary units.
const US_CUSTOMARY = ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'LR', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'];

// Wind in m/s is the norm in the Nordics and much of Eastern Europe.
const WIND_MS = ['DK', 'NO', 'SE', 'FI', 'IS', 'FO', 'GL', 'EE', 'LV', 'LT', 'PL', 'CZ', 'SK', 'RU', 'BY', 'UA', 'KZ'];

// Pressure in mmHg is common in Russian-language forecasts.
const PRESSURE_MMHG = ['RU', 'BY', 'KZ'];

export function localeRegion() {
    const locale =
        GLib.getenv('LC_ALL') ||
        GLib.getenv('LC_MEASUREMENT') ||
        GLib.getenv('LANG') ||
        '';

    return locale.match(/^[a-z]{2,3}_([A-Z]{2})/)?.[1] ?? null;
}

export function regionalDefault(key, region = localeRegion()) {
    const us = US_CUSTOMARY.includes(region);

    switch (key) {
        case 'unit':
            return us ? 'fahrenheit' : 'celsius';

        case 'wind-speed-unit':
            if (us || region === 'GB')
                return 'mph';
            return WIND_MS.includes(region) ? 'ms' : 'kmh';

        case 'pressure-unit':
            if (us)
                return 'inhg';
            if (region === 'CA')
                return 'kpa';
            return PRESSURE_MMHG.includes(region) ? 'mmhg' : 'hpa';

        case 'precipitation-unit':
            return us ? 'in' : 'mm';
    }

    return UNIT_KEYS[key][0];
}

export function isAutomatic(settings, key) {
    return settings.get_user_value(key) === null;
}

export function getUnit(settings, key) {
    if (isAutomatic(settings, key))
        return regionalDefault(key);

    return UNIT_KEYS[key][settings.get_enum(key)] ?? UNIT_KEYS[key][0];
}

export function getUnits(settings) {
    return {
        temp: getUnit(settings, 'unit'),
        wind: getUnit(settings, 'wind-speed-unit'),
        pressure: getUnit(settings, 'pressure-unit'),
        precip: getUnit(settings, 'precipitation-unit'),
        decimals: settings.get_int('decimal-places'),
    };
}
