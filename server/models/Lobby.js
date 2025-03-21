const mongoose = require('mongoose');

const LobbySchema = new mongoose.Schema({
  lobbyCode: {
    type: String,
    required: true,
    unique: true
  },
  creator: {
    id: String,
    name: String
  },
  opponent: {
    id: String,
    name: String
  },
  spectators: [{
    id: String,
    name: String
  }],
  tournamentFormat: {
    type: String,
    enum: ['bo3', 'bo5'],
    default: 'bo3'
  },
  creatorSelectedFactions: {
    type: [String],
    default: []
  },
  opponentSelectedFactions: {
    type: [String],
    default: []
  },
  creatorBannedFaction: {
    type: String,
    default: null
  },
  opponentBannedFaction: {
    type: String,
    default: null
  },
  creatorRemainingFactions: {
    type: [String],
    default: []
  },
  opponentRemainingFactions: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['waiting', 'selecting-factions', 'banning', 'match-results'],
    default: 'waiting'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7200 // Автоматическое удаление лобби через 2 часа вместо 24 часов (86400)
  }
});

// Добавляем индекс для быстрого поиска
LobbySchema.index({ lobbyCode: 1 }, { unique: true });

module.exports = mongoose.model('Lobby', LobbySchema);