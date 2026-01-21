const express = require('express');
const router = express.Router();
const lobbyController = require('../controllers/lobbyController');

// Создание нового лобби
router.post('/', lobbyController.createLobby);

// Получение информации о лобби
router.get('/:lobbyCode', lobbyController.getLobby);

// Присоединение к лобби
router.put('/:lobbyCode/join', lobbyController.joinLobby);

// Обновление статуса лобби
router.put('/:lobbyCode/status', lobbyController.updateLobbyStatus);

// Удаление лобби
router.delete('/:lobbyCode', lobbyController.deleteLobby);

module.exports = router;
