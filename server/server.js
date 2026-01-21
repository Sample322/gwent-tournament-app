require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const lobbyRoutes = require('./routes/lobbyRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Инициализация приложения
const app = express();
const server = http.createServer(app);

// Настройка Socket.IO с оптимизациями
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Middleware
app.use(compression()); // Сжатие ответов
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // Лимит запросов
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// Статические файлы
app.use(express.static(path.join(__dirname, '../client'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// Health check endpoint (важно для TimeWeb)
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  res.status(200).json(healthCheck);
});

// API Routes
app.use('/api/lobbies', lobbyRoutes);
app.use('/api/admin', adminRoutes);

// Socket.io логика
require('./socket/lobbySocket')(io);

// Маршрут для фронтенда (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({ 
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Настройки подключения MongoDB
const mongoOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  w: 'majority'
};

// Функция подключения к MongoDB с повторными попытками
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
      console.log('✅ MongoDB подключено успешно');
      return;
    } catch (err) {
      console.error(`❌ Попытка ${i + 1}/${retries} подключения к MongoDB не удалась:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Повторная попытка через ${delay / 1000} секунд...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Не удалось подключиться к MongoDB после всех попыток');
  process.exit(1);
};

// Обработчики событий MongoDB
mongoose.connection.on('error', err => {
  console.error('❌ Ошибка соединения с MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB отключено');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB переподключено');
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  await connectWithRetry();
  
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Сервер запущен на ${HOST}:${PORT}`);
    console.log(`📊 Режим: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer();

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n📛 Получен сигнал ${signal}, начинаю graceful shutdown...`);
  
  // Останавливаем прием новых подключений
  server.close(async () => {
    console.log('✅ HTTP сервер закрыт');
    
    try {
      // Закрываем все socket соединения
      io.close(() => {
        console.log('✅ Socket.IO соединения закрыты');
      });
      
      // Закрываем MongoDB
      await mongoose.connection.close();
      console.log('✅ MongoDB соединение закрыто');
      
      process.exit(0);
    } catch (err) {
      console.error('❌ Ошибка при завершении:', err);
      process.exit(1);
    }
  });
  
  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    console.error('⚠️ Принудительное завершение через 10 секунд');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

module.exports = { app, server, io };
