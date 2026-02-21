from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Add any initialization logic (e.g., verifying DB connection)
    print(f"Starting Fretbox Outreach API in {settings.ENVIRONMENT} mode...")
    yield
    # Shutdown: Add cleanup logic here
    print("Shutting down Fretbox Outreach API...")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Fretbox Outreach API",
        description="Semi-autonomous B2B outreach system for Indian Universities",
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy", 
            "environment": settings.ENVIRONMENT,
            "version": "1.0.0"
        }

    return app

app = create_app()
