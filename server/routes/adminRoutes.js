const express = require('express');
const router = express.Router();
const Lobby = require('../models/Lobby');

// Защищенный ключом API маршрут для базовой статистики
router.get('/stats', async (req, res) => {
  // Простая аутентификация по ключу API
  const apiKey = req.query.key;
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  try {
    // Получаем количество активных лобби
    const lobbiesCount = await Lobby.countDocuments();
    
    // Получаем количество лобби по статусам
    const statusCounts = await Lobby.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    // Преобразуем результаты в более удобный формат
    const statusMap = {};
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });
    
    // Базовая статистика использования памяти
    const memoryUsage = process.memoryUsage();
    
    res.json({
      activeLobbies: lobbiesCount,
      statusBreakdown: statusMap,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      uptime: Math.round(process.uptime() / 60) + ' minutes'
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Маршрут для экстренной очистки неактивных лобби
router.post('/cleanup', async (req, res) => {
  const apiKey = req.query.key;
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  try {
    // Находим и удаляем устаревшие лобби (старше 3 часов без активности)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const result = await Lobby.deleteMany({ 
      lastActivity: { $lt: threeHoursAgo }
    });
    
    res.json({ 
      message: 'Очистка завершена',
      removed: result.deletedCount 
    });
  } catch (error) {
    console.error('Ошибка при очистке:', error);
    res.status(500).json({ error: 'Ошибка при очистке' });
  }
});

// Маршрут для получения информации о конкретном лобби
router.get('/lobbies/:lobbyCode', async (req, res) => {
  const apiKey = req.query.key;
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  
  try {
    const { lobbyCode } = req.params;
    const lobby = await Lobby.findOne({ lobbyCode });
    
    if (!lobby) {
      return res.status(404).json({ error: 'Лобби не найдено' });
    }
    
    res.json(lobby);
  } catch (error) {
    console.error('Ошибка при получении информации о лобби:', error);
    res.status(500).json({ error: 'Ошибка при получении информации о лобби' });
  }
});

// Маршрут для проверки состояния сервера
router.get('/health', async (req, res) => {
  try {
    // Проверяем соединение с MongoDB
    const isMongoConnected = mongoose.connection.readyState === 1;
    
    res.json({
      status: 'ok',
      timestamp: new Date(),
      mongodb: isMongoConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;