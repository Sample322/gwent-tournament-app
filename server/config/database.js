const { Sequelize } = require('sequelize');

// Создание подключения к PostgreSQL
// Поддерживаем оба варианта: DATABASE_URL (одна строка) или отдельные переменные
let sequelize;

if (process.env.DATABASE_URL) {
  // Формат: postgresql://user:password@host:port/database
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: process.env.DATABASE_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  // Отдельные переменные окружения
  sequelize = new Sequelize(
    process.env.DB_NAME || 'gwent',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      dialectOptions: {
        ssl: process.env.DATABASE_SSL === 'true' ? {
          require: true,
          rejectUnauthorized: false
        } : false
      },
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

// Функция подключения с повторными попытками
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      console.log('✅ PostgreSQL подключено успешно');
      
      // Синхронизация моделей с базой данных
      // alter: true - обновит таблицы без потери данных
      await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Модели синхронизированы с базой данных');
      
      return true;
    } catch (err) {
      console.error(`❌ Попытка ${i + 1}/${retries} подключения к PostgreSQL не удалась:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Повторная попытка через ${delay / 1000} секунд...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Не удалось подключиться к PostgreSQL после всех попыток');
  return false;
};

module.exports = { sequelize, connectWithRetry };
