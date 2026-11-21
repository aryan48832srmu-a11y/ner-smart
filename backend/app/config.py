from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "NDRMS"
    APP_ENV: str = "production"
    APP_VERSION: str = "1.3.0"
    DEBUG: bool = False

    # Comma-separated origins. "*" allows any origin, which is needed when the
    # frontend is hosted separately from the API (static hosting via FTP).
    # This demo API sets no cookies, so wildcard CORS is safe here.
    #
    # `CORS_ALLOW_ALL` defaults to true so the public demo keeps working even
    # if an old `CORS_ORIGINS` value was left over in the host's dashboard.
    # Set it to false and list `CORS_ORIGINS` explicitly to restrict origins.
    CORS_ALLOW_ALL: bool = True
    CORS_ORIGINS: str = "*"

    DATABASE_URL: str = "sqlite:///./nersmart.db"

    # Optional path to a built frontend (Vite `dist/`) that the API should
    # serve. Leave empty to auto-detect `../frontend/dist` in the repository;
    # set it to an absolute path in a container or custom deployment layout.
    FRONTEND_DIST: str = ""

    # Live weather via OpenWeatherMap (free tier). Leave empty to use the
    # built-in simulated fallback so the platform still runs offline.
    OPENWEATHER_API_KEY: str = ""
    WEATHER_CACHE_TTL_SECONDS: int = 600
    WEATHER_TIMEOUT_SECONDS: float = 10.0

    # Reverse geocoding (OpenStreetMap Nominatim) used by "use my current
    # location" in the incident form. Proxied through the API so the browser
    # never hits Nominatim directly.
    GEOCODE_TIMEOUT_SECONDS: float = 6.0

    # ------------------------------------------------------------------
    # Real-road routing (public OSRM servers, no API key required).
    # Providers are tried in order; if all fail the built-in road graph and
    # then a direct connection are used, so planning never returns an error.
    # ------------------------------------------------------------------
    ROUTING_TIMEOUT_SECONDS: float = 8.0
    ROUTING_CACHE_TTL_SECONDS: int = 600
    ROUTING_PROVIDERS: str = "valhalla,osrm-public,osrm-de"

    # ------------------------------------------------------------------
    # Real incidents from public web feeds (GDACS + USGS). No API key.
    # Cached to respect feed usage policies.
    # ------------------------------------------------------------------
    LIVE_INCIDENTS_ENABLED: bool = True
    LIVE_INCIDENTS_CACHE_TTL_SECONDS: int = 600
    LIVE_INCIDENTS_TIMEOUT_SECONDS: float = 10.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def live_weather_enabled(self) -> bool:
        return bool(self.OPENWEATHER_API_KEY.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
