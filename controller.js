import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import OpenMeteoProvider from './providers/openMeteo.js';
import YrNoProvider from './providers/yrNo.js';

import PanelButton from './ui/PanelButton.js';

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

        this._providerPrimary = null;
        this._providerFallback = null;
        this._provider = null;

        this._panelButton = null;

        this._currentTimerId = 0;
        this._forecastTimerId = 0;

        this._refreshInProgress = false;
    }

    enable() {
        this._initProviders();
        this._initPanelButton();
        this._bindSettingsSignals();        
        this._insertPanelButton();
        this._startTimers();

        this._refreshWithFallback(true).catch(logError);
        this._refreshWithFallback(false).catch(logError);
    }

    disable() {
        this._stopTimers();
        
        this._settings.disconnectObject(this);

        if (this._panelButton) {
            this._panelButton.stop?.();
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._providerPrimary?.stop?.();
        this._providerFallback?.stop?.();

        this._providerPrimary = null;
        this._providerFallback = null;
        this._provider = null;
    }

    /* ---------------- PROVIDERS ---------------- */

    _initProviders() {
        const providerSetting = this._settings.get_enum('provider');

        const PrimaryProvider =
            PROVIDERS[providerSetting] ?? OpenMeteoProvider;

        const FallbackProvider =
            providerSetting === WEATHER_YRNO
                ? OpenMeteoProvider
                : YrNoProvider;

        this._providerPrimary = new PrimaryProvider({
            settings: this._settings,
        });

        this._providerFallback = new FallbackProvider({
            settings: this._settings,
        });

        this._provider = this._providerPrimary;
    }

    _setActiveProvider(provider) {
        if (this._provider === provider)
            return;

        this._provider = provider;
        this._panelButton?.setProvider?.(provider);
    }
    
    _onProviderChanged() {
        this._providerPrimary?.stop?.();
        this._providerFallback?.stop?.();

        this._initProviders();
        this._setActiveProvider(this._providerPrimary);

        this._panelButton?.setProvider?.(this._providerPrimary);

        this._startTimers();

        this._refreshWithFallback(true).catch(logError);
        this._refreshWithFallback(false).catch(logError);
    }

    /* ---------------- PANEL BUTTON ---------------- */

    _initPanelButton() {
        this._panelButton = new PanelButton({
            settings: this._settings,
            provider: this._provider,
            extension: this._extension,
        });

        this._panelButton.start?.();
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

    _reapplyPanelPosition() {
        this._insertPanelButton();
    }
    
    /* ---------------- SETTINGS SIGNALS ---------------- */

    _bindSettingsSignals() {
        this._settings.connectObject(
            'changed',
            (_, key) => {

                if (key === 'disable-forecast') {
                    this._startTimers();
                    return;
                }

                if (
                    key === 'refresh-interval-current' ||
                    key === 'refresh-interval-forecast'
                ) {
                    this._startTimers();
                    return;
                }

                if (
                    key === 'position-in-panel' ||
                    key === 'position-index'
                ) {
                    this._reapplyPanelPosition();
                    return;
                }

                if (key === 'provider') {
                    this._onProviderChanged();
                    return;
                }

                if (
                    key === 'city' ||
                    key === 'actual-city'
                ) {
                    this._refreshWithFallback(true).catch(logError);
                    this._refreshWithFallback(false).catch(logError);
                }
            },
            this
        );
    }

    /* ---------------- TIMERS ---------------- */

    _startTimers() {
        this._stopTimers();

        const currentInterval =
            this._settings.get_int('refresh-interval-current');

        const forecastInterval =
            this._settings.get_int('refresh-interval-forecast');

        const disableForecast =
            this._settings.get_boolean('disable-forecast');

        this._currentTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            currentInterval,
            () => {
                this._refreshWithFallback(true).catch(logError);
                return GLib.SOURCE_CONTINUE;
            }
        );

        if (!disableForecast) {
            this._forecastTimerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                forecastInterval,
                () => {
                    this._refreshWithFallback(false).catch(logError);
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }
    }

    _stopTimers() {
        if (this._currentTimerId) {
            GLib.source_remove(this._currentTimerId);
            this._currentTimerId = 0;
        }

        if (this._forecastTimerId) {
            GLib.source_remove(this._forecastTimerId);
            this._forecastTimerId = 0;
        }
    }

    /* ---------------- REFRESH / FALLBACK ---------------- */

    async _refreshWithFallback(isCurrent) {
        if (this._refreshInProgress)
            return;

        this._refreshInProgress = true;

        try {
            const okPrimary =
                await this._providerPrimary.refresh(isCurrent);

            if (okPrimary) {
                this._setActiveProvider(this._providerPrimary);
                return;
            }

            const okFallback =
                await this._providerFallback.refresh(isCurrent);

            if (okFallback)
                this._setActiveProvider(this._providerFallback);

        } finally {
            this._refreshInProgress = false;
        }
    }
}
