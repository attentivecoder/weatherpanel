import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Forecast, mediaIcon, uvLevelLabel } from './Forecast.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    formatTemperature,
    formatWind,
    formatPressure,
    formatPercent,
    formatTime,
} from '../utils/format.js';
import { getUnits } from '../utils/units.js';

import { GeolocationService } from '../services/geolocation.js';
import { boxOrientation } from '../utils/compat.js';

export default class PanelButton {
    constructor({ settings, provider, extension }) {
        this._settings = settings;
        this._provider = provider;
        this._extension = extension;

        this._lastData = null;
        this._timestampTimer = null;
        this._isRefreshing = false;

        this._geolocation = new GeolocationService(this._settings);
        
        this._networkMonitor = Gio.NetworkMonitor.get_default();
        this._networkSignalId = null;

        this.actor = new St.Button({
            style_class: 'panel-button weatherpanel-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._buildPanel();
        this._buildMenu();
        this._bindSignals();

        this.actor.connect('button-press-event', (actor, event) => {
            const button = event.get_button();

            if (button === Clutter.BUTTON_PRIMARY) {
                this.menu.toggle();
                return Clutter.EVENT_STOP;
            }

            if (button === Clutter.BUTTON_SECONDARY) {
                this._openPrefs();
                return Clutter.EVENT_STOP;
            }

            if (button === Clutter.BUTTON_MIDDLE) {
                this._openWebsite();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    /* =========================================================
       PROVIDER
       ========================================================= */

    setProvider(provider) {
        this._disconnectProviderSignals();

        this._provider = provider;

        if (this._providerRow)
            this._providerRow.label = _('Weather API: %s').format(provider.getName());

        this._connectProviderSignals();

        // The provider may have fetched while the panel listened to
        // another one (e.g. the fallback), so show its data right away.
        const data = provider.getLastData();

        if (data)
            this._onWeatherUpdated(data);
        else
            this._updateUI(this._lastData);
    }

    _onWeatherUpdated(data) {
        data.timestamp = Date.now();

        if (data.current)
            data.current.time = new Date().toISOString();

        this._lastData = data;

        this._updateUI(data);
        this._updateStatusLabel();
    }

    _connectProviderSignals() {
        const networkMonitor = Gio.NetworkMonitor.get_default();

        this._provider.connectObject(
            'weather-updated',
            (_p, data) => this._onWeatherUpdated(data),
            this
        );

        this._provider.connectObject(
            'forecast-updated',
            (_p, data) => this._onWeatherUpdated(data),
            this
        );

        this._provider.connectObject(
            'error',
            (_p, msg) => {
                if (!this._hasCity()) {
                    this._label.text = _('No location');
                    this._icon.icon_name = 'weather-severe-alert-symbolic';
                    return;
                }

                if (!networkMonitor.network_available) {
                    this._label.text = _('Offline');
                    this._icon.icon_name = 'network-offline-symbolic';
                    this._renderOfflineState();
                    return;
                }

                this._label.text = _('Error');
                console.debug(`WeatherPanel: ${msg}`);
            },
            this
        );
    }

    _disconnectProviderSignals() {
        this._provider.disconnectObject(this);
    }

    /* =========================================================
       PANEL
       ========================================================= */

    _buildPanel() {
        this._icon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'system-status-icon weatherpanel-icon',
            reactive: false,
        });

        this._label = new St.Label({
            text: _('Loading'),
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        this._iconBox = new St.BoxLayout({
            reactive: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._iconBox.add_child(this._icon);

        box.add_child(this._iconBox);
        box.add_child(this._label);

        this.actor.set_child(box);

        if (!this._hasCity()) {
            this._label.text = _('No location');

            this._icon.icon_name =
                'weather-severe-alert-symbolic';
        }
    }

    /* =========================================================
       MENU
       ========================================================= */

    _buildMenu() {
        if (this.menu) {
            this._disconnectMenuSignals();
            Main.panel.menuManager.removeMenu(this.menu);
            this.menu.destroy();
            this.menu = null;
        }

        this.menu = new PopupMenu.PopupMenu(
            this.actor,
            0.5,
            St.Side.TOP
        );

        this.menu.actor.add_style_class_name(
            'weatherpanel-menu'
        );

        this.menu.actor.hide();

        Main.uiGroup.add_child(this.menu.actor);
        Main.panel.menuManager.addMenu(this.menu);
        
        this._connectMenuSignals();

        this._root = new St.BoxLayout({
            ...boxOrientation(true),
            style_class: 'weatherpanel-menu-root',
        });

        const rootItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        rootItem.style_class = 'weatherpanel-root-item';

        rootItem.add_child(this._root);

        this.menu.addMenuItem(rootItem);

        this._cityItem = new St.BoxLayout({
            ...boxOrientation(true),
            style_class: 'weatherpanel-city-box',
        });

        this._root.add_child(this._cityItem);

        this._currentItem = new St.BoxLayout({
            ...boxOrientation(true),
            style_class: 'weatherpanel-current-box',
        });

        this._root.add_child(this._currentItem);

        this._forecastSection = new St.BoxLayout({
            ...boxOrientation(true),
            style_class: 'weatherpanel-forecast-root',
        });

        this._root.add_child(this._forecastSection);

        this._buildButtons();

        this._renderCityHeader();
    }
    
    _connectMenuSignals() {
        this._menuOpenSignalId = this.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                if (isOpen)
                    this.actor.add_style_pseudo_class('active');
                else
                    this.actor.remove_style_pseudo_class('active');
            }
        );
    }
    
    _disconnectMenuSignals() {
        if (this.menu && this._menuOpenSignalId) {
            this.menu.disconnect(this._menuOpenSignalId);
        }

        this._menuOpenSignalId = null;
    }

    /* =========================================================
       BUTTONS
       ========================================================= */

    _buildButtons() {
        this._buttonBox = new St.BoxLayout({
            ...boxOrientation(false),
            x_expand: true,
            style_class: 'weatherpanel-button-box',
        });

        this._buttonBox.set_x_align(
            Clutter.ActorAlign.CENTER
        );

        this._locationBtn = this._makeStButton(
            'find-location-symbolic',
            _('Locations'),
            async () => {
                const networkMonitor = Gio.NetworkMonitor.get_default();

                if (!networkMonitor.network_available) {
                    Main.notify(_('Offline — cannot determine your location'));
                    return;
                }

                try {
                    const loc = await this._geolocation.getCurrentLocation();

                    if (!loc) {
                        Main.notify(_('Could not determine your location'));
                        return;
                    }

                    const city = await this._geolocation.reverseGeocode(loc);

                    if (!city || !city.label) {
                        Main.notify(_('Could not determine your location'));
                        return;
                    }

                    let cities = [];
                    const raw = this._settings.get_string('city');

                    if (raw) {
                        try {
                            cities = JSON.parse(raw);
                        } catch (_) {
                            cities = [];
                        }
                    }

                    const existingIndex = cities.findIndex(c =>
                        Math.abs(Number(c.lat) - Number(city.lat)) < 0.01 &&
                        Math.abs(Number(c.lon) - Number(city.lon)) < 0.01
                    );

                    if (existingIndex !== -1) {
                        this._settings.set_int('actual-city', existingIndex);

                        Main.notify(_('Location already exists — selected'));

                        if (this._hasCity())
                            this._provider.refresh(true).catch(logError);

                        return;
                    }

                    cities.push(city);

                    this._settings.set_string('city', JSON.stringify(cities));
                    this._settings.set_int('actual-city', cities.length - 1);

                    Main.notify(_('Location updated'));

                    if (this._hasCity())
                        this._provider.refresh(true).catch(logError);

                } catch (e) {
                    logError(e);
                    Main.notify(_('Could not determine your location'));
                }
            }
        );

        this._refreshBtn = this._makeStButton(
            'view-refresh-symbolic',
            _('Refresh'),
            async () => {
                const networkMonitor = Gio.NetworkMonitor.get_default();

                if (!networkMonitor.network_available) {
                    Main.notify(_('Offline — cannot refresh weather'));
                    return;
                }

                Main.notify(_('Refreshing weather…'));

                try {
                    const ok = await this._provider.refresh(true);

                    Main.notify(
                        ok
                            ? _('Weather refreshed')
                            : _('Refresh failed')
                    );
                } catch (e) {
                    logError(e);
                    Main.notify(_('Refresh failed'));
                }
            }
        );

        this._prefsBtn = this._makeStButton(
            'preferences-system-symbolic',
            _('Settings'),
            () => this._openPrefs()
        );

        this._buttonBox.add_child(this._locationBtn);
        this._buttonBox.add_child(this._refreshBtn);
        this._buttonBox.add_child(this._prefsBtn);

        this._root.add_child(this._buttonBox);

        this._bottomBox = new St.Widget({
            x_expand: true,
            layout_manager: new Clutter.BinLayout(),
            style_class: 'weatherpanel-bottom-row',
        });

        const providerName = this._provider.getName();

        this._providerRow = new St.Button({
            style_class: 'weatherpanel-provider-row',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            label: _('Weather API: %s').format(providerName),
        });

        this._providerRow.set_x_align(
            Clutter.ActorAlign.START
        );

        this._providerRow.connect('clicked', () => {
            this.menu.close();
            this._openWebsite();
        });

        this._statusLabel = new St.Label({
            text: '',
            style_class: 'weatherpanel-status-label',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._bottomBox.add_child(this._providerRow);
        this._bottomBox.add_child(this._statusLabel);

        this._root.add_child(this._bottomBox);
    }

    _makeStButton(iconName, accessibleName, onActivate) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: true,
            can_focus: true,
            hover: true,
            style_class: 'weatherpanel-button-action',
        });

        const icon = new St.Icon({
            icon_name: iconName,
            style_class: 'weatherpanel-button-action-icon',
        });

        item.add_child(icon);

        item.accessible_name = accessibleName;

        item.connect('activate', async () => {
            this.menu.close();
            await onActivate();
        });

        return item;
    }

    /* =========================================================
       SIGNALS
       ========================================================= */

    _bindSignals() {
        this._settings.connectObject(
            'changed',
            (_settings, key) => {
                if (
                    key === 'unit' ||
                    key === 'wind-speed-unit' ||
                    key === 'pressure-unit' ||
                    key === 'precipitation-unit' ||
                    key === 'decimal-places'
                ) {
                    this._updateUI(this._lastData);
                    return;
                }

                if (key === 'disable-forecast') {
                    this._renderForecast(this._lastData);
                    return;
                }

                if (key === 'city' || key === 'actual-city') {
                    this._renderCityHeader();
                    this._updateUI(this._lastData);
                    this._provider.refresh(true).catch(logError);
                }
            },
            this
        );

        this._connectProviderSignals();
        this._connectNetworkSignals();
        this._startTimestampTimer();
    }
    
    _connectNetworkSignals() {
        if (this._networkSignalId)
            return;

        this._networkSignalId = this._networkMonitor.connect(
            'network-changed',
            async (_monitor, available) => {
                try {
                    this._updateStatusLabel();

                    if (!this._hasCity())
                        return;

                    if (!available) {
                        this._label.text = _('Offline');
                        this._icon.icon_name = 'network-offline-symbolic';
                        this._renderOfflineState();
                        return;
                    }

                    if (this._isRefreshing)
                        return;

                    this._isRefreshing = true;

                    try {
                        await this._provider.refresh(true);
                    } catch (e) {
                        logError(e);
                    } finally {
                        this._isRefreshing = false;
                    }

                } catch (e) {
                    logError(e);
                }
            }
        );
    }
    
    _disconnectNetworkSignals() {
        if (this._networkMonitor && this._networkSignalId) {
            this._networkMonitor.disconnect(this._networkSignalId);
        }
        
        this._networkSignalId = null;
    }

    /* =========================================================
       UI
       ========================================================= */

    _updateUI(data) {
        if (!data || !data.current)
            return;

        if (data.current.icon)
            this._icon.icon_name = data.current.icon;

        const units = getUnits(this._settings);

        this._label.text = formatTemperature(data.current.temp, units.temp, units.decimals);

        this._renderCityHeader();
        this._renderCurrent(data.current);
        this._renderForecast(data);

        this._updateStatusLabel();
    }

    _renderCurrent(current) {
        if (!current || !this._currentItem)
            return;

        this._currentItem.destroy_all_children();

        const units = getUnits(this._settings);

        /* ---- hero: icon, temperature, summary, sun ---- */

        const hero = new St.BoxLayout({
            x_expand: true,
            style_class: 'weatherpanel-hero',
        });

        hero.add_child(new St.Icon({
            icon_name: current.icon ?? 'weather-clear-symbolic',
            style_class: 'weatherpanel-hero-icon',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        const text = new St.BoxLayout({
            ...boxOrientation(true),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        text.add_child(new St.Label({
            text: formatTemperature(current.temp, units.temp, units.decimals),
            style_class: 'weatherpanel-hero-temp',
        }));

        text.add_child(new St.Label({
            text: current.summary ? _(current.summary) : '',
            style_class: 'weatherpanel-hero-summary',
        }));

        if (current.sunrise || current.sunset) {
            const sun = new St.BoxLayout({ style_class: 'weatherpanel-hero-sun' });

            for (const [time, icon] of [
                [current.sunrise, 'daytime-sunrise-symbolic'],
                [current.sunset, 'daytime-sunset-symbolic'],
            ]) {
                if (!time)
                    continue;

                sun.add_child(new St.Icon({
                    gicon: mediaIcon(this._extension.path, icon),
                    style_class: 'weatherpanel-hero-sun-icon',
                }));
                sun.add_child(new St.Label({
                    text: formatTime(time),
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }

            text.add_child(sun);
        }

        hero.add_child(text);
        this._currentItem.add_child(hero);

        /* ---- detail tiles ---- */

        const uv = current.uv === null || current.uv === undefined
            ? '–'
            : `${Math.round(current.uv)} · ${uvLevelLabel(current.uv)}`;

        const tiles = [
            [_('Feels like'), formatTemperature(current.feelsLike, units.temp, units.decimals)],
            [_('Humidity'), formatPercent(current.humidity)],
            [_('UV index'), uv],
            [_('Wind'), formatWind(current.wind?.speed, current.wind?.deg, units.wind)],
            [_('Gusts'), formatWind(current.gusts, null, units.wind)],
            [_('Pressure'), formatPressure(current.pressure, units.pressure, 0)],
        ];

        for (let i = 0; i < tiles.length; i += 3) {
            const row = new St.BoxLayout({
                x_expand: true,
                style_class: 'weatherpanel-tile-row',
            });

            for (const [caption, value] of tiles.slice(i, i + 3)) {
                const tile = new St.BoxLayout({
                    ...boxOrientation(true),
                    x_expand: true,
                    style_class: 'weatherpanel-tile',
                });

                tile.add_child(new St.Label({
                    text: caption,
                    style_class: 'weatherpanel-tile-caption',
                }));
                tile.add_child(new St.Label({
                    text: value,
                    style_class: 'weatherpanel-tile-value',
                }));

                row.add_child(tile);
            }

            this._currentItem.add_child(row);
        }

        /* ---- walk window ---- */

        const walk = this._walkBanner();

        if (walk) {
            this._currentItem.add_child(new St.Label({
                text: walk,
                style_class: 'weatherpanel-walk',
            }));
        }
    }

    _walkBanner() {
        const days = this._lastData?.forecast ?? [];
        const today = days.find(d => d.isToday);
        const tomorrow = days.find(d => !d.isToday);

        const range = ({ start, end }) => {
            const from = start <= Date.now() ? _('now') : formatTime(start);

            return `${from}–${formatTime(end)}`;
        };

        if (today?.daylightLeft) {
            return today.walk
                ? _('Best time for a walk today: %s').format(range(today.walk))
                : _('No dry spell left in today’s daylight');
        }

        if (tomorrow?.walk)
            return _('Best time for a walk tomorrow: %s').format(range(tomorrow.walk));

        if (tomorrow)
            return _('No dry spell expected tomorrow');

        return null;
    }

    _renderOfflineState() {
        if (!this._currentItem)
            return;

        this._currentItem.destroy_all_children();

        if (this._lastData?.current) {
            this._renderCurrent(this._lastData.current);

            this._currentItem.add_child(new St.Label({
                text: _('Showing cached weather data'),
                style_class: 'weatherpanel-offline-label',
            }));
        } else {
            this._currentItem.add_child(new St.Label({
                text: _('Offline'),
            }));
        }

        this._updateStatusLabel();
    }

    /* =========================================================
       FORECAST
       ========================================================= */

    _renderForecast(data) {
        if (!this._forecastSection)
            return;

        const disabled = this._settings.get_boolean('disable-forecast');

        if (!this._forecastWidget) {
            this._forecastWidget = new Forecast(this._extension.path);
            this._forecastSection.add_child(this._forecastWidget.actor);

            this._forecastDisabledLabel = new St.Label({
                text: _('Forecast disabled'),
                style_class: 'weatherpanel-forecast-loading',
            });
            this._forecastSection.add_child(this._forecastDisabledLabel);
        }

        this._forecastWidget.actor.visible = !disabled;
        this._forecastDisabledLabel.visible = disabled;

        if (!disabled)
            this._forecastWidget.setData(data, this._settings);
    }

    _renderCityHeader() {
        const city = this._getActiveCity();

        this._cityItem.destroy_all_children();

        let text;

        if (!city) {
            text = _('No location selected');
        } else {
            const parts = [];

            if (city.label)
                parts.push(city.label);

            if (city.region || city.state)
                parts.push(city.region ?? city.state);

            if (city.country)
                parts.push(city.country);

            text = parts.join(', ');
        }

        this._cityItem.add_child(
            new St.Label({
                text,
                style_class: 'weatherpanel-city-header',
            })
        );
    }

    /* =========================================================
       STATUS
       ========================================================= */

    _startTimestampTimer() {
        if (this._timestampTimer)
            GLib.source_remove(this._timestampTimer);

        this._timestampTimer =
            GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                60,
                () => {
                    this._updateStatusLabel();

                    return GLib.SOURCE_CONTINUE;
                }
            );
    }

    _updateStatusLabel() {
        if (!this._statusLabel)
            return;

        const time = this._lastData?.current?.time;

        if (!time) {
            this._statusLabel.text = '';
            return;
        }

        const relative =
            this._formatUpdateTime(time);

        const networkMonitor =
            Gio.NetworkMonitor.get_default();

        if (networkMonitor.network_available)
            this._statusLabel.text =
                _('Updated %s').format(relative);
        else
            this._statusLabel.text =
                _('Offline — last updated %s')
                    .format(relative);
    }

    _formatUpdateTime(isoString) {
        if (!isoString)
            return '';

        const date = new Date(isoString);

        const diffMs =
            Date.now() - date.getTime();

        const diffMin =
            Math.floor(diffMs / 60000);

        if (diffMin < 1)
            return _('just now');

        if (diffMin < 60)
            return _('%d min ago')
                .format(diffMin);

        return formatTime(date.getTime());
    }

    /* =========================================================
       HELPERS
       ========================================================= */

    _getActiveCity() {
        const raw =
            this._settings.get_string('city');

        if (!raw)
            return null;

        try {
            const cities = JSON.parse(raw);

            const index =
                this._settings.get_int(
                    'actual-city'
                );

            return cities?.[index] ?? null;
        } catch (_) {
            return null;
        }
    }

    _hasCity() {
        return !!this._getActiveCity();
    }

    _openPrefs() {
        try {
            this.menu.close();
            this._extension.openPreferences();
        } catch (e) {
            logError(e);
        }
    }

    _openWebsite() {
        try {
            const url =
                this._provider.getWebsite();

            const timestamp =
                global.get_current_time();

            const workspace =
                global.workspace_manager
                    .get_active_workspace();

            const context =
                global.create_app_launch_context(
                    timestamp,
                    workspace
                );

            Gio.app_info_launch_default_for_uri(
                url,
                context
            );
        } catch (e) {
            logError(e);
        }
    }

    start() {
        if (this._hasCity())
            this._provider.refresh(true).catch(logError);
            
        this._startTimestampTimer();
    }

    stop() {
        if (!this.actor)
            return;
            
        if (this._forecastWidget) {
            this._forecastWidget.destroy();
            this._forecastWidget = null;
        }
            
        this._settings.disconnectObject(this);
        this._disconnectProviderSignals();
        this._disconnectNetworkSignals();
        this._disconnectMenuSignals();
        
        this._geolocation.destroy();

        if (this._timestampTimer) {
            GLib.source_remove(this._timestampTimer);

            this._timestampTimer = null;
        }

        if (this.menu) {
            Main.panel.menuManager.removeMenu(this.menu);

            this.menu.destroy();
            this.menu = null;
        }
        
         this.actor.destroy();
         this.actor = null;
    }

    destroy() {
        this.stop();       
    }
}
