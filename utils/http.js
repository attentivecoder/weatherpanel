import Soup from 'gi://Soup';

// MET Norway and Nominatim require an identifying User-Agent and
// may block generic ones.
const USER_AGENT =
    'WeatherPanel-GNOME-Shell-extension (https://github.com/attentivecoder/weatherpanel)';

export function createSession() {
    return new Soup.Session({
        user_agent: USER_AGENT,
        timeout: 30,
    });
}
