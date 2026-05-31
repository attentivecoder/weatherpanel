import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import OpenMeteoProvider from './providers/openMeteo.js';
import YrNoProvider from './providers/yrNo.js';
import PanelButton from './ui/PanelButton.js';
import LocationManager from './services/locationManager.js';

const WEATHER_OPEN_METEO = 0;
const WEATHER_YRNO = 1;

const PANEL_FAR_LEFT = 0;
const PANEL_LEFT = 1;
const PANEL_CENTER = 2;
const PANEL_RIGHT = 3;
const PANEL_FAR_RIGHT = 4;

const PROVIDERS = {
    [WEATHER_OPEN_METEO]: OpenMeteoProvider,
    [WEATHER_YRNO]: YrNoProvider,
};

export default class Controller {

    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        
        this._locationManager = new LocationManager({
            settings,
            geolocation: extension.geolocation,
        });

        this._providerPrimary = null;
        this._providerFallback = null;
        this._activeProvider = null;

        this._panelButton = null;

        this._timers = {
            current: 0,
            forecast: 0,
            status: 0,
        };
        
        this._refreshInProgress = false;
        this._settingsSignalId = null;
        
        this._refreshSeq = 0;
    }

    /* ---------------- LIFECYCLE ---------------- */

    enable() {
        this._initProviders();
        this._initPanelButton();
        this._connectSettings();

        this._insertPanelButton();
        this._startTimers();

        this.refresh(true);
        this.refresh(false);
    }

    disable() {
        this._disconnectSettings();
        this._stopTimers();

        if (this._panelButton) {
            this._panelButton.stop?.();
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._providerPrimary?.stop?.();
        this._providerFallback?.stop?.();

        this._providerPrimary = null;
        this._providerFallback = null;
        this._activeProvider = null;
    }

    /* ---------------- PROVIDERS ---------------- */

    _initProviders() {
        const providerSetting = this._settings.get_enum('provider');

        const Primary = PROVIDERS[providerSetting] ?? OpenMeteoProvider;
        const Fallback =
            providerSetting === WEATHER_YRNO
                ? OpenMeteoProvider
                : YrNoProvider;

        this._providerPrimary = new Primary({ settings: this._settings });

        this._providerFallback = new Fallback({ settings: this._settings });

        if (!this._providerFallback?.refresh) {
            logError(new Error('Fallback provider is invalid'));
            this._providerFallback = this._providerPrimary;
        }

        this._setActiveProvider(this._providerPrimary);
    }

    _setActiveProvider(provider) {
        if (this._activeProvider === provider)
            return;

        this._activeProvider = provider;

        if (this._panelButton) {
            this._panelButton.setProvider(provider);
            this._panelButton.setProviderName(provider.getName());
            
             this.refresh(true);
             this.refresh(false);
        }
    }

    /* ---------------- PANEL UI ---------------- */

    _initPanelButton() {
        this._panelButton = new PanelButton({
            settings: this._settings,
            provider: this._activeProvider,
            extension: this._extension,
        });

        this._panelButton.onLocationRequested = () => this.setCurrentLocation();
        this._panelButton.onRefreshRequested = () => this.refreshWeather();
        this._panelButton.onPrefsRequested = () => this._extension.openPreferences();
        this._panelButton.onWebsiteRequested = () => this._activeProvider?.openWebsite?.();
    }

    _insertPanelButton() {
        if (!this._panelButton)
            return;

        const pos = this._settings.get_enum('position-in-panel');

        const boxes = [
            Main.panel._leftBox,
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
            Main.panel._rightBox,
        ];

        const box = boxes[pos];

        let index = 0;

        if (pos === PANEL_LEFT)
            index = 1;

        if (pos === PANEL_FAR_RIGHT)
            index = box.get_n_children();

        const actor = this._panelButton.actor;
        const oldParent = actor.get_parent?.();

        if (oldParent)
            oldParent.remove_child(actor);

        box.insert_child_at_index(actor, index);
    }

    /* ---------------- REFRESH (RACE-SAFE) ---------------- */

    async refresh(isCurrent) {
        const seq = ++this._refreshSeq;

        try {
            const primary = this._providerPrimary;
            const fallback = this._providerFallback;

            if (!primary?.refresh)
                throw new Error('Primary provider missing refresh()');

            const okPrimary = await primary.refresh(isCurrent);

            if (seq !== this._refreshSeq)
                return;

            if (okPrimary) {
                this._setActiveProvider(primary);
                return;
            }

            if (!fallback?.refresh)
                return;

            const okFallback = await fallback.refresh(isCurrent);

            if (seq !== this._refreshSeq)
                return;

            if (okFallback)
                this._setActiveProvider(fallback);

        } catch (e) {
            logError(e);
        }
    }
    
    /* ---------------- ACTIONS ---------------- */

    async setCurrentLocation() {
        const city = await this._locationManager.updateCurrentLocation();

        if (!city)
            return null;

        this.refresh(true);
        this.refresh(false);

        return city;
    }
    
    async refreshWeather() {
        const ok = await this.refresh(true);
        return ok;
    }

    
    /* ---------------- TIMERS ---------------- */

    _startTimers() {
        this._stopTimers();

        const currentInterval =
            this._settings.get_int('refresh-interval-current');

        const forecastInterval =
            this._settings.get_int('refresh-interval-forecast');

        this._timers.current = this._addTimer(
            currentInterval,
            () => this.refresh(true)
        );

        if (!this._settings.get_boolean('disable-forecast')) {
            this._timers.forecast = this._addTimer(
                forecastInterval,
                () => this.refresh(false)
            );
        }

        this._timers.status = this._addTimer(
            60,
            () => this._panelButton?.updateStatusLabel?.()
        );
    }

    _addTimer(seconds, fn) {
        return GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            seconds,
            () => {
                fn();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopTimers() {
        for (const k in this._timers) {
            if (this._timers[k]) {
                GLib.source_remove(this._timers[k]);
                this._timers[k] = 0;
            }
        }
    }

    /* ---------------- SETTINGS ---------------- */

    _connectSettings() {
        this._settingsSignalId = this._settings.connect(
            'changed',
            (_, key) => this._onSettingsChanged(key)
        );
    }

    _disconnectSettings() {
        if (this._settingsSignalId) {
            this._settings.disconnect(this._settingsSignalId);
            this._settingsSignalId = null;
        }
    }

    _onSettingsChanged(key) {

        switch (key) {

            case 'provider':
                this._initProviders();
                this._startTimers();
                this.refresh(true);
                this.refresh(false);
                break;

            case 'refresh-interval-current':
            case 'refresh-interval-forecast':
            case 'disable-forecast':
                this._startTimers();
                break;

            case 'unit':
            case 'wind-speed-unit':
            case 'pressure-unit':
                this._panelButton?.refreshUI();
                break;

            case 'city':
            case 'actual-city':
                this.refresh(true);
                this.refresh(false);
                break;

            case 'position-in-panel':
            case 'position-index':
                this._insertPanelButton();
                break;
        }
    }
}

