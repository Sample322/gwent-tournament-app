# 🚀 Быстрый деплой на Timeweb Cloud

## ⚠️ ВАЖНО: Перед деплоем

Сеть недоступна в этом окружении, поэтому `package-lock.json` нужно сгенерировать локально:

```bash
# 1. Распакуйте архив
unzip gwent-tournament-postgresql.zip
cd gwent-app

# 2. Сгенерируйте package-lock.json
npm install

# 3. Закоммитьте в репозиторий
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_REPO_URL
git push -u origin main
```

---

## 📦 Создание PostgreSQL на Timeweb Cloud

1. **Панель управления** → **Базы данных** → **Создать**
2. Выберите **PostgreSQL 16**
3. После создания скопируйте данные подключения:
   - Хост: `xxx.timeweb.cloud`
   - Порт: `5432`
   - Имя БД: `default_db`
   - Пользователь: `gen_user`
   - Пароль: (сгенерированный)

---

## 🔧 Переменные окружения для Apps

```
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://gen_user:ПАРОЛЬ@ХОСТ:5432/default_db
DATABASE_SSL=true
CORS_ORIGIN=*
ADMIN_API_KEY=сгенерируйте-уникальный-ключ
```

### Генерация ADMIN_API_KEY:
```bash
openssl rand -hex 32
```

---

## 🎯 Деплой приложения

1. **Apps** → **Создать приложение** → **Docker**
2. Подключите Git репозиторий
3. Путь к Dockerfile: `./Dockerfile`
4. Добавьте переменные окружения (см. выше)
5. Нажмите **"Задеплоить"**

---

## ✅ Проверка

```bash
# Health check
curl https://ваше-приложение.timeweb.cloud/health

# Ответ: {"status":"ok","database":"connected",...}
```

---

## 🤖 Telegram Bot интеграция

```python
from telegram import WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup

keyboard = InlineKeyboardMarkup([[
    InlineKeyboardButton(
        "🎮 Турнир Гвинт",
        web_app=WebAppInfo(url="https://ваше-приложение.timeweb.cloud")
    )
]])
```
