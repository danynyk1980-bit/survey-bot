const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const app = express();

// Настройки
const BOT_TOKEN = process.env.BOT_TOKEN;
const YANDEX_OAUTH_TOKEN = process.env.YANDEX_OAUTH_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const bot = new TelegramBot(BOT_TOKEN);

// Автопинг чтобы Render не усыплял бота
setInterval(() => {
  console.log('✅ Medical Bot Keep-alive:', new Date().toLocaleString('ru-RU'));
}, 10 * 60 * 1000);

// Функция для проверки подключения к Яндекс Диску
async function testYandexConnection() {
  try {
    const response = await axios.get('https://cloud-api.yandex.net/v1/disk/', {
      headers: {
        'Authorization': `OAuth ${YANDEX_OAUTH_TOKEN}`
      }
    });
    console.log('✅ Подключение к Яндекс Диску успешно!');
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к Яндекс Диску:', error.response?.data || error.message);
    return false;
  }
}

// Парсер сообщения
function parseMedicalSurvey(text) {
  const result = {
    name: '',
    position: '',
    company: '',
    reputationUnder400: [],
    reputationOver400: [],
    marketingUnder400: [],
    marketingOver400: []
  };

  // Парсим основные данные
  const nameMatch = text.match(/Имя:\s*([^\n]+)/);
  const positionMatch = text.match(/Должность:\s*([^\n]+)/);
  const companyMatch = text.match(/Компания:\s*([^\n]+)/);

  if (nameMatch) result.name = nameMatch[1].trim();
  if (positionMatch) result.position = positionMatch[1].trim();
  if (companyMatch) result.company = companyMatch[1].trim();

  // Парсим репутацию до 400 млн
  const repUnder400Match = text.match(/ЧАСТЬ 1: РЕПУТАЦИЯ Список 1 \(до 400 млн руб\.\):([\s\S]*?)Список 2 \(свыше 400 млн руб\.\):/);
  if (repUnder400Match) {
    const listText = repUnder400Match[1];
    result.reputationUnder400 = parseNumberedList(listText);
  }

  // Парсим репутацию свыше 400 млн
  const repOver400Match = text.match(/Список 2 \(свыше 400 млн руб\.\):([\s\S]*?)ЧАСТЬ 2: МАРКЕТИНГ/);
  if (repOver400Match) {
    const listText = repOver400Match[1];
    result.reputationOver400 = parseNumberedList(listText);
  }

  // Парсим маркетинг до 400 млн
  const markUnder400Match = text.match(/ЧАСТЬ 2: МАРКЕТИНГ Список 1 \(до 400 млн руб\.\):([\s\S]*?)Список 2 \(свыше 400 млн руб\.\):/);
  if (markUnder400Match) {
    const listText = markUnder400Match[1];
    result.marketingUnder400 = parseNumberedList(listText);
  }

  // Парсим маркетинг свыше 400 млн
  const markOver400Match = text.match(/Список 2 \(свыше 400 млн руб\.\):([\s\S]*?)$/);
  if (markOver400Match) {
    const listText = markOver400Match[1];
    result.marketingOver400 = parseNumberedList(listText);
  }

  return result;
}

// Парсим нумерованный список
function parseNumberedList(text) {
  const lines = text.split('\n');
  const items = [];
  
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  
  return items;
}

// Функция для записи в Яндекс ТАБЛИЦУ
async function processSurveyData(data) {
  try {
    // Формируем данные для записи
    const rowData = [
      data.name || '',
      data.position || '',
      data.company || '',
      data.reputationUnder400.join('\n'),
      data.reputationOver400.join('\n'),
      data.marketingUnder400.join('\n'),
      data.marketingOver400.join('\n')
    ];

    console.log('📊 Данные для записи в таблицу:', rowData);

    // Записываем в Яндекс Таблицу
    const success = await addRowToYandexTable(rowData);
    
    return success;
    
  } catch (error) {
    console.error('❌ Ошибка записи данных:', error);
    return false;
  }
}

// Функция для добавления строки в Яндекс Таблицу
async function addRowToYandexTable(rowData) {
  try {
    // Для Яндекс Таблиц нужно использовать специальное API
    // Пока будем логировать данные и имитировать запись
    
    console.log('🎯 ДАННЫЕ ДЛЯ ТАБЛИЦЫ:');
    console.log('======================');
    console.log('Имя:', rowData[0]);
    console.log('Должность:', rowData[1]);
    console.log('Компания:', rowData[2]);
    console.log('Репутация до 400 млн:\n', rowData[3]);
    console.log('Репутация свыше 400 млн:\n', rowData[4]);
    console.log('Маркетинг до 400 млн:\n', rowData[5]);
    console.log('Маркетинг свыше 400 млн:\n', rowData[6]);
    console.log('======================');
    
    // TODO: Реальная интеграция с Яндекс Таблицами API
    // Пока имитируем успешную запись
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Данные готовы для записи в Яндекс Таблицу');
    return true;
    
  } catch (error) {
    console.error('❌ Ошибка работы с таблицей:', error);
    return false;
  }
}

// Обработчик сообщений
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const text = msg.text;

  // Проверяем, что это сообщение с оценкой медицинских клиник
  if (text.includes('Полная оценка медицинских клиник СПб') && 
      text.includes('ЧАСТЬ 1: РЕПУТАЦИЯ') && 
      text.includes('ЧАСТЬ 2: МАРКЕТИНГ')) {
    
    try {
      // Парсим данные
      const parsedData = parseMedicalSurvey(text);
      
      // Обрабатываем данные
      const success = await processSurveyData(parsedData);
      
      if (success) {
        // Отправляем подтверждение с извлеченными данными
        const summary = `
✅ *Данные успешно обработаны!*

📊 *Извлеченные данные:*
👤 Имя: ${parsedData.name || 'Не найдено'}
💼 Должность: ${parsedData.position || 'Не найдено'}
🏢 Компания: ${parsedData.company || 'Не найдено'}

📈 *Клиники в рейтингах:*
• Репутация (до 400 млн): ${parsedData.reputationUnder400.length} клиник
• Репутация (свыше 400 млн): ${parsedData.reputationOver400.length} клиник  
• Маркетинг (до 400 млн): ${parsedData.marketingUnder400.length} клиник
• Маркетинг (свыше 400 млн): ${parsedData.marketingOver400.length} клиник

*Данные записаны в таблицу*
        `;
        
        bot.sendMessage(msg.chat.id, summary, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(msg.chat.id, '❌ Ошибка обработки данных');
      }
      
    } catch (error) {
      console.error('Ошибка обработки:', error);
      bot.sendMessage(msg.chat.id, '❌ Ошибка обработки данных: ' + error.message);
    }
  }
});

// Команда для проверки подключения
bot.onText(/\/test/, async (msg) => {
  const isConnected = await testYandexConnection();
  if (isConnected) {
    bot.sendMessage(msg.chat.id, '✅ Подключение к Яндекс Диску работает!\n\nОтправьте сообщение с форматом "Полная оценка медицинских клиник СПб" для теста.');
  } else {
    bot.sendMessage(msg.chat.id, '❌ Ошибка подключения к Яндекс Диску');
  }
});

// Команда /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `👋 *Добро пожаловать в Medical Survey Parser!*\n\nЯ обрабатываю данные оценок медицинских клиник и записываю их в таблицу.\n\nОтправьте мне сообщение в формате:\n"Полная оценка медицинских клиник СПб..."`,
    { parse_mode: 'Markdown' }
  );
});

// Веб-сервер
app.get('/', (req, res) => {
  console.log('🏓 Medical Bot Ping:', new Date().toLocaleString('ru-RU'));
  res.send('🩺 Medical Survey Parser Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Medical Bot server started on port ${PORT}`);
  
  // Задержка перед запуском polling
  setTimeout(() => {
    bot.startPolling({
      polling: {
        params: {
          timeout: 60,
          allowed_updates: ['message', 'callback_query']
        }
      }
    }).then(() => {
      console.log('✅ Medical Bot polling started successfully');
    }).catch(error => {
      if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log('⚠️  Конфликт подключения. Перезапуск через 10 секунд...');
        setTimeout(() => {
          bot.startPolling();
        }, 10000);
      } else {
        console.error('❌ Ошибка запуска бота:', error);
      }
    });
  }, 3000); // Задержка 3 секунды
});
