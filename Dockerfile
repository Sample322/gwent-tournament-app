FROM node:18-alpine

# Создание рабочей директории
WORKDIR /app

# Копирование файлов зависимостей
COPY package*.json ./

# Установка только production зависимостей
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Открытие порта
EXPOSE 3000

# Запуск приложения
CMD ["node", "server/server.js"]
