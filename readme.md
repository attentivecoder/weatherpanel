# ⭐ WeatherPanel  
*A clean, modern, GNOME‑native weather extension with a beautiful panel indicator and a fully redesigned menu.*

<p align="center">
  <img src="https://img.shields.io/badge/GNOME-45–51-blue?logo=gnome&logoColor=white" />
  <img src="https://img.shields.io/badge/Providers-OpenMeteo_+_Yr.no-brightgreen" />
  <img src="https://img.shields.io/github/license/attentivecoder/weatherpanel" />
  <img src="https://img.shields.io/badge/version-1.0-blue" />
</p>

WeatherPanel is a modern GNOME Shell weather extension that focuses on clarity, responsiveness, and a clean GNOME‑native design.
It supports **multiple weather providers**, **multiple location search providers**, and **multiple IP geolocation providers**, with automatic fallback behavior.

---

## 🌤️ Features

### 🖥️ Clean, GNOME‑native panel indicator
- Shows current temperature directly in the top bar
- Uses symbolic weather icons that match GNOME’s visual language
- Automatically updates when weather changes
- Gracefully handles offline mode

### 🧠 Multiple weather providers
- Choose between **Open‑Meteo** and **Yr.no**
- Automatic fallback if the selected provider fails
- Provider name shown directly in the menu
- One‑click link to provider website

### 📍 Flexible location search
- Choose your **location search provider**:
  - OpenStreetMap
  - Open‑Meteo
- Fast, debounced search with clean results
- Handles offline mode gracefully

### 🌐 IP‑based location detection
- Choose your **IP geolocation provider**:
  - ipapi.co
  - ipinfo.io
- Used for “Use my location”
- Smart duplicate detection
- Graceful error handling

### 🌡️ Detailed current conditions
- Temperature (C / F / K) and “feels like”
- Humidity, UV index (with WHO level), wind, gusts and pressure
- Wind speed (km/h, mph, m/s, knots, Beaufort) and direction
- Pressure (hPa, inHg, bar, mmHg, kPa)
- Sunrise and sunset
- Weather summary and icon, with night variants

### 🚶 Best time for a walk
- Finds the longest dry stretch of daylight (no rain, thunder or strong gusts)
- Shows today’s window, or tomorrow’s once today’s daylight is over

### 📅 Forecast section
- Next hours: temperature and chance of rain
- Next days: min/max, chance of rain, expandable for walk window, UV, rain amount, gusts, sunrise/sunset and 3‑hourly details
- Optional: disable forecast entirely

### 🕒 Smart timestamp
- “Updated just now”
- “Updated 5 min ago”
- Falls back to HH:MM after an hour
- Offline mode: “Offline — last updated …”

### 🧭 Intuitive menu layout
- Centered action buttons
- Provider info on the left
- Timestamp on the right
- Smooth hover‑switching between panel menus

### ⚡ Fast & lightweight
- No background daemons
- No heavy dependencies
- Uses GNOME’s built‑in menu manager
- Efficient caching and refresh logic

---

## ⚙️ Settings

### Providers
- **Weather Provider:** Open‑Meteo / Yr.no
- **Location Search Provider:** OpenStreetMap / Open‑Meteo
- **IP Geolocation Provider:** ipapi.co / ipinfo.io

### Units
Every unit defaults to **Automatic**, which follows the region of your
system locale (e.g. °F, mph and inHg in the US, m/s in the Nordics).
- Temperature: Celsius / Fahrenheit / Kelvin
- Wind speed: km/h / mph / m/s / knots / Beaufort
- Pressure: hPa / inHg / bar / mmHg / kPa
- Precipitation: millimeters / inches
- Decimal places for temperature and wind (0–2)

### Forecast
- Enable/disable forecast section
- Number of forecast days (1–8, including today)
- Refresh intervals for current weather and forecast

### Location
- Manage saved cities
- Auto‑detect location
- Smart duplicate detection

---

## 📦 Installation

### Recommended (stable release)

Download the latest `.zip` from the Releases page:

👉 https://github.com/attentivecoder/weatherpanel/releases/latest

Install it:

```bash
gnome-extensions install weatherpanel@attentivecoder.zip
gnome-extensions enable weatherpanel@attentivecoder
```

## 🧑‍💻 Development

Clone into your GNOME extensions directory:

```bash
git clone https://github.com/attentivecoder/weatherpanel.git \
  ~/.local/share/gnome-shell/extensions/weatherpanel@attentivecoder
```

Compile schemas:

```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/weatherpanel@attentivecoder/schemas/
```
Log out and back in so GNOME Shell picks up the extension, then enable it:

```bash
gnome-extensions enable weatherpanel@attentivecoder
```

## 🛠️ Development Notes

### Recompile schemas after changes

```bash
glib-compile-schemas schemas/
```

### Test in a nested GNOME Shell (GNOME 49+)

Runs a separate shell in a window, so you don't have to log out:

```bash
dbus-run-session gnome-shell --devkit --wayland
```

On GNOME 45–48 use `dbus-run-session gnome-shell --nested --wayland`.

### Debug GNOME Shell logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Debug messages are only shown with `G_MESSAGES_DEBUG=all`.

### Useful commands

```bash
gsettings list-keys org.gnome.shell.extensions.weatherpanel
gsettings get org.gnome.shell.extensions.weatherpanel unit
```

## 🌍 Translations

WeatherPanel is written in English and uses your desktop language when a
translation for it is available, falling back to English otherwise.
Translations live in `po/`, one file per language:

| Language             | File          |
| -------------------- | ------------- |
| English              | built in      |
| Chinese (Simplified) | `po/zh_CN.po` |
| Danish               | `po/da.po`    |
| Dutch                | `po/nl.po`    |
| Finnish              | `po/fi.po`    |
| French               | `po/fr.po`    |
| German               | `po/de.po`    |
| Italian              | `po/it.po`    |
| Japanese             | `po/ja.po`    |
| Korean               | `po/ko.po`    |
| Norwegian Bokmål     | `po/nb.po`    |
| Polish               | `po/pl.po`    |
| Portuguese (Brazil)  | `po/pt_BR.po` |
| Russian              | `po/ru.po`    |
| Spanish              | `po/es.po`    |
| Swedish              | `po/sv.po`    |
| Ukrainian            | `po/uk.po`    |

Corrections and new languages are welcome. To add one, e.g. Czech:

```bash
# Refresh the template after changing strings
xgettext --from-code=UTF-8 --language=JavaScript -k_ -kN_ \
  -o po/weatherpanel.pot *.js preferences/*.js providers/*.js services/*.js ui/*.js utils/*.js

# Start a new translation, or update an existing one
msginit -i po/weatherpanel.pot -l cs -o po/cs.po
msgmerge -U po/cs.po po/weatherpanel.pot
```

## 🏷️ Packaging for release

Pushing a `v*` tag builds the ZIP automatically (see
`.github/workflows/release.yml`). To build it by hand, compile the
translations, then create the bundle. Compiling needs `msgfmt` from
gettext (`sudo apt install gettext` on Debian/Ubuntu):

```bash
(
  set -e    # stop at the first error instead of zipping a half-built bundle
  rm -rf locale
  for po in po/*.po; do
    lang=$(basename "$po" .po)
    mkdir -p "locale/$lang/LC_MESSAGES"
    msgfmt "$po" -o "locale/$lang/LC_MESSAGES/weatherpanel.mo"
  done

  rm -f weatherpanel@attentivecoder.zip
  zip -r weatherpanel@attentivecoder.zip \
    extension.js \
    controller.js \
    metadata.json \
    prefs.js \
    stylesheet.css \
    readme.md \
    LICENSE \
    media \
    preferences \
    providers \
    services \
    ui \
    utils \
    locale \
    schemas \
    -x "schemas/gschemas.compiled" \
    -x "media/iconSmall.png"
)
```

`po/`, `package.json` and the compiled schemas are not part of the
bundle; GNOME Shell 45+ compiles the schemas on install.

## 🔒 Network & privacy

WeatherPanel only contacts the services you pick in the settings:

- Weather: `api.open-meteo.com` or `api.met.no` (Yr.no)
- Location search: `nominatim.openstreetmap.org` or `geocoding-api.open-meteo.com`
- “Use my location”: `ipapi.co` or `ipinfo.io`, only when you ask for it

Requests identify the extension with a User-Agent, as the MET Norway
and OpenStreetMap usage policies require. No data is sent anywhere else.

## ❤️ Credits

- Weather data provided by **Open‑Meteo** and **Yr.no**
- Location search powered by **OpenStreetMap** and **Open‑Meteo**
- IP geolocation via **ipapi.co** and **ipinfo.io**
- UI and logic inspired by GNOME Weather and community extensions
- Originally based on the **OpenWeather** extension by *skrewball*:
  https://gitlab.com/skrewball/openweather
- Special thanks to **JustPerfection** for GNOME extension review feedback and guidance: 
  https://extensions.gnome.org/accounts/profile/JustPerfection
- Designed & developed by **@attentivecoder**

