const Lobby = require('../models/Lobby');

// Доступные символы для генерации кода (без похожих символов)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Генерация уникального кода лобби
const generateLobbyCode = () => {
  let result = 'GW';
  for (let i = 0; i < 4; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return result;
};

// Валидация данных создателя
const validateCreatorData = (creator) => {
  if (!creator || !creator.id) {
    return { valid: false, message: 'ID игрока обязателен' };
  }
  if (typeof creator.id !== 'string' || creator.id.length > 100) {
    return { valid: false, message: 'Некорректный ID игрока' };
  }
  return { valid: true };
};

// Создание нового лобби
exports.createLobby = async (req, res) => {
  try {
    const { creator, tournamentFormat } = req.body;
    
    // Валидация входных данных
    const validation = validateCreatorData(creator);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    
    // Проверка формата турнира
    if (tournamentFormat && !['bo3', 'bo5'].includes(tournamentFormat)) {
      return res.status(400).json({ message: 'Некорректный формат турнира' });
    }
    
    // Проверка количества активных лобби (защита от спама)
    const activeLobbiesCount = await Lobby.countDocuments();
    if (activeLobbiesCount >= 100) {
      return res.status(429).json({ 
        message: 'Достигнут лимит активных лобби. Пожалуйста, попробуйте позже.' 
      });
    }
    
    // Проверяем, есть ли уже лобби у этого создателя
    const existingLobby = await Lobby.findOne({ 
      'creator.id': creator.id,
      status: { $in: ['waiting', 'selecting-factions', 'banning'] }
    });
    
    if (existingLobby) {
      return res.status(200).json(existingLobby); // Возвращаем существующее лобби
    }
    
    // Генерируем уникальный код
    let lobbyCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      lobbyCode = generateLobbyCode();
      const existing = await Lobby.findOne({ lobbyCode });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({ message: 'Не удалось создать уникальный код лобби' });
    }
    
    // Создаем лобби
    const newLobby = new Lobby({
      lobbyCode,
      creator: {
        id: creator.id,
        name: creator.name || 'Игрок 1'
      },
      tournamentFormat: tournamentFormat || 'bo3',
      status: 'waiting',
      lastActivity: new Date()
    });
    
    await newLobby.save();
    
    console.log(`✅ Лобби ${lobbyCode} создано игроком ${creator.id}`);
    
    res.status(201).json(newLobby);
  } catch (error) {
    console.error('❌ Ошибка создания лобби:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Лобби с таким кодом уже существует' });
    }
    
    res.status(500).json({ message: 'Ошибка сервера при создании лобби' });
  }
};

// Получение данных лобби по коду
exports.getLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    
    if (!lobbyCode || lobbyCode.length > 10) {
      return res.status(400).json({ message: 'Некорректный код лобби' });
    }
    
    const lobby = await Lobby.findOne({ 
      lobbyCode: lobbyCode.toUpperCase() 
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Обновляем время активности
    lobby.lastActivity = new Date();
    await lobby.save();
    
    res.status(200).json(lobby);
  } catch (error) {
    console.error('❌ Ошибка получения лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении лобби' });
  }
};

// Присоединение к лобби
exports.joinLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { playerId, playerName } = req.body;
    
    // Валидация
    if (!playerId) {
      return res.status(400).json({ message: 'ID игрока обязателен' });
    }
    
    const lobby = await Lobby.findOne({ 
      lobbyCode: lobbyCode.toUpperCase() 
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Проверяем, является ли игрок создателем
    if (lobby.creator && lobby.creator.id === playerId) {
      lobby.lastActivity = new Date();
      await lobby.save();
      return res.status(200).json(lobby);
    }
    
    // Проверяем, является ли игрок уже оппонентом
    if (lobby.opponent && lobby.opponent.id === playerId) {
      lobby.lastActivity = new Date();
      await lobby.save();
      return res.status(200).json(lobby);
    }
    
    // Если игра уже началась, нельзя присоединиться
    if (lobby.status !== 'waiting') {
      return res.status(400).json({ 
        message: 'Нельзя присоединиться к лобби - игра уже началась' 
      });
    }
    
    // Проверяем, не занята ли позиция оппонента
    if (lobby.opponent && lobby.opponent.id) {
      return res.status(400).json({ message: 'Лобби уже заполнено' });
    }
    
    // Добавляем игрока как оппонента
    lobby.opponent = { 
      id: playerId, 
      name: playerName || 'Игрок 2' 
    };
    lobby.lastActivity = new Date();
    
    await lobby.save();
    
    console.log(`✅ Игрок ${playerId} присоединился к лобби ${lobbyCode}`);
    
    res.status(200).json(lobby);
  } catch (error) {
    console.error('❌ Ошибка присоединения к лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при присоединении к лобби' });
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
      lobbyCode: lobbyCode.toUpperCase() 
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Проверяем права (только создатель может менять статус)
    if (playerId && lobby.creator.id !== playerId) {
      return res.status(403).json({ message: 'Только создатель может изменить статус' });
    }
    
    lobby.status = status;
    lobby.lastActivity = new Date();
    
    await lobby.save();
    
    res.status(200).json(lobby);
  } catch (error) {
    console.error('❌ Ошибка обновления статуса лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при обновлении статуса лобби' });
  }
};

// Удаление лобби
exports.deleteLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { playerId } = req.body;
    
    const lobby = await Lobby.findOne({ 
      lobbyCode: lobbyCode.toUpperCase() 
    });
    
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Проверяем права (только создатель может удалить лобби)
    if (playerId && lobby.creator.id !== playerId) {
      return res.status(403).json({ message: 'Только создатель может удалить лобби' });
    }
    
    await Lobby.deleteOne({ lobbyCode: lobbyCode.toUpperCase() });
    
    console.log(`🗑️ Лобби ${lobbyCode} удалено`);
    
    res.status(200).json({ message: 'Лобби удалено' });
  } catch (error) {
    console.error('❌ Ошибка удаления лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при удалении лобби' });
  }
};
