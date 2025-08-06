const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');

const NOTIFICATION_TYPES = {
  REMINDER: 'reminder',
  WEEKLY_REPORT: 'weekly_report',
  LOW_COMPLETION: 'low_completion'
};

class RoutineNotificationService {
  constructor(client, routineService) {
    this.client = client;
    this.routineService = routineService;
    
    // GoogleSheetsServiceの取得方法を修正
    if (routineService && routineService.googleSheetsService) {
      this.googleSheetsService = routineService.googleSheetsService;
    } else if (routineService) {
      // routineServiceがGoogleSheetsServiceを直接継承している場合
      this.googleSheetsService = routineService;
    } else {
      console.error('❌ GoogleSheetsServiceが見つかりません');
      // 直接インスタンスを作成
      const GoogleSheetsService = require('../utils/sheets');
      this.googleSheetsService = new GoogleSheetsService();
    }
    
    this.scheduledJobs = new Map();
    
    console.log('🔍 GoogleSheetsService初期化状況:', {
      hasRoutineService: !!routineService,
      hasGoogleSheetsService: !!this.googleSheetsService,
      googleSheetsServiceType: this.googleSheetsService?.constructor?.name
    });
  }
  // 通知設定を作成
  async createNotification(userId, routineId, type, config) {
    const notificationId = await this.googleSheetsService.getNextId('routine_notifications');
    const now = new Date().toISOString();
    
    const values = [
      notificationId,
      userId,
      routineId,
      type,
      'TRUE', // is_enabled
      config.time || '',
      config.daysOfWeek || '',
      config.channelId || '',
      config.thresholdDays || 7,
      config.thresholdCount || 3,
      '', // last_sent
      now   // created_at
    ];
    
    await this.googleSheetsService.appendData('routine_notifications!A:L', values);
    
    // スケジュールを設定
    await this.scheduleNotification(notificationId, userId, routineId, type, config);
    
    return notificationId;
  }

  // リマインダー通知を設定
  async setReminder(userId, routineId, time, daysOfWeek = '1,2,3,4,5', channelId) {
    return await this.createNotification(userId, routineId, NOTIFICATION_TYPES.REMINDER, {
      time,
      daysOfWeek,
      channelId
    });
  }

  // 週次レポート通知を設定  
  async setWeeklyReport(userId, routineId, dayOfWeek = '0', time = '20:00', channelId) {
    return await this.createNotification(userId, routineId, NOTIFICATION_TYPES.WEEKLY_REPORT, {
      time,
      daysOfWeek: dayOfWeek,
      channelId
    });
  }

  // 継続率アラートを設定
  async setLowCompletionAlert(userId, routineId, thresholdDays = 7, thresholdCount = 3, channelId) {
    return await this.createNotification(userId, routineId, NOTIFICATION_TYPES.LOW_COMPLETION, {
      thresholdDays,
      thresholdCount,
      channelId,
      time: '19:00',
      daysOfWeek: '0' // 日曜日
    });
  }

  // 通知をスケジュール
  async scheduleNotification(notificationId, userId, routineId, type, config) {
    // 既存のスケジュールがあれば削除
    if (this.scheduledJobs.has(notificationId)) {
      this.scheduledJobs.get(notificationId).destroy();
    }

    // cron式を生成
    const cronExpression = this.buildCronExpression(config.time, config.daysOfWeek);
    
    console.log(`📅 通知スケジュール設定: ${type} - ${cronExpression}`);
    
    // スケジュール設定
    const task = cron.schedule(cronExpression, async () => {
      console.log(`🔔 通知実行: ${type} - User: ${userId}, Routine: ${routineId}`);
      await this.executeNotification(notificationId, userId, routineId, type, config);
    }, {
      scheduled: true,
      timezone: 'Asia/Tokyo'
    });

    this.scheduledJobs.set(notificationId, task);
  }

  // cron式を構築
  buildCronExpression(time, daysOfWeek) {
    const [hour, minute] = time.split(':').map(Number);
    
    // 分 時 日 月 曜日
    return `${minute} ${hour} * * ${daysOfWeek}`;
  }

  // 通知を実行
  async executeNotification(notificationId, userId, routineId, type, config) {
    try {
      const channel = await this.client.channels.fetch(config.channelId);
      if (!channel) {
        console.error(`チャンネルが見つかりません: ${config.channelId}`);
        return;
      }

      switch (type) {
        case NOTIFICATION_TYPES.REMINDER:
          await this.sendReminderNotification(channel, userId, routineId);
          break;
        case NOTIFICATION_TYPES.WEEKLY_REPORT:
          await this.sendWeeklyReportNotification(channel, userId, routineId);
          break;
        case NOTIFICATION_TYPES.LOW_COMPLETION:
          await this.sendLowCompletionAlert(channel, userId, routineId, config);
          break;
      }

      // 最後送信日時を更新
      await this.updateLastSent(notificationId);
      
    } catch (error) {
      console.error('通知実行エラー:', error);
    }
  }

  // リマインダー通知を送信
  async sendReminderNotification(channel, userId, routineId) {
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) return;

    const embed = new EmbedBuilder()
      .setTitle('🔔 ルーティン実行リマインダー')
      .setDescription(`<@${userId}> **${routineInfo.name}** の時間です！`)
      .addFields(
        { name: '📝 説明', value: routineInfo.description || 'なし', inline: false },
        { name: '⏱️ 予想時間', value: `${routineInfo.estimatedDuration || '?'}分`, inline: true }
      )
      .setColor('#00BCD4')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`routine_start_${routineId}`)
          .setLabel('🎯 今すぐ開始')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`routine_snooze_${routineId}`)
          .setLabel('⏰ 10分後')
          .setStyle(ButtonStyle.Secondary)
      );

    await channel.send({ embeds: [embed], components: [row] });
  }

 // 週次レポート通知を送信（時間計算修正版）
async sendWeeklyReportNotification(channel, userId, routineId) {
  const routineInfo = await this.routineService.getRoutineInfo(routineId);
  if (!routineInfo) return;

  const history = await this.routineService.getRoutineExecutionHistory(routineId, 7);
  
  // 手動で統計を計算（安全な時間計算を使用）
  const completed = history.filter(ex => ex.status === 'completed').length;
  const totalExecutions = history.length;
  const completionRate = totalExecutions > 0 ? Math.round((completed / totalExecutions) * 100) : 0;

  // 安全な平均時間計算
  let avgDuration = 0;
  const validDurations = [];
  
  history.forEach(ex => {
    if (ex.status === 'completed' && ex.startTime && ex.endTime) {
      const duration = this.calculateSafeExecutionTime(ex.startTime, ex.endTime);
      if (duration > 0) {
        validDurations.push(duration);
      }
    }
  });
  
  if (validDurations.length > 0) {
    avgDuration = Math.round(validDurations.reduce((sum, d) => sum + d, 0) / validDurations.length);
  }

  // パフォーマンス評価
  let performanceEmoji = '';
  let performanceText = '';
  if (completionRate >= 80) {
    performanceEmoji = '🏆';
    performanceText = '素晴らしい継続率です！';
  } else if (completionRate >= 60) {
    performanceEmoji = '👍';
    performanceText = '良いペースで続けています';
  } else if (completionRate >= 40) {
    performanceEmoji = '📈';
    performanceText = '来週はもう少し頑張りましょう';
  } else {
    performanceEmoji = '💪';
    performanceText = '継続を頑張りましょう！';
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 週次レポート - ${routineInfo.name}`)
    .setDescription(`<@${userId}> 今週のルーティン実行状況をお知らせします`)
    .addFields(
      { name: '📈 実行回数', value: `${totalExecutions}回`, inline: true },
      { name: '✅ 完了回数', value: `${completed}回`, inline: true },
      { name: '📊 完了率', value: `${completionRate}%`, inline: true },
      { name: '⏰ 平均時間', value: avgDuration > 0 ? `${avgDuration}分` : '記録なし', inline: true },
      { name: `${performanceEmoji} 評価`, value: performanceText, inline: false }
    )
    .setColor(completionRate >= 60 ? '#4CAF50' : '#FF9800')
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// 安全な実行時間計算メソッド（経過時間形式対応版）
calculateSafeExecutionTime(startTime, endTime) {
  try {
    console.log('🔍 時間計算デバッグ:', { startTime, endTime });
    
    // 時間データが無効な場合は0を返す
    if (!endTime || endTime === '' || endTime === '00:00') {
      console.log('⚠️ 無効なend_time:', endTime);
      return 0;
    }
    
    // end_timeが経過時間（MM:SS または HH:MM 形式）の場合
    if (endTime.includes(':')) {
      const parts = endTime.split(':');
      
      if (parts.length === 2) {
        const first = parseInt(parts[0]);
        const second = parseInt(parts[1]);
        
        // データの範囲から判断
        if (first <= 23 && second <= 59) {
          // 実行時間が6時間未満の場合は MM:SS として解釈
          if (first < 6) {
            const minutes = first;
            const seconds = second;
            const totalMinutes = minutes + (seconds / 60);
            
            console.log('✅ MM:SS形式として解釈:', { minutes, seconds, totalMinutes });
            return Math.round(totalMinutes);
          } 
          // 6時間以上の場合は HH:MM として解釈（異常値として0を返す）
          else {
            console.log('⚠️ 異常な実行時間（6時間以上）:', first);
            return 0;
          }
        }
      }
    }
    
    // 数値のみの場合（分として解釈）
    const numericValue = parseFloat(endTime);
    if (!isNaN(numericValue) && numericValue > 0 && numericValue < 360) { // 6時間未満
      console.log('✅ 数値として解釈:', numericValue);
      return Math.round(numericValue);
    }
    
    console.log('⚠️ 解釈できない形式:', endTime);
    return 0;
    
  } catch (error) {
    console.error('時間計算エラー:', error);
    return 0;
  }
}

  // 継続率アラートを送信
  async sendLowCompletionAlert(channel, userId, routineId, config) {
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) return;

    const history = await this.routineService.getRoutineExecutionHistory(routineId, config.thresholdDays);
    const completed = history.filter(ex => ex.status === 'completed').length;

    // 閾値チェック
    if (completed >= config.thresholdCount) return;

    const embed = new EmbedBuilder()
      .setTitle('⚠️ ルーティン継続アラート')
      .setDescription(`<@${userId}> **${routineInfo.name}** の実行頻度が低下しています`)
      .addFields(
        { name: '📊 最近の実行状況', value: `${config.thresholdDays}日間で${completed}回実行`, inline: true },
        { name: '🎯 目標', value: `${config.thresholdCount}回以上`, inline: true },
        { name: '💡 提案', value: 'ルーティンを見直したり、時間を調整してみましょう', inline: false }
      )
      .setColor('#FF5722')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`routine_start_${routineId}`)
          .setLabel('🎯 今すぐ実行')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`routine_info_${routineId}`)
          .setLabel('📄 ルーティン詳細')
          .setStyle(ButtonStyle.Secondary)
      );

    await channel.send({ embeds: [embed], components: [row] });
  }

  // ユーザーの通知設定を取得
// ユーザーの通知設定を取得
async getUserNotifications(userId) {
  try {
    const data = await this.googleSheetsService.getData('routine_notifications!A:L');
    
    console.log('🔍 通知一覧取得デバッグ:', {
      userId,
      dataLength: data.length,
      hasData: data.length > 1,
      headers: data[0]
    });
    
    const notifications = [];
    
    // ヘッダー行をスキップして処理
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      console.log(`🔍 行${i}をチェック:`, { rowUserId: row[1], targetUserId: userId, match: row[1] === userId });
      
      if (row[1] === userId) { // user_id列（B列、インデックス1）
        notifications.push({
          id: parseInt(row[0]),           // notification_id
          userId: row[1],                 // user_id
          routineId: parseInt(row[2]),    // routine_id
          type: row[3],                   // notification_type
          isEnabled: row[4] === 'TRUE',   // is_enabled
          time: row[5],                   // notification_time
          daysOfWeek: row[6],             // days_of_week
          channelId: row[7],              // channel_id
          thresholdDays: parseInt(row[8]) || 7,    // threshold_days
          thresholdCount: parseInt(row[9]) || 3,   // threshold_count
          lastSent: row[10],              // last_sent
          createdAt: row[11]              // created_at
        });
      }
    }
    
    console.log(`✅ ユーザー ${userId} の通知設定: ${notifications.length}件`);
    return notifications;
    
  } catch (error) {
    console.error('ユーザー通知取得エラー:', error);
    return [];
  }
} 


  // 通知を無効化
  async disableNotification(notificationId, userId) {
    try {
      // 通知の所有者確認
      const notification = await this.getNotificationById(notificationId);
      if (!notification || notification.userId !== userId) {
        return false;
      }

      // スケジュール停止
      if (this.scheduledJobs.has(notificationId)) {
        this.scheduledJobs.get(notificationId).destroy();
        this.scheduledJobs.delete(notificationId);
      }

      // シートを更新
      await this.updateNotificationStatus(notificationId, false);
      
      return true;
    } catch (error) {
      console.error('通知無効化エラー:', error);
      return false;
    }
  }

  // テスト通知を送信
  async testNotification(notificationId, userId) {
    try {
      const notification = await this.getNotificationById(notificationId);
      if (!notification || notification.userId !== userId) {
        return false;
      }

      const config = {
        time: notification.time,
        daysOfWeek: notification.daysOfWeek,
        channelId: notification.channelId,
        thresholdDays: notification.thresholdDays,
        thresholdCount: notification.thresholdCount
      };

      await this.executeNotification(
        notificationId, 
        notification.userId, 
        notification.routineId, 
        notification.type, 
        config
      );
      
      return true;
    } catch (error) {
      console.error('テスト通知エラー:', error);
      return false;
    }
  }

  // 通知IDで通知を取得
  async getNotificationById(notificationId) {
    const data = await this.googleSheetsService.getData('routine_notifications!A:L');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (parseInt(row[0]) === notificationId) {
        return {
          id: parseInt(row[0]),
          userId: row[1],
          routineId: parseInt(row[2]),
          type: row[3],
          isEnabled: row[4] === 'TRUE',
          time: row[5],
          daysOfWeek: row[6],
          channelId: row[7],
          thresholdDays: parseInt(row[8]) || 7,
          thresholdCount: parseInt(row[9]) || 3,
          lastSent: row[10],
          createdAt: row[11]
        };
      }
    }
    
    return null;
  }

  // 通知状態を更新
  async updateNotificationStatus(notificationId, enabled) {
    // Google Sheetsの該当行を更新
    // 実装は省略（シートの行を特定して更新）
    console.log(`📝 通知状態更新: ${notificationId} - ${enabled ? '有効' : '無効'}`);
  }

  // 最後送信日時を更新
  async updateLastSent(notificationId) {
    const now = new Date().toISOString();
    // Google Sheetsの該当行を更新
    console.log(`📝 通知送信記録更新: ${notificationId} - ${now}`);
  }

   // 全通知をロード・スケジュール
// 全通知をロード・スケジュール
async loadAllNotifications() {
  console.log('🔔 ルーティン通知をロード中...');
  
  try {
    const data = await this.googleSheetsService.getData('routine_notifications!A:L');
    
    if (!data || data.length <= 1) {
      console.log('📋 通知データがありません（ヘッダーのみまたは空）');
      return;
    }
    
    let loadedCount = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[4] === 'TRUE') { // is_enabled列（E列、インデックス4）
        const notificationId = parseInt(row[0]);
        const userId = row[1];
        const routineId = parseInt(row[2]);
        const type = row[3];
        const config = {
          time: row[5],
          daysOfWeek: row[6],
          channelId: row[7],
          thresholdDays: parseInt(row[8]) || 7,
          thresholdCount: parseInt(row[9]) || 3
        };
        
        await this.scheduleNotification(notificationId, userId, routineId, type, config);
        loadedCount++;
      }
    }
    
    console.log(`✅ ${loadedCount}件のルーティン通知をスケジュールしました`);
  } catch (error) {
    console.error('通知ロードエラー:', error);
  }

}
  // 通知システムを停止
  shutdown() {
    console.log('🔔 ルーティン通知システムを停止中...');
    for (const [id, task] of this.scheduledJobs) {
      task.destroy();
    }
    this.scheduledJobs.clear();
    console.log('✅ ルーティン通知システムを停止しました');
  }
}

module.exports = {
  RoutineNotificationService,
  NOTIFICATION_TYPES
};
