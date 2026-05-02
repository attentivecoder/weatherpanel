import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Forecast } from './Forecast.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    formatTemperature,
    formatWind,
    formatPressure,
} from '../utils/format.js';

export default class PanelButton {
    constructor({ settings, provider, extension }) {
        this._settings = settings;
        this._provider = provider;
        this._extension = extension;

        this._signals = [];
        this._lastData = null;
        this._timestampTimer = null

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

    start() {
    if (this._hasCity())
        this._provider?.refresh?.();

        this._startTimestampTimer();
    }


    stop() {
        this._disconnectSignals();

        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }

        if (this._menuManager) {
            this._menuManager.removeMenu(this.menu);
            this._menuManager = null;
        }
    }

    destroy() {
        this.stop();
        this.actor.destroy();
    }

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
            x_expand: false,
            y_expand: false,
        });

        this._iconBox = new St.BoxLayout({
            reactive: false,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false,
        });

        this._iconBox.add_child(this._icon);
        box.add_child(this._iconBox);
        box.add_child(this._label);

        this.actor.set_child(box);

        if (!this._hasCity()) {
            this._label.text = _('No location');
            this._icon.icon_name = 'weather-severe-alert-symbolic';
        }
    }

    _buildMenu() {
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }

        this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.TOP);
        this.menu.actor.hide();
        Main.uiGroup.add_child(this.menu.actor);
       
        Main.panel.menuManager.addMenu(this.menu);

        this._root = new St.BoxLayout({
            vertical: true,
            style_class: 'weatherpanel-menu-root',
        });

        const rootItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        rootItem.actor.add_child(this._root);
        this.menu.addMenuItem(rootItem);

        this._cityItem = new St.BoxLayout({
            vertical: true,
            style_class: 'weatherpanel-city-box',
        });
        this._root.add_child(this._cityItem);

        this._currentItem = new St.BoxLayout({
            vertical: true,
            style_class: 'weatherpanel-current-box',
        });
        this._root.add_child(this._currentItem);

        this._forecastSection = new St.BoxLayout({
            vertical: true,
            style_class: 'weatherpanel-forecast-root',
        });
        this._root.add_child(this._forecastSection);
        
        this._buildButtons();
        this._renderCityHeader();
    }

    _buildButtons() {
        this._buttonBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'weatherpanel-button-box',
        });

        this._buttonBox.set_x_align(Clutter.ActorAlign.CENTER);
        this._buttonBox.set_x_expand(true);

        this._locationBtn = this._makeStButton('find-location-symbolic', _('Locations'));
        this._refreshBtn  = this._makeStButton('view-refresh-symbolic', _('Refresh'));
        this._prefsBtn    = this._makeStButton('preferences-system-symbolic', _('Settings'));

        this._buttonBox.add_child(this._locationBtn);
        this._buttonBox.add_child(this._refreshBtn);
        this._buttonBox.add_child(this._prefsBtn);

        this._root.add_child(this._buttonBox);

        this._bottomBox = new St.Widget({
            x_expand: true,
            layout_manager: new Clutter.BinLayout(),
            style_class: 'weatherpanel-bottom-row',
        });

        const providerName = 'Open‑Meteo';
        this._providerRow = new St.Button({
            style_class: 'weatherpanel-provider-row',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            label: `Weather API: ${providerName}`,
        });

        this._providerRow.set_x_align(Clutter.ActorAlign.START);

        this._providerRow.connect('clicked', () => {
            this.menu.close();
            this._openWebsite();
        });

        this._statusLabel = new St.Label({
            text: '',
            style_class: 'weatherpanel-status-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._bottomBox.add_child(this._providerRow);
        this._bottomBox.add_child(this._statusLabel);

        this._root.add_child(this._bottomBox);

        this._locationBtn.connect('activate', async () => {
            this.menu.close();
            const networkMonitor = Gio.NetworkMonitor.get_default();

            if (!networkMonitor.network_available) {
                Main.notify(_('Offline — cannot determine your location'));
                return;
            }

            try {
                const loc = await this._extension.geolocation.getCurrentLocation();
                const city = await this._extension.geolocation.reverseGeocode(loc);

                if (!city || !city.name || city.name === 'Unknown location') {
                    Main.notify(_('Could not determine your location'));
                    return;
                }

                let cities = [];
                const raw = this._settings.get_string('city');

                if (raw) {
                    try { cities = JSON.parse(raw); }
                    catch (_) { cities = []; }
                }

                const existingIndex = cities.findIndex(c =>
                    Math.abs(Number(c.lat) - Number(city.lat)) < 0.01 &&
                    Math.abs(Number(c.lon) - Number(city.lon)) < 0.01
                );

                if (existingIndex !== -1) {
                    this._settings.set_int('actual-city', existingIndex);
                    Main.notify(_('Location already exists — selected'));

                    if (this._hasCity())
                        this._provider.refresh(true);

                    return;
                }

                cities.push(city);
                this._settings.set_string('city', JSON.stringify(cities));
                this._settings.set_int('actual-city', cities.length - 1);

                Main.notify(_('Location updated'));

                if (this._hasCity())
                    this._provider.refresh(true);

            } catch (e) {
                logError(e);
                Main.notify(_('Could not determine your location'));
            }
        });

        this._refreshBtn.connect('activate', async () => {
            this.menu.close();
            const networkMonitor = Gio.NetworkMonitor.get_default();

            if (!networkMonitor.network_available) {
                Main.notify(_('Offline — cannot refresh weather'));
                return;
            }

            try {
                Main.notify(_('Refreshing weather…'));
                await this._provider?.refresh?.(true);
                Main.notify(_('Weather refreshed'));
            } catch (e) {
                logError(e);
                Main.notify(_('Refresh failed'));
            }
        });

        this._prefsBtn.connect('activate', () => {
            this.menu.close();
            this._openPrefs();
        });

        if (this._hasCity())
            this._enableButton(this._refreshBtn);
        else
            this._disableButton(this._refreshBtn);
    }
     

    _makeStButton(iconName, accessibleName) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: true,
            can_focus: true,
            style_class: 'weatherpanel-button-action',
        });

        item.add_child(new St.Icon({
            icon_name: iconName,
            style_class: 'weatherpanel-button-action-icon',
        }));

        item.accessible_name = accessibleName;

        return item;
    }





    _disableButton(btn) {
        btn.reactive = false;
        btn.can_focus = false;
        btn.add_style_pseudo_class('disabled');
    }

    _enableButton(btn) {
        btn.reactive = true;
        btn.can_focus = true;
        btn.remove_style_pseudo_class('disabled');
    }

    _renderCityHeader() {
        const city = this._getActiveCity();

        this._cityItem.destroy_all_children();

        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'weatherpanel-city-box',
        });

        box.add_child(new St.Label({
            text: city ? city.name : _('No location selected'),
            style_class: 'weatherpanel-city-header',
        }));

        this._cityItem.add_child(box);
    }
    
    _startTimestampTimer() {
        if (this._timestampTimer)
            GLib.source_remove(this._timestampTimer);

        this._timestampTimer = GLib.timeout_add_seconds(
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

        const relative = this._formatUpdateTime(time);
        const networkMonitor = Gio.NetworkMonitor.get_default();

        if (networkMonitor.network_available)
            this._statusLabel.text = _('Updated %s').format(relative);
        else
            this._statusLabel.text = _('Offline — last updated %s').format(relative);
    }

    _renderOfflineState() {
        if (!this._lastData) {
            this._currentItem.destroy_all_children();
            this._currentItem.add_child(new St.Label({
                text: _('No data available'),
                style_class: 'weatherpanel-current-details',
            }));
            this._updateStatusLabel();
            return;
        }

        this._updateUI(this._lastData);
        this._updateStatusLabel();
    }

    _bindSignals() {
        const settings = this._settings._settings;
        const networkMonitor = Gio.NetworkMonitor.get_default();
        
        const menuId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen)
                this.actor.add_style_pseudo_class('active');
            else
                this.actor.remove_style_pseudo_class('active');
        });

        this._signals.push([this.menu, menuId]);


        const settingsId = settings.connect('changed', (_, key) => {
            if (
                key === 'unit' ||
                key === 'wind-speed-unit' ||
                key === 'pressure-unit'
            ) {
                this._updateUI(this._lastData);
                return;
            }

            if (key === 'disable-forecast') {
                this._renderForecast(this._lastData?.forecast);
                return;
            }

            if (key === 'city' || key === 'actual-city') {
                this._renderCityHeader();
                this._updateUI(this._lastData);
                this._provider?.refresh?.(true);
                return;
            }
        });
        this._signals.push([settings, settingsId]);

        const netId = networkMonitor.connect('network-changed', () => {
            if (networkMonitor.network_available) {
                this._enableButton(this._refreshBtn);
                this._enableButton(this._locationBtn);

                if (this._lastData)
                    this._updateUI(this._lastData);

                this._provider?.refresh?.(true);
            } else {
                this._disableButton(this._refreshBtn);
                this._disableButton(this._locationBtn);

                this._label.text = _('Offline');
                this._icon.icon_name = 'network-offline-symbolic';

                this._renderOfflineState();
            }

            this._updateStatusLabel();
        });

        this._signals.push([networkMonitor, netId]);

        if (this._provider?.connect) {
            const weatherId = this._provider.connect('weather-updated', (_p, data) => {
                const now = new Date().toISOString();

                data.timestamp = Date.now();
                if (data.current)
                    data.current.time = now;

                this._lastData = data;
                this._updateUI(data);
                this._updateStatusLabel();
            });


            const forecastId = this._provider.connect('forecast-updated', (_p, forecast) => {
                if (!this._lastData)
                    this._lastData = {};

                this._lastData.forecast = forecast;
                this._renderForecast(forecast);
                this._updateStatusLabel();
            });

            const errorId = this._provider.connect('error', (_p, msg) => {
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
                log(msg);
            });

            this._signals.push([this._provider, weatherId]);
            this._signals.push([this._provider, errorId]);
            this._signals.push([this._provider, forecastId]);
        }

        if (!networkMonitor.network_available) {
            this._disableButton(this._refreshBtn);
            this._disableButton(this._locationBtn);
        } else {
            this._enableButton(this._refreshBtn);

            if (this._hasCity())
                this._enableButton(this._locationBtn);
        }
    }

    _disconnectSignals() {
        for (const [obj, id] of this._signals) {
            try { obj.disconnect(id); } catch (_) {}
        }
        this._signals = [];
    }

    _updateUI(data) {
        if (!data || !data.current)
            return;

        if (this._icon && data.current?.icon)
            this._icon.icon_name = data.current.icon;

        const unit = ['celsius', 'fahrenheit', 'kelvin'][this._settings.get_enum('unit')];
        const temp = formatTemperature(data.current.temp, unit);
        this._label.text = temp ?? '--';

        this._renderCityHeader();
        this._renderCurrent(data.current);
        this._renderForecast(data.forecast);
        this._updateStatusLabel();
    }

    _renderCurrent(current) {
        if (!current || !this._currentItem)
            return;

        this._currentItem.destroy_all_children();

        const tempUnit = ['celsius', 'fahrenheit', 'kelvin'][
            this._settings.get_enum('unit')
        ];

        const windUnit = ['kmh', 'mph', 'ms', 'knots'][
            this._settings.get_enum('wind-speed-unit')
        ];

        const pressureUnit = ['hpa', 'inhg', 'bar'][
            this._settings.get_enum('pressure-unit')
        ];

        const root = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'weatherpanel-current-box',
        });

        const icon = new St.Icon({
            icon_name: current.icon ?? 'weather-clear-symbolic',
            style_class: 'weatherpanel-current-icon',
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        const headline = new St.Label({
            text: `${formatTemperature(current.temp, tempUnit)} — ${current.summary ?? ''}`,
            style_class: 'weatherpanel-current-headline',
        });

        const details = new St.Label({
            text:
                `Wind ${formatWind(current.wind?.speed, current.wind?.deg, windUnit)} • ` +
                `Pressure ${formatPressure(current.pressure, pressureUnit)}`,
            style_class: 'weatherpanel-current-details',
        });

        textBox.add_child(headline);
        textBox.add_child(details);

        root.add_child(icon);
        root.add_child(textBox);

        this._currentItem.add_child(root);
    }

    _formatUpdateTime(isoString) {
        if (!isoString)
            return '';

        const date = new Date(isoString);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1)
            return _('just now');

        if (diffMin < 60)
            return _('%d min ago').format(diffMin);

        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    _renderForecast(forecast) {
        if (!this._forecastSection)
            return;

        if (this._forecastWidget) {
            this._forecastWidget.destroy();
            this._forecastWidget = null;
        }

        this._forecastSection.destroy_all_children();

        this._forecastSection.add_child(new St.Label({
            text: _('Forecast'),
            style_class: 'weatherpanel-section-header',
        }));

        if (this._settings.get_boolean('disable-forecast')) {
            this._forecastSection.add_child(new St.Label({
                text: _('Forecast disabled'),
            }));
            return;
        }

        if (!forecast || !forecast.length) {
            this._forecastSection.add_child(new St.Label({
                text: _('No forecast available'),
            }));
            return;
        }

        this._forecastWidget = new Forecast();
        this._forecastWidget.setData(forecast, this._settings);

        this._forecastSection.add_child(this._forecastWidget.actor);
        this._updateStatusLabel();
    }

    _openPrefs() {
        try {
            this._extension.openPreferences();
        } catch (e) {
            logError(e);
        }
    }

    _openWebsite() {
        try {
            const url = this._settings.get_string('website-url') || 'https://weatherpanelmap.org/';

            const timestamp = global.get_current_time();
            const workspace = global.workspace_manager.get_active_workspace();
            const context = global.create_app_launch_context(timestamp, workspace);

            Gio.app_info_launch_default_for_uri(url, context);
        } catch (e) {
            logError(e);
        }
    }

    _getActiveCity() {
        const raw = this._settings.get_string('city');
        if (!raw)
            return null;

        try {
            const cities = JSON.parse(raw);
            const index = this._settings.get_int('actual-city');
            return cities?.[index] ?? null;
        } catch (_) {
            return null;
        }
    }

    _hasCity() {
        return !!this._getActiveCity();
    }

    update() {
        this._updateUI(this._lastData);
    }

    refresh() {
        this._renderForecast(this._lastData?.forecast);
    }
}

