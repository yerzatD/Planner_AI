import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List

from .schemas import UserCreate, UserResponse, UserUpdate, ChatResponse, ChatPrompt
from .models import User, ChatRequests
from .database import get_db
from .auth import hash_password, authenticate_user, create_access_token, get_current_user
from .ai_service import connect_with_ai

user_router = APIRouter(tags=["user"])


@user_router.post("/", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first() is not None:
        raise HTTPException(status_code=401, detail="User already exits")
    db_user = User(
        username=user.username,
        email=user.email,
        password=hash_password(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@user_router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@user_router.patch("/update/me", response_model=UserResponse)
def update_user(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_update.email != current_user.email:
        existing = db.query(User).filter(user_update.email == User.email).first()
        if existing is not None:
            raise HTTPException(status_code=401, detail="Email already exists")

    current_user.username = user_update.username
    current_user.email = user_update.email
    db.commit()
    db.refresh(current_user)
    return current_user


@user_router.get("/get/me", response_model=UserResponse)
def get_user(current_user: User = Depends(get_current_user)):
    return current_user


@user_router.get("/get_users", response_model=List[UserResponse])
def get_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="U are not admin")
    users = db.query(User).all()
    if users is None:
        raise HTTPException(status_code=404, detail="Doesnt found any users")
    return users


@user_router.delete("/delete/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="U are not admin")
    db_user = db.query(User).filter(user_id == User.id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    name = db_user.username
    db.delete(db_user)
    db.commit()
    return {
        "message": f"User : {name} succsessfully deleted"
    }


chat_router = APIRouter(tags=["chat"])


@chat_router.post("/prompt", response_model=ChatResponse)
def connect_with_chat(prompt: ChatPrompt, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response_from_ai = connect_with_ai(prompt.prompt)
    db_chat = ChatRequests(
        user_id=current_user.id,
        prompt=prompt.prompt,
        response_from_ai=json.dumps(response_from_ai, ensure_ascii=False)
    )
    db.add(db_chat)
    db.commit()
    db.refresh(db_chat)
    return db_chat


@chat_router.get("/all", response_model=List[ChatResponse])
def get_all_chat(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chats = db.query(ChatRequests).filter(current_user.id == ChatRequests.user_id).all()
    return chats


@chat_router.get("/last/chat", response_model=ChatResponse)
def get_last_chat(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_chat = (
        db.query(ChatRequests)
        .filter(current_user.id == ChatRequests.user_id)
        .order_by(ChatRequests.id.desc())
        .first()
    )
    if db_chat is None:
        raise HTTPException(status_code=404, detail="У вас пока нет запросов")
    return db_chat