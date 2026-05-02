# ⭐ WeatherPanel  
*A clean, modern, GNOME‑native weather extension with a beautiful panel indicator and a fully redesigned menu.*

<p align="center">
  <img src="https://img.shields.io/badge/GNOME-45–50-blue?logo=gnome&logoColor=white" />
  <img src="https://img.shields.io/badge/Provider-OpenMeteo-brightgreen?logo=cloudflare" />
  <img src="https://img.shields.io/github/license/attentivecoder/weather-panel" />
  <img src="https://img.shields.io/badge/version-1.0-blue" />
</p>

WeatherPanel is a modern GNOME Shell weather extension that focuses on clarity, responsiveness, and a clean GNOME‑native design.
It provides accurate weather data from **Open‑Meteo**, a redesigned panel menu, and a polished user experience that integrates seamlessly with GNOME.

---

## 🌤️ Features

### 🖥️ Clean, GNOME‑native panel indicator
- Shows current temperature directly in the top bar
- Uses symbolic weather icons that match GNOME’s visual language
- Automatically updates when weather changes
- Gracefully handles offline mode

### 📍 Location‑aware
- Supports multiple saved cities
- One‑click “Use my location” button
- Smart duplicate detection
- Automatic refresh when switching cities

### 🌡️ Detailed current conditions
- Temperature (C / F / K)
- Wind speed (km/h, mph, m/s, knots)
- Wind direction
- Pressure (hPa, inHg, bar)
- Weather summary and icon

### 📅 Forecast section
- Multi‑day forecast with icons and temperatures
- Optional: disable forecast entirely
- Clean, compact layout

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

### Units
- Temperature: Celsius / Fahrenheit / Kelvin
- Wind speed: km/h / mph / m/s / knots
- Pressure: hPa / inHg / bar

### Forecast
- Enable/disable forecast section

### Location
- Manage saved cities
- Auto‑detect location

---

## 📦 Installation

### Recommended (stable release)

Download the latest `.zip` from the Releases page:

👉 https://github.com/attentivecoder/weather-panel/releases/latest

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
Restart GNOME Shell:

- Xorg: Alt+F2 → r
- Wayland: log out and back in
Enable the extension:

```bash
gnome-extensions enable weatherpanel@attentivecoder
```

## 🛠️ Development Notes

### Recompile schemas after changes

```bash
glib-compile-schemas schemas/
```

### Debug GNOME Shell logs

```bash
journalctl -f /usr/bin/gnome-shell
```

### Useful commands

```bash
gsettings list-keys org.gnome.shell.extensions.weather-panel
gsettings get org.gnome.shell.extensions.weather-panel unit
```

## 🏷️ Packaging for release
Create a ZIP bundle:

```bash
          zip -r weatherpanel@attentivecoder.zip \
            extension.js \
            controller.js \
            metadata.json \
            prefs.js \
            settings.js \
            stylesheet.css \
            readme.md \
            LICENSE \
            media \
            preferences \
            providers \
            services \
            ui \
            utils \
            schemas \
            -x "schemas/gschemas.compiled" \
            -x ".git/*" \
            -x ".gitignore" \
            -x "test-soup.js" \
            -x "node_modules/*" \
            -x "package.json" \
            -x "package-lock.json"
```

## ❤️ Credits

- Weather data provided by **Open‑Meteo**
- UI and logic inspired by GNOME Weather and community extensions
- Originally based on the **OpenWeather** extension by *skrewball*:
  https://gitlab.com/skrewball/openweather
  Now heavily rewritten, modernized, and expanded into a new project
- Designed & developed by **@attentivecoder**

