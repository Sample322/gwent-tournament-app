require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const lobbyRoutes = require('./routes/lobbyRoutes');

// Инициализация приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// API Routes
app.use('/api/lobbies', lobbyRoutes);

// Socket.io логика
require('./socket/lobbySocket')(io);

// Маршрут для фронтенда
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Таймаут выбора сервера
  maxPoolSize: 10 // Ограничение пула соединений
})
.then(() => console.log('MongoDB подключено'))
.catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Добавляем обработчики событий для контроля подключения
mongoose.connection.on('error', err => {
  console.error('Ошибка соединения с MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB отключено, повторное подключение...');
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Обработчики для graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('Получен сигнал завершения, закрытие соединений...');
  
  // Закрываем HTTP сервер
  server.close(() => {
    console.log('HTTP сервер закрыт');
    
    // Закрываем соединение с MongoDB
    mongoose.connection.close(false, () => {
      console.log('MongoDB соединение закрыто');
      process.exit(0);
    });
    
    // На случай, если MongoDB не ответит вовремя
    setTimeout(() => {
      console.error('Не удалось закрыть соединения за 5 секунд, завершение принудительно');
      process.exit(1);
    }, 5000);
  });
}