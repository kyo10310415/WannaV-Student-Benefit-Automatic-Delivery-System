const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

let discordClient = null;

// Discord Botクライアント初期化
function initializeDiscordBot() {
  return new Promise((resolve, reject) => {
    try {
      if (discordClient && discordClient.isReady()) {
        console.log('✅ Discord Botは既に接続済みです');
        resolve(discordClient);
        return;
      }

      discordClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages
        ]
      });

      discordClient.once('ready', () => {
        console.log(`✅ Discord Bot準備完了: ${discordClient.user.tag}`);
        resolve(discordClient);
      });

      discordClient.on('error', (error) => {
        console.error('❌ Discord Botエラー:', error);
      });

      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        throw new Error('DISCORD_BOT_TOKENが設定されていません');
      }

      discordClient.login(token).catch((error) => {
        console.error('❌ Discord Botログインエラー:', error);
        if (discordClient) {
          discordClient.destroy();
          discordClient = null;
        }
        reject(error);
      });
    } catch (error) {
      console.error('❌ Discord Bot初期化エラー:', error);
      reject(error);
    }
  });
}

// Discord チャンネルURLからチャンネルIDを抽出
function extractChannelId(channelUrl) {
  if (!channelUrl) return null;
  
  // URL形式: https://discord.com/channels/SERVER_ID/CHANNEL_ID
  const match = channelUrl.match(/channels\/(\d+)\/(\d+)/);
  if (match && match[2]) {
    return match[2];
  }
  
  // 直接IDが渡された場合
  if (/^\d+$/.test(channelUrl)) {
    return channelUrl;
  }
  
  return null;
}

// Discordチャンネルにメッセージを送信
async function sendDiscordMessage(channelUrl, message, imageData = null) {
  try {
    if (!discordClient || !discordClient.isReady()) {
      await initializeDiscordBot();
    }

    const channelId = extractChannelId(channelUrl);
    if (!channelId) {
      throw new Error(`無効なチャンネルURL: ${channelUrl}`);
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`チャンネルが見つかりません: ${channelId}`);
    }

    // テキストメッセージを送信
    const messageOptions = { content: message };
    
    // 画像データがある場合は添付
    if (imageData) {
      // BufferまたはURLに対応
      if (Buffer.isBuffer(imageData)) {
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageData, { name: 'benefit_image.png' });
        messageOptions.files = [attachment];
      } else if (typeof imageData === 'string') {
        // URLの場合
        messageOptions.files = [imageData];
      }
    }

    const sentMessage = await channel.send(messageOptions);
    console.log(`✅ Discordメッセージ送信成功: チャンネルID ${channelId}`);
    
    return {
      success: true,
      messageId: sentMessage.id,
      channelId: channelId
    };
  } catch (error) {
    console.error('❌ Discordメッセージ送信エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 複数メッセージを連続送信
async function sendMultipleMessages(channelUrl, messages) {
  const results = [];
  
  for (const msg of messages) {
    const result = await sendDiscordMessage(
      channelUrl,
      msg.text,
      msg.imageUrl
    );
    results.push(result);
    
    // 連続送信時の負荷軽減のため少し待機
    if (messages.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

// Bot接続終了
function disconnectBot() {
  if (discordClient) {
    discordClient.destroy();
    discordClient = null;
    console.log('✅ Discord Bot切断完了');
  }
}

module.exports = {
  initializeDiscordBot,
  sendDiscordMessage,
  sendMultipleMessages,
  disconnectBot
};
