/* ---------------------------------------------------------
 * Provider-neutral weather insights.
 *
 * Providers deliver "steps": forecast intervals of the form
 *   { time (ms), hours, temp, feelsLike, humidity, pressure,
 *     wind: { speed, deg }, gusts, precip, precipProb, uv,
 *     icon, summary, isDay }
 * Speeds are m/s, precipitation mm per step, pressure hPa.
 * Everything in here is plain JS so it can be tested outside
 * GNOME Shell.
 * --------------------------------------------------------- */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const RAD = Math.PI / 180;

// A step counts as "dry" for a walk below these values.
const DRY_MAX_PROBABILITY = 30;   // %
const DRY_MAX_PRECIP_PER_HOUR = 0.1; // mm
const WALK_MAX_GUSTS = 14;        // m/s (~50 km/h)

/* ---------------------------
 * Dates
 * -------------------------- */

export function localDayKey(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfLocalDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);

    return d.getTime();
}

/* ---------------------------
 * Sunrise / sunset
 * Standard solar position approximation (NOAA / Wikipedia
 * "sunrise equation"), accurate to a minute or two.
 * -------------------------- */

export function computeSunTimes(dayMs, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return null;

    const d = new Date(dayMs);
    const noonUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);

    const julianDay = noonUtc / DAY + 2440587.5;
    const n = Math.round(julianDay - 2451545.0);

    const meanNoon = n - lon / 360;
    const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
    const center =
        1.9148 * Math.sin(anomaly * RAD) +
        0.0200 * Math.sin(2 * anomaly * RAD) +
        0.0003 * Math.sin(3 * anomaly * RAD);
    const longitude = (anomaly + center + 180 + 102.9372) % 360;

    const transit = 2451545.0 + meanNoon +
        0.0053 * Math.sin(anomaly * RAD) -
        0.0069 * Math.sin(2 * longitude * RAD);

    const declination =
        Math.asin(Math.sin(longitude * RAD) * Math.sin(23.4397 * RAD));

    const cosHourAngle =
        (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(declination)) /
        (Math.cos(lat * RAD) * Math.cos(declination));

    if (cosHourAngle < -1)
        return { sunrise: null, sunset: null, polar: 'day' };

    if (cosHourAngle > 1)
        return { sunrise: null, sunset: null, polar: 'night' };

    const hourAngle = Math.acos(cosHourAngle) / RAD;
    const toMs = jd => Math.round((jd - 2440587.5) * DAY);

    return {
        sunrise: toMs(transit - hourAngle / 360),
        sunset: toMs(transit + hourAngle / 360),
        polar: null,
    };
}

/* ---------------------------
 * UV index
 * WHO categories.
 * -------------------------- */

export function uvLevel(uv) {
    if (uv === null || uv === undefined || Number.isNaN(Number(uv)))
        return null;

    const v = Math.round(Number(uv));

    if (v <= 2)
        return 'low';
    if (v <= 5)
        return 'moderate';
    if (v <= 7)
        return 'high';
    if (v <= 10)
        return 'very-high';

    return 'extreme';
}

/* ---------------------------
 * Walk window
 * -------------------------- */

function isStorm(step) {
    return step.icon === 'weather-storm-symbolic';
}

export function isDryStep(step) {
    if (!step || isStorm(step))
        return false;

    const hours = step.hours || 1;
    const precip = step.precip ?? 0;

    if (precip > DRY_MAX_PRECIP_PER_HOUR * hours)
        return false;

    if (step.precipProb !== null && step.precipProb !== undefined &&
        step.precipProb >= DRY_MAX_PROBABILITY)
        return false;

    if (step.gusts !== null && step.gusts !== undefined &&
        step.gusts >= WALK_MAX_GUSTS)
        return false;

    return true;
}

function stepAt(steps, t) {
    return steps.find(s => s.time <= t && t < s.time + (s.hours || 1) * HOUR);
}

/**
 * Longest stretch of whole hours in [from, to) without rain,
 * thunder or strong gusts. Returns { start, end } or null.
 */
export function findWalkWindow(steps, from, to) {
    if (!steps?.length || !(to > from))
        return null;

    let best = null;
    let runStart = null;

    const endRun = end => {
        if (runStart !== null && (!best || end - runStart > best.end - best.start))
            best = { start: runStart, end };

        runStart = null;
    };

    let t = Math.ceil(from / HOUR) * HOUR;

    for (; t + HOUR <= to; t += HOUR) {
        if (!isDryStep(stepAt(steps, t)))
            endRun(t);
        else if (runStart === null)
            runStart = t;
    }

    endRun(t);

    return best;
}

/* ---------------------------
 * Days
 * -------------------------- */

function max(values) {
    const v = values.filter(x => x !== null && x !== undefined);
    return v.length ? Math.max(...v) : null;
}

function min(values) {
    const v = values.filter(x => x !== null && x !== undefined);
    return v.length ? Math.min(...v) : null;
}

function sum(values) {
    const v = values.filter(x => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

// The step that best represents the day: the one covering early
// afternoon, or the closest one to it.
function representativeStep(steps, dayStart) {
    const target = dayStart + 13 * HOUR;

    return stepAt(steps, target) ??
        steps.reduce((a, b) =>
            Math.abs(b.time - target) < Math.abs(a.time - target) ? b : a);
}

// 3-hourly samples for the detail row; coarser steps are kept as is.
// Late in the day there may be no 3-hour mark left, so keep what's there.
function detailSteps(steps) {
    const samples = steps.filter(s =>
        (s.hours || 1) >= 3 || new Date(s.time).getHours() % 3 === 0);

    return samples.length ? samples : steps;
}

/**
 * Group steps into local days with daily aggregates.
 *
 * sun: optional Map dayKey -> { sunrise, sunset } from the provider;
 *      missing days are computed from lat/lon.
 */
export function buildDays(steps, { lat, lon, sun = null, now = Date.now(), maxDays = 5 } = {}) {
    if (!steps?.length)
        return [];

    const groups = new Map();

    for (const step of steps) {
        const key = localDayKey(step.time);

        if (!groups.has(key))
            groups.set(key, []);

        groups.get(key).push(step);
    }

    const todayKey = localDayKey(now);
    const days = [];

    for (const [key, daySteps] of groups) {
        if (key < todayKey)
            continue;

        const dayStart = startOfLocalDay(daySteps[0].time);
        const dayEnd = dayStart + DAY;

        const sunTimes = sun?.get(key) ?? computeSunTimes(dayStart, lat, lon);

        // Walk window: daylight (or a sensible default), not in the past.
        let from = sunTimes?.sunrise ?? dayStart + 8 * HOUR;
        let to = sunTimes?.sunset ?? dayStart + 20 * HOUR;

        if (sunTimes?.polar === 'night') {
            from = dayStart + 10 * HOUR;
            to = dayStart + 14 * HOUR;
        }

        from = Math.max(from, now);

        const upcoming = daySteps.filter(s => s.time + (s.hours || 1) * HOUR > now);
        const rep = representativeStep(key === todayKey && upcoming.length ? upcoming : daySteps, dayStart);

        days.push({
            key,
            date: dayStart,
            isToday: key === todayKey,

            icon: rep.icon,
            summary: rep.summary,

            tempMin: min(daySteps.map(s => s.temp)),
            tempMax: max(daySteps.map(s => s.temp)),

            precip: sum(daySteps.map(s => s.precip)),
            precipProb: max(daySteps.map(s => s.precipProb)),
            uvMax: max(daySteps.map(s => s.uv)),
            gustsMax: max(daySteps.map(s => s.gusts)),

            sunrise: sunTimes?.sunrise ?? null,
            sunset: sunTimes?.sunset ?? null,
            polar: sunTimes?.polar ?? null,

            walk: from < to ? findWalkWindow(daySteps, from, Math.min(to, dayEnd)) : null,
            daylightLeft: from < to,

            entries: detailSteps(key === todayKey ? upcoming : daySteps),
        });

        if (days.length >= maxDays)
            break;
    }

    return days;
}

/**
 * Upcoming hourly steps for the "next hours" strip.
 */
export function nextHours(steps, { now = Date.now(), count = 12 } = {}) {
    if (!steps?.length)
        return [];

    return steps
        .filter(s => s.time + (s.hours || 1) * HOUR > now)
        .slice(0, count);
}
