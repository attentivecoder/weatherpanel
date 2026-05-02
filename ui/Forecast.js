import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {
    formatTemperature,
    formatWind,
    formatPressure
} from '../utils/format.js';

export class Forecast {
    constructor() {
        this.actor = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            reactive: true,
            can_focus: true,
            style_class: 'weatherpanel-forecast-root',
        });

        this._settings = null;
        this._data = null;
        this._signals = [];

        this._buildUI();
    }

    /* ---------------- PUBLIC API ---------------- */

    setData(data, settings = null) {
        this._data = data;
        this._settings = settings;

        this._connectSettings();
        this._render();
    }

    setLoading() {
        this._clear();

        this._container.add_child(new St.Label({
            text: 'Loading forecast...',
            style_class: 'weatherpanel-forecast-loading',
        }));
    }

    /* ---------------- SETTINGS REACTIVE ---------------- */

    _connectSettings() {
        if (!this._settings?._settings)
            return;

        if (this._signals.length > 0)
            return;

        const settings = this._settings._settings;

        const id = settings.connect('changed', (_, key) => {
            if (
                key === 'unit' ||
                key === 'wind-speed-unit' ||
                key === 'pressure-unit'
            ) {
                this._render();
            }
        });

        this._signals.push([settings, id]);
    }

    /* ---------------- UI ---------------- */

    _buildUI() {
        this._scroll = new St.ScrollView({
            x_expand: true,
            y_expand: false,
            reactive: true,
            overlay_scrollbars: true,
            style_class: 'weatherpanel-forecast-scroll',
        });

        this._scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
        this._scroll.hscrollbar_policy = St.PolicyType.NEVER;
        this._scroll.enable_mouse_scrolling = true;

        this._container = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: false,
            reactive: false,
        });

        this._scroll.add_child(this._container);
        this.actor.add_child(this._scroll);
    }

    /* ---------------- RENDER ---------------- */

    _render() {
        if (!this._container || this._container._destroyed)
            return;

        this._clear();

        if (!this._data?.length) {
            this._showEmpty();
            return;
        }

        const tempUnit = ['celsius', 'fahrenheit', 'kelvin'][
            this._settings?.get_enum('unit') ?? 0
        ];

        const windUnit = ['kmh', 'mph', 'ms', 'knots'][
            this._settings?.get_enum('wind-speed-unit') ?? 0
        ];

        const pressureUnit = ['hpa', 'inhg', 'bar'][
            this._settings?.get_enum('pressure-unit') ?? 0
        ];

        for (const day of this._data) {
            if (!day?.entries)
                continue;

            const dayBox = new St.BoxLayout({
                vertical: true,
                style_class: 'weatherpanel-forecast-card',
                x_expand: true,
                reactive: false,
            });

            dayBox.add_child(new St.Label({
                text: day.day ?? '',
                style_class: 'weatherpanel-forecast-day-title',
            }));

           const hourScroll = new St.ScrollView({
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.NEVER,
                overlay_scrollbars: true,
                reactive: false,
                can_focus: false,
                style_class: 'weatherpanel-forecast-hour-scroll',
                x_expand: true,
                y_expand: false,
            });

            const hourRow = new St.BoxLayout({
                style_class: 'weatherpanel-forecast-hour-row',
                x_expand: true,
                y_expand: false,
            });

            hourScroll.add_child(hourRow);
            dayBox.add_child(hourScroll);

            for (const entry of day.entries) {
                const entryBox = new St.BoxLayout({
                    vertical: true,
                    style_class: 'weatherpanel-forecast-hour',
                    x_align: Clutter.ActorAlign.CENTER,
                    reactive: false,
                });

                entryBox.add_child(new St.Label({
                    text: entry.time ?? '',
                    style_class: 'weatherpanel-forecast-hour-time',
                }));

                entryBox.add_child(new St.Icon({
                    icon_name: entry.icon ?? 'weather-clear-symbolic',
                    icon_size: 28,
                }));

                entryBox.add_child(new St.Label({
                    text: formatTemperature(entry.temp, tempUnit),
                    style_class: 'weatherpanel-forecast-hour-temp',
                }));

                entryBox.add_child(new St.Label({
                    text: entry.summary ?? '',
                    style_class: 'weatherpanel-forecast-hour-summary',
                }));

                entryBox.add_child(new St.Label({
                    text: formatWind(entry.wind?.speed, entry.wind?.deg, windUnit),
                    style_class: 'weatherpanel-forecast-hour-wind',
                }));

                entryBox.add_child(new St.Label({
                    text: formatPressure(entry.pressure, pressureUnit),
                    style_class: 'weatherpanel-forecast-hour-pressure',
                }));

                hourRow.add_child(entryBox);
            }

            this._container.add_child(dayBox);
        }
    }

    /* ---------------- EMPTY ---------------- */

    _showEmpty() {
        this._container.add_child(new St.Label({
            text: 'No forecast available',
            style_class: 'weatherpanel-forecast-loading',
        }));
    }

    /* ---------------- CLEAN ---------------- */

    _clear() {
        if (!this._container || this._container._destroyed)
            return;

        this._container.destroy_all_children();
    }

    destroy() {
        for (const [obj, id] of this._signals) {
            try { obj.disconnect(id); } catch (_) {}
        }
        this._signals = [];

        this._container = null;
        this.actor.destroy();
    }
}

