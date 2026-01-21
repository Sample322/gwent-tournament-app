/**
 * Скрипт для ручной синхронизации моделей с базой данных
 * Запуск: npm run db:sync
 */

require('dotenv').config();
const { sequelize, connectWithRetry } = require('../config/database');
require('../models/Lobby');
require('../models/Match');

async function syncDatabase() {
  console.log('🔄 Начинаю синхронизацию базы данных...\n');
  
  const connected = await connectWithRetry(3, 3000);
  
  if (!connected) {
    console.error('❌ Не удалось подключиться к базе данных');
    process.exit(1);
  }
  
  try {
    // force: true - пересоздаст все таблицы (УДАЛИТ ВСЕ ДАННЫЕ!)
    // alter: true - обновит структуру без потери данных
    await sequelize.sync({ alter: true });
    
    console.log('\n✅ Синхронизация завершена успешно!');
    console.log('📋 Созданы/обновлены таблицы:');
    console.log('   - lobbies');
    console.log('   - matches');
    
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

syncDatabase();
