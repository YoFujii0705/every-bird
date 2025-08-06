const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment');

const HABIT_NOTIFICATION_TYPES = {
  REMINDER: 'reminder',
  MONTHLY_SUMMARY: 'monthly_summary',
  STREAK_MILESTONE: 'streak_milestone',
  LOW_COMPLETION: 'low_completion'
};

class HabitNotificationService {
  constructor(client, sheetsUtils) {
    this.client = client;
    this.sheetsUtils = sheetsUtils;
    this.scheduledJobs = new Map();
    
    console.log('🔔 HabitNotificationService初期化');
  }

  // 通知設定を作成
  async createNotification(userId, habitId, type, config) {
    try {
      const notificationId = await this.sheetsUtils.getNextId('habit_notifications');
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      const values = [
        notificationId,
        userId,
        habitId || '',
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
      
      await this.sheetsUtils.saveToSheet('habit_notifications', values);
      
      // スケジュールを設定
      await this.scheduleNotification(notificationId, userId, habitId, type, config);
      
      console.log('✅ Habit通知作成:', { notificationId, type, habitId });
      return notificationId;
    } catch (error) {
      console.error('Habit通知作成エラー:', error);
      throw error;
    }
  }

  // リマインダー通知を設定
  async setReminder(userId, habitId, time, daysOfWeek = '1,2,3,4,5', channelId) {
    return await this.createNotification(userId, habitId, HABIT_NOTIFICATION_TYPES.REMINDER, {
      time,
      daysOfWeek,
      channelId
    });
  }

  // 月末カレンダー通知を設定
  async setMonthlySummary(userId, channelId, time = '21:00') {
    return await this.createNotification(userId, null, HABIT_NOTIFICATION_TYPES.MONTHLY_SUMMARY, {
      time,
      daysOfWeek: 'last_day', // 月末を表す特別な値
      channelId
    });
  }

  // ストリークマイルストーン通知を設定
  async setStreakMilestone(userId, habitId, channelId) {
    return await this.createNotification(userId, habitId, HABIT_NOTIFICATION_TYPES.STREAK_MILESTONE, {
      channelId,
      time: '20:00', // デフォルト時刻
      daysOfWeek: '0,1,2,3,4,5,6' // 毎日チェック
    });
  }

  // 継続率アラートを設定
  async setLowCompletionAlert(userId, habitId, thresholdDays = 7, thresholdCount = 3, channelId) {
    return await this.createNotification(userId, habitId, HABIT_NOTIFICATION_TYPES.LOW_COMPLETION, {
      thresholdDays,
      thresholdCount,
      channelId,
      time: '19:00',
      daysOfWeek: '0' // 日曜日
    });
  }

  // 通知をスケジュール
  async scheduleNotification(notificationId, userId, habitId, type, config) {
    try {
      // 既存のスケジュールがあれば削除
      if (this.scheduledJobs.has(notificationId)) {
        this.scheduledJobs.get(notificationId).destroy();
      }

      let cronExpression;
      
      if (type === HABIT_NOTIFICATION_TYPES.MONTHLY_SUMMARY) {
        // 月末の指定時刻
        const [hour, minute] = config.time.split(':').map(Number);
        cronExpression = `${minute} ${hour} 28-31 * *`; // 月末数日間チェック
      } else {
        // 通常のスケジュール
        cronExpression = this.buildCronExpression(config.time, config.daysOfWeek);
      }
      
      console.log(`📅 Habit通知スケジュール設定: ${type} - ${cronExpression}`);
      
      // スケジュール設定
      const task = cron.schedule(cronExpression, async () => {
        console.log(`🔔 Habit通知実行: ${type} - User: ${userId}, Habit: ${habitId}`);
        await this.executeNotification(notificationId, userId, habitId, type, config);
      }, {
        scheduled: true,
        timezone: 'Asia/Tokyo'
      });

      this.scheduledJobs.set(notificationId, task);
    } catch (error) {
      console.error('Habit通知スケジュールエラー:', error);
    }
  }

  // cron式を構築
  buildCronExpression(time, daysOfWeek) {
    const [hour, minute] = time.split(':').map(Number);
    return `${minute} ${hour} * * ${daysOfWeek}`;
  }

  // 通知を実行
  async executeNotification(notificationId, userId, habitId, type, config) {
    try {
      const channel = await this.client.channels.fetch(config.channelId);
      if (!channel) {
        console.error(`チャンネルが見つかりません: ${config.channelId}`);
        return;
      }

      switch (type) {
        case HABIT_NOTIFICATION_TYPES.REMINDER:
          await this.sendReminderNotification(channel, userId, habitId);
          break;
        case HABIT_NOTIFICATION_TYPES.MONTHLY_SUMMARY:
          // 月末かどうかをチェック
          if (this.isLastDayOfMonth()) {
            await this.sendMonthlySummaryNotification(channel, userId);
          }
          break;
        case HABIT_NOTIFICATION_TYPES.STREAK_MILESTONE:
          await this.sendStreakMilestoneNotification(channel, userId, habitId);
          break;
        case HABIT_NOTIFICATION_TYPES.LOW_COMPLETION:
          await this.sendLowCompletionAlert(channel, userId, habitId, config);
          break;
      }

      // 最後送信日時を更新
      await this.updateLastSent(notificationId);
      
    } catch (error) {
      console.error('Habit通知実行エラー:', error);
    }
  }

  // リマインダー通知を送信
  async sendReminderNotification(channel, userId, habitId) {
    try {
      const habit = await this.sheetsUtils.getHabitById(habitId);
      if (!habit) return;

      const today = moment().format('YYYY-MM-DD');
      const todayLogs = await this.sheetsUtils.getHabitLogsForDate(userId, today);
      const alreadyDone = todayLogs.some(log => log.habitId === habitId);

      if (alreadyDone) {
        console.log('✅ 習慣既に完了済み、リマインダーをスキップ');
        return;
      }

      const difficultyEmoji = {
        'easy': '🟢',
        'normal': '🟡', 
        'hard': '🔴'
      };

      const embed = new EmbedBuilder()
        .setTitle('🔔 習慣リマインダー')
        .setDescription(`<@${userId}> **${habit.name}** の時間です！`)
        .addFields(
          { name: '📊 現在のストリーク', value: `${habit.currentStreak || 0}日連続 🔥`, inline: true },
          { name: '⚡ 難易度', value: `${difficultyEmoji[habit.difficulty] || '❓'} ${habit.difficulty}`, inline: true },
          { name: '📅 頻度', value: habit.frequency, inline: true }
        )
        .setColor('#00BCD4')
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`habit_quick_done_${habitId}`)
            .setLabel('✅ 完了！')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`habit_snooze_${habitId}`)
            .setLabel('⏰ 30分後')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('リマインダー送信エラー:', error);
    }
  }

  // 月末カレンダー通知を送信
  async sendMonthlySummaryNotification(channel, userId) {
    try {
      const now = moment();
      const year = now.year();
      const month = now.month() + 1;
      
      // 今月の習慣データを取得
      const habits = await this.sheetsUtils.getUserHabits(userId);
      if (habits.length === 0) return;

      const startDate = now.clone().startOf('month').format('YYYY-MM-DD');
      const endDate = now.format('YYYY-MM-DD');
      const habitLogs = await this.sheetsUtils.getHabitLogsInRange(userId, startDate, endDate);

      // 習慣別統計
      const habitStats = habits.map(habit => {
        const logs = habitLogs.filter(log => log.habitId === habit.id);
        const daysInMonth = now.date();
        const rate = ((logs.length / daysInMonth) * 100).toFixed(0);
        
        return {
          name: habit.name,
          rate: parseInt(rate),
          logs: logs.length,
          daysInMonth
        };
      }).sort((a, b) => b.rate - a.rate);

      const embed = new EmbedBuilder()
        .setTitle(`📅 ${year}年${month}月の習慣サマリー`)
        .setDescription(`<@${userId}> 今月の習慣達成状況をお知らせします！`)
        .setColor('#4CAF50')
        .setTimestamp();

      // 習慣別の達成率を表示
      const habitSummary = habitStats.map(stat => {
        const emoji = stat.rate >= 80 ? '🏆' : stat.rate >= 60 ? '👍' : stat.rate >= 40 ? '📈' : '💪';
        return `${emoji} **${stat.name}**: ${stat.rate}% (${stat.logs}/${stat.daysInMonth}日)`;
      }).join('\n');

      embed.addFields({ name: '📊 習慣別達成状況', value: habitSummary, inline: false });

      // 全体評価
      const averageRate = habitStats.reduce((sum, stat) => sum + stat.rate, 0) / habitStats.length;
      let overallMessage = '';
      
      if (averageRate >= 80) {
        overallMessage = '🎉 素晴らしい月でした！この調子で継続しましょう！';
      } else if (averageRate >= 60) {
        overallMessage = '👏 良い調子です！来月はさらに向上を目指しましょう！';
      } else if (averageRate >= 40) {
        overallMessage = '💪 改善の余地があります。習慣を見直してみませんか？';
      } else {
        overallMessage = '🔄 新しい月の始まりです。小さな習慣から始めてみましょう！';
      }

      embed.addFields({ name: '📝 総合評価', value: overallMessage, inline: false });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('habit_calendar_view')
            .setLabel('📅 カレンダー表示')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('habit_new_month_goals')
            .setLabel('🎯 来月の目標設定')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('月末サマリー送信エラー:', error);
    }
  }

  // ストリークマイルストーン通知を送信
  async sendStreakMilestoneNotification(channel, userId, habitId) {
    try {
      const habit = await this.sheetsUtils.getHabitById(habitId);
      if (!habit) return;

      const streak = habit.currentStreak || 0;
      
      // マイルストーンチェック
      const milestones = [7, 14, 30, 50, 100, 365];
      if (!milestones.includes(streak)) return;

      let celebrationLevel = '';
      let celebrationEmoji = '';
      let message = '';

      if (streak === 7) {
        celebrationLevel = '1週間';
        celebrationEmoji = '🎉';
        message = '素晴らしいスタートです！習慣が定着し始めています！';
      } else if (streak === 14) {
        celebrationLevel = '2週間';
        celebrationEmoji = '🌟';
        message = '継続力が身についています！この調子で頑張りましょう！';
      } else if (streak === 30) {
        celebrationLevel = '1ヶ月';
        celebrationEmoji = '🏆';
        message = '1ヶ月達成！もう立派な習慣です！';
      } else if (streak === 100) {
        celebrationLevel = '100日';
        celebrationEmoji = '💎';
        message = '100日達成！驚異的な継続力です！';
      } else if (streak === 365) {
        celebrationLevel = '1年間';
        celebrationEmoji = '👑';
        message = '1年間達成！あなたは習慣マスターです！';
      }

      const embed = new EmbedBuilder()
        .setTitle(`${celebrationEmoji} ストリーク達成！`)
        .setDescription(`<@${userId}> **${habit.name}** を${celebrationLevel}継続達成！`)
        .addFields(
          { name: '🔥 達成ストリーク', value: `${streak}日連続`, inline: true },
          { name: '🎊 お祝いメッセージ', value: message, inline: false }
        )
        .setColor('#FFD700')
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('ストリークマイルストーン送信エラー:', error);
    }
  }

  // 継続率アラートを送信
  async sendLowCompletionAlert(channel, userId, habitId, config) {
    try {
      const habit = await this.sheetsUtils.getHabitById(habitId);
      if (!habit) return;

      const endDate = moment().format('YYYY-MM-DD');
      const startDate = moment().subtract(config.thresholdDays - 1, 'days').format('YYYY-MM-DD');
      const logs = await this.sheetsUtils.getHabitLogsInRange(userId, startDate, endDate);
      const habitLogs = logs.filter(log => log.habitId === habitId);

      // 閾値チェック
      if (habitLogs.length >= config.thresholdCount) return;

      const embed = new EmbedBuilder()
        .setTitle('⚠️ 習慣継続アラート')
        .setDescription(`<@${userId}> **${habit.name}** の実行頻度が低下しています`)
        .addFields(
          { name: '📊 最近の実行状況', value: `${config.thresholdDays}日間で${habitLogs.length}回実行`, inline: true },
          { name: '🎯 推奨頻度', value: `${config.thresholdCount}回以上`, inline: true },
          { name: '💡 提案', value: '実行時間を見直したり、難易度を調整してみましょう', inline: false }
        )
        .setColor('#FF5722')
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`habit_quick_done_${habitId}`)
            .setLabel('🎯 今すぐ実行')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`habit_edit_${habitId}`)
            .setLabel('✏️ 習慣を見直す')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('継続率アラート送信エラー:', error);
    }
  }

  // ユーザーの通知設定を取得
  async getUserNotifications(userId) {
    try {
      const data = await this.sheetsUtils.getSheetData('habit_notifications', 'A:L');
      
      console.log('🔍 Habit通知一覧取得デバッグ:', {
        userId,
        dataLength: data.length,
        hasData: data.length > 1
      });
      
      const notifications = [];
      
      // ヘッダー行をスキップして処理
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[1] === userId) { // user_id列
          notifications.push({
            id: parseInt(row[0]),
            userId: row[1],
            habitId: row[2] || null,
            type: row[3],
            isEnabled: row[4] === 'TRUE',
            time: row[5],
            daysOfWeek: row[6],
            channelId: row[7],
            thresholdDays: parseInt(row[8]) || 7,
            thresholdCount: parseInt(row[9]) || 3,
            lastSent: row[10],
            createdAt: row[11]
          });
        }
      }
      
      console.log(`✅ ユーザー ${userId} のHabit通知設定: ${notifications.length}件`);
      return notifications;
      
    } catch (error) {
      console.error('ユーザーHabit通知取得エラー:', error);
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

      // シートを更新（is_enabledをFALSEに）
      await this.updateNotificationStatus(notificationId, false);
      
      return true;
    } catch (error) {
      console.error('Habit通知無効化エラー:', error);
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
        notification.habitId, 
        notification.type, 
        config
      );
      
      return true;
    } catch (error) {
      console.error('Habitテスト通知エラー:', error);
      return false;
    }
  }

  // 通知IDで通知を取得
  async getNotificationById(notificationId) {
    try {
      const data = await this.sheetsUtils.getSheetData('habit_notifications', 'A:L');
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (parseInt(row[0]) === notificationId) {
          return {
            id: parseInt(row[0]),
            userId: row[1],
            habitId: row[2] || null,
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
    } catch (error) {
      console.error('Habit通知ID取得エラー:', error);
      return null;
    }
  }

  // 全通知をロード・スケジュール
  async loadAllNotifications() {
    console.log('🔔 Habit通知をロード中...');
    
    try {
      const data = await this.sheetsUtils.getSheetData('habit_notifications', 'A:L');
      
      if (!data || data.length <= 1) {
        console.log('📋 Habit通知データがありません');
        return;
      }
      
      let loadedCount = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[4] === 'TRUE') { // is_enabled列
          const notificationId = parseInt(row[0]);
          const userId = row[1];
          const habitId = row[2] || null;
          const type = row[3];
          const config = {
            time: row[5],
            daysOfWeek: row[6],
            channelId: row[7],
            thresholdDays: parseInt(row[8]) || 7,
            thresholdCount: parseInt(row[9]) || 3
          };
          
          await this.scheduleNotification(notificationId, userId, habitId, type, config);
          loadedCount++;
        }
      }
      
      console.log(`✅ ${loadedCount}件のHabit通知をスケジュールしました`);
    } catch (error) {
      console.error('Habit通知ロードエラー:', error);
    }
  }

  // ヘルパーメソッド
  isLastDayOfMonth() {
    const now = moment();
    const lastDay = now.clone().endOf('month');
    return now.date() === lastDay.date();
  }

  async updateLastSent(notificationId) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    console.log(`📝 Habit通知送信記録更新: ${notificationId} - ${now}`);
    // TODO: 実際のシート更新処理を実装
  }

  async updateNotificationStatus(notificationId, enabled) {
    console.log(`📝 Habit通知状態更新: ${notificationId} - ${enabled ? '有効' : '無効'}`);
    // TODO: 実際のシート更新処理を実装
  }

  // 通知システムを停止
  shutdown() {
    console.log('🔔 Habit通知システムを停止中...');
    for (const [id, task] of this.scheduledJobs) {
      task.destroy();
    }
    this.scheduledJobs.clear();
    console.log('✅ Habit通知システムを停止しました');
  }
}

module.exports = {
  HabitNotificationService,
  HABIT_NOTIFICATION_TYPES
};
