from .database import Base
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="user")
    created_at = Column(DateTime, default=func.now())
    chats = relationship("ChatRequests", back_populates="user", cascade="all, delete-orphan")


class ChatRequests(Base):
    __tablename__ = "chat_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    prompt = Column(String)
    response_from_ai = Column(String)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="chats")