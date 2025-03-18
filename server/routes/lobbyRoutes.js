const express = require('express');
const router = express.Router();
const lobbyController = require('../controllers/lobbyController');

// Маршруты API
router.post('/', lobbyController.createLobby);
router.get('/:lobbyCode', lobbyController.getLobby);
router.put('/:lobbyCode/join', lobbyController.joinLobby);
router.put('/:lobbyCode/status', lobbyController.updateLobbyStatus);

module.exports = router;