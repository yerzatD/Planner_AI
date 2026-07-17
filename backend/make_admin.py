import argparse
import os
import sqlite3
import sys


def make_admin(identifier: str, db_path: str):
    if not os.path.exists(db_path):
        print(f"Файл базы не найден: {os.path.abspath(db_path)}")
        print("Проверь путь через --db (sqlite3 иначе молча создаст пустой файл).")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute(
        "SELECT id, username, email, role FROM users WHERE email = ? OR username = ?",
        (identifier, identifier),
    )
    user = cur.fetchone()

    if user is None:
        print(f"Пользователь '{identifier}' не найден в {db_path}.")
        conn.close()
        return

    user_id, username, email, role = user

    if role == "admin":
        print(f"{username} ({email}) уже админ.")
        conn.close()
        return

    cur.execute("UPDATE users SET role = 'admin' WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    print(f"Готово: {username} ({email}) теперь admin.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("identifier", help="email или username пользователя")
    parser.add_argument("--db", default="planner.db", help="путь до файла planner.db")
    args = parser.parse_args()

    try:
        make_admin(args.identifier, args.db)
    except sqlite3.OperationalError as e:
        print(f"Не удалось открыть базу '{args.db}': {e}")
        print("Проверь путь до planner.db через флаг --db")
        sys.exit(1)