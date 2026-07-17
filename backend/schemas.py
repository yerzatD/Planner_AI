from typing import Any
import json
from pydantic import BaseModel, EmailStr, field_validator


#----USER----

class UserCreate(BaseModel):
    username : str
    email : EmailStr
    password : str

class UserUpdate(BaseModel):
    username : str
    email : str

class UserResponse(BaseModel):
    id : int
    username : str
    email : str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None



class ChatPrompt(BaseModel):
    prompt : str

class ChatResponse(BaseModel):
    id: int
    prompt: str
    response_from_ai: Any  # был str

    class Config:
        from_attributes = True

    @field_validator("response_from_ai", mode="before")
    @classmethod
    def parse_ai_response(cls, value):
        # В базе это строка (json.dumps), а нам нужен dict для фронта
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value  # на случай если там просто текст, а не JSON
        return value


