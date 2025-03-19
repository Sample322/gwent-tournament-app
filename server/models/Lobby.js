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
  tournamentStage: {
    type: String,
    enum: ['quarter-finals', 'semi-finals', 'finals'],
    default: 'quarter-finals'
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
    expires: 86400 // Автоматическое удаление лобби через 24 часа
  }
});

module.exports = mongoose.model('Lobby', LobbySchema);