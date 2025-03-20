const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Включаем сжатие ответов
app.use(compression());

// Статические файлы с кэшированием
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h' // Кэширование на 1 час
}));

// Ограничиваем размер тела запроса
app.use(express.json({ limit: '10kb' }));

// Хранение данных лобби с отслеживанием активности
const lobbies = {};

// Очистка неактивных лобби каждый час
setInterval(() => {
  const now = Date.now();
  Object.keys(lobbies).forEach(lobbyCode => {
    // Удаляем лобби, неактивные более 2 часов
    if (lobbies[lobbyCode].lastActivity && now - lobbies[lobbyCode].lastActivity > 7200000) {
      delete lobbies[lobbyCode];
      console.log(`Удалено неактивное лобби: ${lobbyCode}`);
    }
  });
}, 3600000);

// Остальной код server.js...

// Обновление функций API и Socket.IO для отслеживания активности
app.post('/api/lobbies', (req, res) => {
  // ... существующий код ...
  
  // Добавляем отслеживание активности
  lobbies[lobbyCode].lastActivity = Date.now();
  
  res.status(201).json(lobbies[lobbyCode]);
});

// Аналогично для других API и обработчиков socket.io
// В каждом обновлении лобби обновляйте lastActivity

// Например, в socket.on('confirm-faction-selection', ...)
lobbies[lobbyCode].lastActivity = Date.now();

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});