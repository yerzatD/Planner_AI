import json
import logging
import re

from google import genai
from google.genai import types
from google.genai.errors import APIError

from .config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

client = genai.Client(api_key=GEMINI_API_KEY)

MODEL_NAME = "gemini-2.5-flash-lite"

SYSTEM_PROMPT = """Ты — ИИ-планировщик учебного расписания. Твоя задача — составить недельный план обучения на основе входных данных пользователя.

## Входные данные (пользователь предоставляет):
- Количество видеоуроков, которые нужно просмотреть
- Еженедельная рутина пользователя (тренировки, работа, хобби и т.д. со временем и днями недели)

## Фиксированные дедлайны (нельзя изменить):
- Конспект — Вторник 20:00
- Практическая работа — Среда 15:00
- Домашнее задание — Четверг 22:00
- Квиз/тест — Пятница 20:00
- Работа над ошибками — Пятница 22:00

## Правила планирования:
1. Распредели видеоуроки по дням недели так, чтобы к дедлайнам материал был изучен
2. Учитывай рутину пользователя — не назначай занятия на время, когда он занят
3. Давай реалистичные временные блоки (например, 1 урок = 45-60 мин)
4. Добавь буферное время между задачами (15-30 мин)
5. Если дедлайн раньше, чем успеваешь просмотреть все уроки — предупреди и предложи интенсивный план
6. Учитывай, что на конспект, ДЗ, практику и тест нужно оставить время на выполнение
7. Ученик должен успеть посмотреть все видеоуроки до дедлайна конспекта
8. Видеоуроки открываются для учеников в субботу 18:00, средняя длина видеоуроков 15-20 минут, если ученик будет писать конспект — 1 видеоурок примерно займёт 30 минут или меньше
9. Ученик должен посиотреть все видеоуроки до дедлайна конспекта
10.Длительность 1 видеоурока примерно 20-25 минут ученик еще будет писать конспект это примрено займет 35-45 минут

## Формат ответа — строго JSON по схеме, без markdown, без пояснений:

{
  "plan": [
    {
      "day": "понедельник",
      "date": "2026-07-20",
      "tasks": [
        {
          "type": "video_lesson",
          "title": "Урок 1",
          "start_time": "09:00",
          "end_time": "10:00",
          "status": "planned"
        }
      ]
    }
  ],
  "warnings": [],
  "total_lessons": 0,
  "lessons_planned": 0,
  "free_hours_per_day": [
    {"day": "понедельник", "hours": 3}
  ]
}"""

# JSON Schema для response_schema — заставляет Gemini вернуть валидный JSON нужной формы,
# а не то, что он "решит" вернуть
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "plan": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "day": {"type": "STRING"},
                    "date": {"type": "STRING"},
                    "tasks": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "type": {"type": "STRING"},
                                "title": {"type": "STRING"},
                                "start_time": {"type": "STRING"},
                                "end_time": {"type": "STRING"},
                                "status": {"type": "STRING"},
                            },
                            "required": ["type", "title", "start_time", "end_time", "status"],
                        },
                    },
                },
                "required": ["day", "date", "tasks"],
            },
        },
        "warnings": {"type": "ARRAY", "items": {"type": "STRING"}},
        "total_lessons": {"type": "INTEGER"},
        "lessons_planned": {"type": "INTEGER"},
        "free_hours_per_day": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "day": {"type": "STRING"},
                    "hours": {"type": "NUMBER"},
                },
                "required": ["day", "hours"],
            },
        },
    },
    "required": ["plan", "warnings", "total_lessons", "lessons_planned"],
}


def _extract_json(text: str) -> dict:
    """Пытается распарсить JSON, а если модель всё же обернула его в markdown —
    вырезает содержимое между ```json ... ``` или между первой { и последней }."""
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise RuntimeError(f"Не удалось распарсить ответ Gemini: {text[:300]}")


def connect_with_ai(message: str) -> dict:
    if not message or not message.strip():
        raise ValueError("Пустой запрос пользователя")

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=message,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0.3,
            ),
        )
    except APIError as e:
        logger.error("Gemini API error: %s", e)
        raise RuntimeError(f"Ошибка при обращении к Gemini API: {e}") from e

    if not response.text:
        raise RuntimeError("Gemini вернул пустой ответ")

    result = _extract_json(response.text)

    # Gemini не поддерживает объекты с произвольными ключами в response_schema,
    # поэтому free_hours_per_day приходит списком [{"day": ..., "hours": ...}, ...] —
    # конвертируем обратно в словарь для фронта.
    free_hours = result.get("free_hours_per_day")
    if isinstance(free_hours, list):
        result["free_hours_per_day"] = {
            item["day"]: item["hours"]
            for item in free_hours
            if isinstance(item, dict) and "day" in item and "hours" in item
        }

    return result