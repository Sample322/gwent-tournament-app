const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Lobby = require('../models/Lobby');
const Match = require('../models/Match');

// Middleware для проверки API ключа
const checkApiKey = (req, res, next) => {
  const apiKey = req.query.key || req.headers['x-api-key'];
  
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ error: 'API ключ не настроен на сервере' });
  }
  
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Неверный API ключ' });
  }
  
  next();
};

// Публичный health check
router.get('/health', async (req, res) => {
  try {
    // Проверяем подключение к PostgreSQL
    await sequelize.authenticate();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: Math.round(process.uptime())
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      database: 'disconnected',
      message: error.message
    });
  }
});

// Статистика сервера (защищено)
router.get('/stats', checkApiKey, async (req, res) => {
  try {
    // Количество лобби по статусам
    const statusCounts = await Lobby.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });
    
    const statusMap = {};
    let totalLobbies = 0;
    statusCounts.forEach(item => {
      statusMap[item.status] = parseInt(item.count);
      totalLobbies += parseInt(item.count);
    });
    
    // Количество матчей за последние 24 часа
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMatches = await Match.count({
      where: {
        completedAt: { [Op.gte]: dayAgo }
      }
    });
    
    // Использование памяти
    const memoryUsage = process.memoryUsage();
    
    res.json({
      lobbies: {
        total: totalLobbies,
        byStatus: statusMap
      },
      matches: {
        last24h: recentMatches
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      uptime: `${Math.round(process.uptime() / 60)} минут`,
      nodeVersion: process.version,
      database: 'PostgreSQL',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Список активных лобби (защищено)
router.get('/lobbies', checkApiKey, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    const where = {};
    if (status) {
      where.status = status;
    }
    
    const lobbies = await Lobby.findAll({
      where,
      order: [['lastActivity', 'DESC']],
      limit: parseInt(limit),
      attributes: ['lobbyCode', 'status', 'tournamentFormat', 'creatorName', 'opponentName', 'lastActivity', 'created_at']
    });
    
    res.json({
      count: lobbies.length,
      lobbies
    });
  } catch (error) {
    console.error('❌ Ошибка получения списка лобби:', error);
    res.status(500).json({ error: 'Ошибка получения списка лобби' });
  }
});

// Информация о конкретном лобби (защищено)
router.get('/lobbies/:lobbyCode', checkApiKey, async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const lobby = await Lobby.findOne({ 
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (!lobby) {
      return res.status(404).json({ error: 'Лобби не найдено' });
    }
    
    res.json(lobby.toAPIFormat());
  } catch (error) {
    console.error('❌ Ошибка получения информации о лобби:', error);
    res.status(500).json({ error: 'Ошибка получения информации о лобби' });
  }
});

// Очистка неактивных лобби (защищено)
router.post('/cleanup', checkApiKey, async (req, res) => {
  try {
    const { hours = 3 } = req.query;
    const hoursNum = parseInt(hours);
    
    if (isNaN(hoursNum) || hoursNum < 1) {
      return res.status(400).json({ error: 'Некорректное значение hours' });
    }
    
    const cutoffTime = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
    
    const result = await Lobby.destroy({ 
      where: {
        lastActivity: { [Op.lt]: cutoffTime }
      }
    });
    
    console.log(`🧹 Очистка: удалено ${result} лобби старше ${hoursNum} часов`);
    
    res.json({ 
      message: 'Очистка завершена',
      removed: result,
      cutoffTime: cutoffTime.toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка при очистке:', error);
    res.status(500).json({ error: 'Ошибка при очистке' });
  }
});

// Принудительное удаление лобби (защищено)
router.delete('/lobbies/:lobbyCode', checkApiKey, async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    
    const result = await Lobby.destroy({ 
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (result === 0) {
      return res.status(404).json({ error: 'Лобби не найдено' });
    }
    
    console.log(`🗑️ Админ удалил лобби ${lobbyCode}`);
    
    res.json({ message: 'Лобби удалено', lobbyCode });
  } catch (error) {
    console.error('❌ Ошибка удаления лобби:', error);
    res.status(500).json({ error: 'Ошибка удаления лобби' });
  }
});

// История матчей (защищено)
router.get('/matches', checkApiKey, async (req, res) => {
  try {
    const { limit = 50, playerId } = req.query;
    
    const where = {};
    if (playerId) {
      where[Op.or] = [
        { creatorId: playerId },
        { opponentId: playerId }
      ];
    }
    
    const matches = await Match.findAll({
      where,
      order: [['completedAt', 'DESC']],
      limit: parseInt(limit)
    });
    
    res.json({
      count: matches.length,
      matches
    });
  } catch (error) {
    console.error('❌ Ошибка получения истории матчей:', error);
    res.status(500).json({ error: 'Ошибка получения истории матчей' });
  }
});

module.exports = router;
