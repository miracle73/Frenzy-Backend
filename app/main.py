from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.api import documents, transactions, dashboard, chat

app = FastAPI(
    title="Agentic Storekeeper API",
    description="FastAPI backend for intelligent document and transaction management",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded documents statically
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(documents.router)
app.include_router(transactions.router)
app.include_router(dashboard.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    return {"message": "Agentic Storekeeper API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
