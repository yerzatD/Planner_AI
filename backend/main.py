from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import user_router, chat_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Study Planner API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router, prefix="/users")
app.include_router(chat_router, prefix="/chat")


@app.get("/")
def root():
    return {"status": "ok"}