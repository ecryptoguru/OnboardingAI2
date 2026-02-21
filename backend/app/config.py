from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, EmailStr, PostgresDsn

class Settings(BaseSettings):
    # App Config
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    
    # DB / Supabase Connection
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # API Keys
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o"
    
    SENDGRID_API_KEY: str
    SENDGRID_FROM_EMAIL: EmailStr
    SENDGRID_FROM_NAME: str = "Fretbox Team"
    SENDGRID_WEBHOOK_SECRET: str
    
    SERPER_API_KEY: str
    
    CALENDLY_WEBHOOK_SECRET: str
    CALENDLY_LINK: str
    
    # Optional integrations
    SENTRY_DSN: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
