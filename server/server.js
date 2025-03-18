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
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB подключено'))
.catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});