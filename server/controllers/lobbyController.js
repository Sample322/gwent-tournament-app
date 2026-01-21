const { Op } = require('sequelize');
const Lobby = require('../models/Lobby');

// Доступные символы для генерации кода
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Генерация уникального кода лобби
const generateLobbyCode = () => {
  let result = 'GW';
  for (let i = 0; i < 4; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return result;
};

// Создание нового лобби
exports.createLobby = async (req, res) => {
  try {
    const { creator, tournamentFormat } = req.body;
    
    // Валидация
    if (!creator || !creator.id) {
      return res.status(400).json({ message: 'ID игрока обязателен' });
    }
    
    if (tournamentFormat && !['bo3', 'bo5'].includes(tournamentFormat)) {
      return res.status(400).json({ message: 'Некорректный формат турнира' });
    }
    
    // Проверка лимита активных лобби
    const activeCount = await Lobby.count();
    if (activeCount >= 100) {
      return res.status(429).json({ 
        message: 'Достигнут лимит активных лобби. Попробуйте позже.' 
      });
    }
    
    // Проверяем существующее лобби создателя
    const existingLobby = await Lobby.findOne({
      where: {
        creatorId: creator.id,
        status: { [Op.in]: ['waiting', 'selecting-factions', 'banning'] }
      }
    });
    
    if (existingLobby) {
      return res.status(200).json(existingLobby.toAPIFormat());
    }
    
    // Генерируем уникальный код
    let lobbyCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      lobbyCode = generateLobbyCode();
      const existing = await Lobby.findOne({ where: { lobbyCode } });
      if (!existing) isUnique = true;
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({ message: 'Не удалось создать уникальный код' });
    }
    
    // Создаём лобби
    const newLobby = await Lobby.create({
      lobbyCode,
      creatorId: creator.id,
      creatorName: creator.name || 'Игрок 1',
      tournamentFormat: tournamentFormat || 'bo3',
      status: 'waiting',
      lastActivity: new Date()
    });
    
    console.log(`✅ Лобби ${lobbyCode} создано игроком ${creator.id}`);
    res.status(201).json(newLobby.toAPIFormat());
    
  } catch (error) {
    console.error('❌ Ошибка создания лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при создании лобби' });
  }
};

// Получение лобби по коду
exports.getLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    
    if (!lobbyCode || lobbyCode.length > 10) {
      return res.status(400).json({ message: 'Некорректный код лобби' });
    }
    
    const lobby = await Lobby.findOne({
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Обновляем активность
    lobby.lastActivity = new Date();
    await lobby.save();
    
    res.status(200).json(lobby.toAPIFormat());
    
  } catch (error) {
    console.error('❌ Ошибка получения лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Присоединение к лобби
exports.joinLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { playerId, playerName } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ message: 'ID игрока обязателен' });
    }
    
    const lobby = await Lobby.findOne({
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Проверяем, является ли игрок создателем
    if (lobby.creatorId === playerId) {
      lobby.lastActivity = new Date();
      await lobby.save();
      return res.status(200).json(lobby.toAPIFormat());
    }
    
    // Проверяем, является ли игрок уже оппонентом
    if (lobby.opponentId === playerId) {
      lobby.lastActivity = new Date();
      await lobby.save();
      return res.status(200).json(lobby.toAPIFormat());
    }
    
    // Проверяем статус
    if (lobby.status !== 'waiting') {
      return res.status(400).json({ 
        message: 'Нельзя присоединиться - игра уже началась' 
      });
    }
    
    // Проверяем, занято ли место оппонента
    if (lobby.opponentId) {
      return res.status(400).json({ message: 'Лобби уже заполнено' });
    }
    
    // Добавляем оппонента
    lobby.opponentId = playerId;
    lobby.opponentName = playerName || 'Игрок 2';
    lobby.lastActivity = new Date();
    await lobby.save();
    
    console.log(`✅ Игрок ${playerId} присоединился к лобби ${lobbyCode}`);
    res.status(200).json(lobby.toAPIFormat());
    
  } catch (error) {
    console.error('❌ Ошибка присоединения:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Обновление статуса лобби
exports.updateLobbyStatus = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { status, playerId } = req.body;
    
    const validStatuses = ['waiting', 'selecting-factions', 'banning', 'match-results'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Некорректный статус' });
    }
    
    const lobby = await Lobby.findOne({
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    if (playerId && lobby.creatorId !== playerId) {
      return res.status(403).json({ message: 'Только создатель может изменить статус' });
    }
    
    lobby.status = status;
    lobby.lastActivity = new Date();
    await lobby.save();
    
    res.status(200).json(lobby.toAPIFormat());
    
  } catch (error) {
    console.error('❌ Ошибка обновления статуса:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Удаление лобби
exports.deleteLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { playerId } = req.body;
    
    const lobby = await Lobby.findOne({
      where: { lobbyCode: lobbyCode.toUpperCase() }
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    if (playerId && lobby.creatorId !== playerId) {
      return res.status(403).json({ message: 'Только создатель может удалить лобби' });
    }
    
    await lobby.destroy();
    console.log(`🗑️ Лобби ${lobbyCode} удалено`);
    
    res.status(200).json({ message: 'Лобби удалено' });
    
  } catch (error) {
    console.error('❌ Ошибка удаления:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
