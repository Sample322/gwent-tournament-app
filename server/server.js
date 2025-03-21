require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const lobbyRoutes = require('./routes/lobbyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const rateLimit = require('express-rate-limit');

// Инициализация приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // Оптимизированные настройки Socket.IO
  pingTimeout: 60000, // Увеличенный пинг-таймаут (60 секунд)
  pingInterval: 25000, // Интервал пинга (25 секунд)
  transports: ['websocket'], // Только вебсокеты, без polling
  maxHttpBufferSize: 1e6 // Ограничить размер буфера (1MB)
});

// Общее ограничение API запросов
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  standardHeaders: true,
  legacyHeaders: false,
});

// Ограничение для создания лобби
const createLobbyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5, // максимум 5 лобби с одного IP в час
  message: { message: 'Слишком много запросов на создание лобби. Попробуйте позже.' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// API Routes с лимитерами
app.use('/api/', apiLimiter);
app.use('/api/lobbies', lobbyRoutes);
app.use('/api/admin', adminRoutes);

// Применяем ограничения для создания лобби
app.use('/api/lobbies', createLobbyLimiter);

// Socket.io логика
require('./socket/lobbySocket')(io);

// Маршрут для фронтенда
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Подключение к MongoDB с обновленными настройками
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Обновленные параметры для надежного соединения
  serverSelectionTimeoutMS: 5000, // Таймаут выбора сервера
  socketTimeoutMS: 45000, // Увеличенный таймаут сокета
  maxPoolSize: 10, // Ограничение пула соединений
  // Удаляем устаревшие опции keepAlive и keepAliveInitialDelay
})
.then(() => console.log('MongoDB подключено'))
.catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Добавляем обработчики событий для контроля подключения к MongoDB
mongoose.connection.on('error', err => {
  console.error('Ошибка соединения с MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB отключено, повторное подключение...');
  // Можно добавить логику для автоматического переподключения
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