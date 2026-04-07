from pydantic_settings import BaseSettings
from openai import OpenAI, AsyncOpenAI


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://user:password@localhost/storekeeper_db"

    # JWT Settings
    secret_key: str = "your-secret-key-here-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    # File Upload
    max_file_size_mb: int = 10
    allowed_file_types: list[str] = ["pdf", "jpg", "jpeg", "png", "tiff"]
    upload_dir: str = "./uploads"

    # AI/ML
    openrouter_api_key: str = ""
    ai_model: str = "google/gemini-2.5-flash-preview"

    class Config:
        env_file = ".env"
        extra = "ignore"



settings = Settings()

# OpenRouter clients
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key
)

async_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key
)

