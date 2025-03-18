const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  lobbyCode: {
    type: String,
    required: true
  },
  creator: {
    id: String,
    name: String
  },
  opponent: {
    id: String,
    name: String
  },
  tournamentStage: String,
  creatorFactions: [String],
  opponentFactions: [String],
  creatorBannedFaction: String,
  opponentBannedFaction: String,
  rounds: [{
    creatorFaction: String,
    opponentFaction: String,
    winner: String // 'creator' или 'opponent'
  }],
  winner: String, // 'creator' или 'opponent'
  completedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Match', MatchSchema);