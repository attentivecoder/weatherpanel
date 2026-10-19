import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    formatTemperature,
    formatWind,
    formatTime,
    formatPercent,
    formatPrecip,
    formatWeekday,
} from '../utils/format.js';
import { getUnits } from '../utils/units.js';
import { boxOrientation } from '../utils/compat.js';
import { uvLevel } from '../utils/insights.js';

const HOURLY_COUNT = 8;

export function uvLevelLabel(uv) {
    return {
        'low': _('Low'),
        'moderate': _('Moderate'),
        'high': _('High'),
        'very-high': _('Very high'),
        'extreme': _('Extreme'),
    }[uvLevel(uv)] ?? '';
}

export function mediaIcon(extensionPath, name) {
    return Gio.FileIcon.new(
        Gio.File.new_for_path(`${extensionPath}/media/status/${name}.svg`));
}

function label(text, styleClass, props = {}) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...props,
    });
}

export class Forecast {
    constructor(extensionPath) {
        this._path = extensionPath;
        this._settings = null;
        this._data = null;
        this._expanded = new Set();

        this.actor = new St.BoxLayout({
            ...boxOrientation(true),
            x_expand: true,
            style_class: 'weatherpanel-forecast',
        });

        this._hourlyHeader = label(_('Next hours'), 'weatherpanel-section-header');
        this._hourlyRow = new St.BoxLayout({
            x_expand: true,
            style_class: 'weatherpanel-hourly-row',
        });

        this._daysHeader = label(_('Next days'), 'weatherpanel-section-header');
        this._daysBox = new St.BoxLayout({
            ...boxOrientation(true),
            x_expand: true,
            style_class: 'weatherpanel-days',
        });

        this._scroll = new St.ScrollView({
            x_expand: true,
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style_class: 'weatherpanel-days-scroll',
        });
        this._scroll.add_child(this._daysBox);

        this.actor.add_child(this._hourlyHeader);
        this.actor.add_child(this._hourlyRow);
        this.actor.add_child(this._daysHeader);
        this.actor.add_child(this._scroll);
    }

    /* ---------------- PUBLIC API ---------------- */

    // data: { hourly, forecast } as produced by BaseProvider
    setData(data, settings) {
        this._data = data;
        this._settings = settings;

        this._render();
    }

    /* ---------------- RENDER ---------------- */

    _render() {
        if (!this.actor)
            return;

        this._hourlyRow.destroy_all_children();
        this._daysBox.destroy_all_children();

        const hourly = this._data?.hourly?.slice(0, HOURLY_COUNT) ?? [];
        const days = this._data?.forecast ?? [];

        this._hourlyHeader.visible = hourly.length > 0;
        this._hourlyRow.visible = hourly.length > 0;

        if (!hourly.length && !days.length) {
            this._daysBox.add_child(label(_('No forecast available'), 'weatherpanel-forecast-loading'));
            return;
        }

        const units = getUnits(this._settings);

        for (const step of hourly)
            this._hourlyRow.add_child(this._buildHour(step, units));

        for (const day of days) {
            this._daysBox.add_child(this._buildDayRow(day, units));

            if (this._expanded.has(day.key))
                this._daysBox.add_child(this._buildDayDetails(day, units));
        }
    }

    _buildHour(step, units) {
        const box = new St.BoxLayout({
            ...boxOrientation(true),
            x_expand: true,
            style_class: 'weatherpanel-hour',
        });

        box.add_child(label(formatTime(step.time), 'weatherpanel-hour-time'));
        box.add_child(new St.Icon({
            icon_name: step.icon,
            style_class: 'weatherpanel-hour-icon',
            x_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(label(formatTemperature(step.temp, units.temp, 0), 'weatherpanel-hour-temp'));
        box.add_child(label(formatPercent(step.precipProb), 'weatherpanel-hour-rain'));

        return box;
    }

    _dayName(day) {
        if (day.isToday)
            return _('Today');

        if (day.date - this._data.forecast[0].date < 36 * 3600 * 1000 &&
            this._data.forecast[0].isToday)
            return _('Tomorrow');

        return formatWeekday(day.date);
    }

    _buildDayRow(day, units) {
        const expanded = this._expanded.has(day.key);

        const button = new St.Button({
            x_expand: true,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'weatherpanel-day' + (expanded ? ' expanded' : ''),
        });

        const row = new St.BoxLayout({ x_expand: true, style_class: 'weatherpanel-day-row' });

        row.add_child(label(this._dayName(day), 'weatherpanel-day-name'));
        row.add_child(new St.Icon({
            icon_name: day.icon,
            style_class: 'weatherpanel-day-icon',
        }));

        const summary = label(_(day.summary), 'weatherpanel-day-summary', { x_expand: true });
        summary.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        row.add_child(summary);

        row.add_child(new St.Icon({
            icon_name: 'weather-showers-scattered-symbolic',
            style_class: 'weatherpanel-day-rain-icon',
        }));
        row.add_child(label(formatPercent(day.precipProb), 'weatherpanel-day-rain'));

        row.add_child(label(formatTemperature(day.tempMin, units.temp, 0), 'weatherpanel-day-min'));
        row.add_child(label(formatTemperature(day.tempMax, units.temp, 0), 'weatherpanel-day-max'));

        row.add_child(new St.Icon({
            icon_name: expanded ? 'pan-down-symbolic' : 'pan-end-symbolic',
            style_class: 'weatherpanel-day-chevron',
        }));

        button.set_child(row);

        button.connect('clicked', () => {
            if (this._expanded.has(day.key))
                this._expanded.delete(day.key);
            else
                this._expanded.add(day.key);

            this._render();
        });

        return button;
    }

    _chip(text, icon = null) {
        const chip = new St.BoxLayout({ style_class: 'weatherpanel-chip' });

        if (icon) {
            chip.add_child(new St.Icon({
                ...(typeof icon === 'string' ? { icon_name: icon } : { gicon: icon }),
                style_class: 'weatherpanel-chip-icon',
            }));
        }

        chip.add_child(label(text, 'weatherpanel-chip-label'));

        return chip;
    }

    _buildDayDetails(day, units) {
        const box = new St.BoxLayout({
            ...boxOrientation(true),
            x_expand: true,
            style_class: 'weatherpanel-day-details',
        });

        const facts = new St.BoxLayout({ style_class: 'weatherpanel-chip-row' });

        facts.add_child(this._chip(walkText(day)));

        if (day.uvMax !== null)
            facts.add_child(this._chip(_('UV %d · %s').format(Math.round(day.uvMax), uvLevelLabel(day.uvMax))));

        box.add_child(facts);

        const more = new St.BoxLayout({ style_class: 'weatherpanel-chip-row' });

        more.add_child(this._chip(formatPrecip(day.precip, units.precip), 'weather-showers-symbolic'));

        if (day.gustsMax !== null)
            more.add_child(this._chip(_('Gusts %s').format(formatWind(day.gustsMax, null, units.wind, 0))));

        if (day.sunrise)
            more.add_child(this._chip(formatTime(day.sunrise), mediaIcon(this._path, 'daytime-sunrise-symbolic')));

        if (day.sunset)
            more.add_child(this._chip(formatTime(day.sunset), mediaIcon(this._path, 'daytime-sunset-symbolic')));

        box.add_child(more);

        const cards = new St.BoxLayout({ x_expand: true, style_class: 'weatherpanel-hourly-row' });

        for (const step of day.entries.slice(0, HOURLY_COUNT))
            cards.add_child(this._buildHour(step, units));

        box.add_child(cards);

        return box;
    }

    /* ---------------- CLEAN ---------------- */

    destroy() {
        this._data = null;
        this._settings = null;

        this.actor?.destroy();
        this.actor = null;
    }
}

/* ---------------------------
 * Walk window text, shared with the panel menu
 * -------------------------- */

export function walkText(day) {
    if (!day.daylightLeft)
        return _('No daylight left');

    if (!day.walk)
        return _('No dry spell in daylight');

    const range = `${formatTime(day.walk.start)}–${formatTime(day.walk.end)}`;

    return _('Walk: dry %s').format(range);
}
