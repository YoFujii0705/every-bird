const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class HabitNotificationsHandler {
  constructor(habitNotificationService, sheetsUtils) {
    this.habitNotificationService = habitNotificationService;
    this.sheetsUtils = sheetsUtils;
  }

  /**
   * 習慣通知コマンドのメインハンドラー
   */
  async handleHabitNotifyCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      switch (subcommand) {
        case 'reminder':
          return await this.handleNotifyReminder(interaction);
        case 'monthly':
          return await this.handleNotifyMonthly(interaction);
        case 'milestone':
          return await this.handleNotifyMilestone(interaction);
        case 'alert':
          return await this.handleNotifyAlert(interaction);
        case 'list':
          return await this.handleNotifyList(interaction);
        case 'disable':
          return await this.handleNotifyDisable(interaction);
        case 'test':
          return await this.handleNotifyTest(interaction);
        default:
          return await interaction.reply({
            content: '❌ 不明な通知サブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('習慣通知コマンドエラー:', error);
      return await interaction.reply({
        content: '❌ 通知コマンドの実行中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }

  // リマインダー設定
  async handleNotifyReminder(interaction) {
    const userId = interaction.user.id;
    const habitName = interaction.options.getString('habit_name');
    const time = interaction.options.getString('time');
    const days = interaction.options.getString('days') || '1,2,3,4,5';
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await interaction.deferReply();

      // 時刻形式チェック
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        return await interaction.editReply({
          content: '❌ 時刻の形式が正しくありません。例: 07:00',
        });
      }

      // 習慣が指定されている場合は存在チェック
      let habitId = null;
      if (habitName) {
        const habit = await this.sheetsUtils.getHabitByName(userId, habitName);
        if (!habit) {
          return await interaction.editReply({
            content: `❌ 習慣「${habitName}」が見つかりません。`,
          });
        }
        habitId = habit.id;
      }

      // 通知設定を作成
      const notificationId = await this.habitNotificationService.setReminder(
        userId, habitId, time, days, channel.id
      );

      const dayNames = {
        '0': '日', '1': '月', '2': '火', '3': '水', 
        '4': '木', '5': '金', '6': '土'
      };
      const dayText = days.split(',').map(d => dayNames[d]).join('・');

      const embed = new EmbedBuilder()
        .setTitle('✅ 習慣リマインダーを設定しました！')
        .setDescription(habitName ? 
          `**${habitName}** のリマインダーを設定しました。` :
          '全習慣のリマインダーを設定しました。'
        )
        .addFields(
          { name: '⏰ 通知時刻', value: time, inline: true },
          { name: '📅 曜日', value: dayText, inline: true },
          { name: '📍 通知先', value: `<#${channel.id}>`, inline: true },
          { name: '🆔 通知ID', value: notificationId.toString(), inline: true }
        )
        .setColor('#00BCD4')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('リマインダー設定エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ リマインダーの設定に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // 月末サマリー設定
  async handleNotifyMonthly(interaction) {
    const userId = interaction.user.id;
    const enabled = interaction.options.getBoolean('enabled') ?? true;
    const time = interaction.options.getString('time') || '21:00';
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await interaction.deferReply();

      if (!enabled) {
        // 月末サマリーを無効化
        const notifications = await this.habitNotificationService.getUserNotifications(userId);
        const monthlyNotifications = notifications.filter(n => n.type === 'monthly_summary');
        
        let disabledCount = 0;
        for (const notification of monthlyNotifications) {
          await this.habitNotificationService.disableNotification(notification.id, userId);
          disabledCount++;
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ 月末サマリーを無効化しました')
          .setDescription(`${disabledCount}件の月末サマリー通知を無効化しました。`)
          .setColor('#FF5722');

        return await interaction.editReply({ embeds: [embed] });
      }

      // 月末サマリーを設定
      const notificationId = await this.habitNotificationService.setMonthlySummary(
        userId, channel.id, time
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ 月末サマリーを設定しました！')
        .setDescription('毎月末に習慣の達成状況をカレンダー形式でお知らせします。')
        .addFields(
          { name: '⏰ 通知時刻', value: `毎月末 ${time}`, inline: true },
          { name: '📍 通知先', value: `<#${channel.id}>`, inline: true },
          { name: '🆔 通知ID', value: notificationId.toString(), inline: true }
        )
        .setColor('#4CAF50')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('月末サマリー設定エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ 月末サマリーの設定に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // マイルストーン通知設定
  async handleNotifyMilestone(interaction) {
    const userId = interaction.user.id;
    const habitName = interaction.options.getString('habit_name');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await interaction.deferReply();

      // 習慣存在チェック
      const habit = await this.sheetsUtils.getHabitByName(userId, habitName);
      if (!habit) {
        return await interaction.editReply({
          content: `❌ 習慣「${habitName}」が見つかりません。`,
        });
      }

      // マイルストーン通知を設定
      const notificationId = await this.habitNotificationService.setStreakMilestone(
        userId, habit.id, channel.id
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ ストリークマイルストーン通知を設定しました！')
        .setDescription(`**${habit.name}** のストリーク達成時にお祝いメッセージをお送りします。`)
        .addFields(
          { name: '🎯 対象習慣', value: habit.name, inline: true },
          { name: '🏆 マイルストーン', value: '7日・14日・30日・100日・365日', inline: true },
          { name: '📍 通知先', value: `<#${channel.id}>`, inline: true },
          { name: '🆔 通知ID', value: notificationId.toString(), inline: true }
        )
        .setColor('#FFD700')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('マイルストーン設定エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ マイルストーン通知の設定に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // 継続率アラート設定
  async handleNotifyAlert(interaction) {
    const userId = interaction.user.id;
    const habitName = interaction.options.getString('habit_name');
    const thresholdDays = interaction.options.getInteger('threshold_days') || 7;
    const thresholdCount = interaction.options.getInteger('threshold_count') || 3;
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await interaction.deferReply();

      // 習慣存在チェック
      const habit = await this.sheetsUtils.getHabitByName(userId, habitName);
      if (!habit) {
        return await interaction.editReply({
          content: `❌ 習慣「${habitName}」が見つかりません。`,
        });
      }

      // 継続率アラートを設定
      const notificationId = await this.habitNotificationService.setLowCompletionAlert(
        userId, habit.id, thresholdDays, thresholdCount, channel.id
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ 継続率アラートを設定しました！')
        .setDescription(`**${habit.name}** の実行頻度が下がった際にアラートをお送りします。`)
        .addFields(
          { name: '🎯 対象習慣', value: habit.name, inline: true },
          { name: '📊 チェック期間', value: `${thresholdDays}日間`, inline: true },
          { name: '⚠️ アラート基準', value: `${thresholdCount}回未満`, inline: true },
          { name: '📍 通知先', value: `<#${channel.id}>`, inline: true },
          { name: '🆔 通知ID', value: notificationId.toString(), inline: true }
        )
        .setColor('#FF9800')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('継続率アラート設定エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ 継続率アラートの設定に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // 通知一覧表示
  async handleNotifyList(interaction) {
    const userId = interaction.user.id;

    try {
      await interaction.deferReply();

      const notifications = await this.habitNotificationService.getUserNotifications(userId);

      if (notifications.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 習慣通知設定一覧')
          .setDescription('まだ通知が設定されていません。\n`/habit notify reminder` で通知を設定しましょう！')
          .setColor('#FFC107');

        return await interaction.editReply({ embeds: [embed] });
      }

      const typeNames = {
        'reminder': '⏰ リマインダー',
        'monthly_summary': '📅 月末サマリー',
        'streak_milestone': '🏆 ストリーク達成',
        'low_completion': '⚠️ 継続率アラート'
      };

      const notificationList = [];
      for (const notification of notifications) {
        let habitName = 'すべての習慣';
        if (notification.habitId) {
          const habit = await this.sheetsUtils.getHabitById(notification.habitId);
          habitName = habit ? habit.name : `ID:${notification.habitId}`;
        }
        
        const statusEmoji = notification.isEnabled ? '🟢' : '🔴';
        const typeText = typeNames[notification.type] || notification.type;
        
        notificationList.push(
          `${statusEmoji} **ID: ${notification.id}** - ${typeText}\n` +
          `   📝 習慣: ${habitName}\n` +
          `   ⏰ 時刻: ${notification.time} | 📍 <#${notification.channelId}>`
        );
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 習慣通知設定一覧')
        .setDescription(notificationList.join('\n\n'))
        .addFields({
          name: '💡 操作',
          value: '`/habit notify disable [ID]` で無効化\n`/habit notify test [ID]` でテスト送信',
          inline: false
        })
        .setColor('#2196F3')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('通知一覧取得エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ 通知一覧の取得に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // 通知無効化
  async handleNotifyDisable(interaction) {
    const notificationId = interaction.options.getInteger('notification_id');
    const userId = interaction.user.id;

    try {
      await interaction.deferReply();

      const success = await this.habitNotificationService.disableNotification(notificationId, userId);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ 通知を無効化しました')
          .setDescription(`通知ID: ${notificationId} を無効化しました。`)
          .setColor('#4CAF50');

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: '❌ 通知の無効化に失敗しました。IDが正しいか、あなたの通知かご確認ください。',
        });
      }
    } catch (error) {
      console.error('通知無効化エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ 通知の無効化に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  // テスト通知送信
  async handleNotifyTest(interaction) {
    const notificationId = interaction.options.getInteger('notification_id');
    const userId = interaction.user.id;

    try {
      await interaction.deferReply();

      const success = await this.habitNotificationService.testNotification(notificationId, userId);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ テスト通知を送信しました')
          .setDescription(`通知ID: ${notificationId} のテスト通知を送信しました。`)
          .setColor('#4CAF50');

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: '❌ テスト通知の送信に失敗しました。IDが正しいか、あなたの通知かご確認ください。',
        });
      }
    } catch (error) {
      console.error('テスト通知エラー:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ テスト通知の送信に失敗しました。',
          });
        }
      } catch (replyError) {
        console.error('エラー応答送信失敗:', replyError);
      }
    }
  }

  /**
   * ボタンインタラクションハンドラー
   */
  async handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    try {
      if (customId.startsWith('habit_quick_done_')) {
        const habitId = customId.split('_')[3];
        await this.handleQuickDone(interaction, habitId);
      } else if (customId.startsWith('habit_snooze_')) {
        const habitId = customId.split('_')[2];
        await this.handleSnooze(interaction, habitId);
      } else if (customId === 'habit_calendar_view') {
        await this.handleCalendarView(interaction);
      } else if (customId === 'habit_new_month_goals') {
        await this.handleNewMonthGoals(interaction);
      }
    } catch (error) {
      console.error('習慣通知ボタンインタラクションエラー:', error);
      await interaction.reply({
        content: '❌ 操作の実行中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }

  // クイック完了処理
  async handleQuickDone(interaction, habitId) {
    const userId = interaction.user.id;
    const today = require('moment')().format('YYYY-MM-DD');

    try {
      await interaction.deferUpdate();

      const habit = await this.sheetsUtils.getHabitById(habitId);
      if (!habit) {
        return await interaction.editReply({
          content: '❌ 習慣が見つかりません。',
          components: []
        });
      }

      // 既に完了済みかチェック
      const todayLogs = await this.sheetsUtils.getHabitLogsForDate(userId, today);
      const alreadyDone = todayLogs.some(log => log.habitId === habitId);

      if (alreadyDone) {
        return await interaction.editReply({
          content: `✅ 「${habit.name}」は既に今日完了済みです！`,
          components: []
        });
      }

      // 習慣を完了
      await this.sheetsUtils.saveHabitLog(userId, habitId, today);
      const newStreak = await this.sheetsUtils.updateHabitStreak(userId, habitId);

      const embed = new EmbedBuilder()
        .setTitle('🎉 習慣完了！')
        .setDescription(`**${habit.name}** を完了しました！`)
        .addFields(
          { name: '🔥 現在のストリーク', value: `${newStreak}日連続`, inline: true },
          { name: '📅 実行日', value: today, inline: true }
        )
        .setColor('#00FF00')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], components: [] });
    } catch (error) {
      console.error('クイック完了エラー:', error);
      await interaction.editReply({
        content: '❌ 習慣の完了処理に失敗しました。',
        components: []
      });
    }
  }

  // スヌーズ処理
  async handleSnooze(interaction, habitId) {
    try {
      await interaction.deferUpdate();

      const embed = new EmbedBuilder()
        .setTitle('⏰ 30分後にリマインド')
        .setDescription('30分後にもう一度お知らせします。')
        .setColor('#FF9800');

      await interaction.editReply({ embeds: [embed], components: [] });

      // 30分後にリマインダーを設定
      setTimeout(async () => {
        try {
          const habit = await this.sheetsUtils.getHabitById(habitId);
          if (habit) {
            const channel = interaction.channel;
            const userId = interaction.user.id;

            const reminderEmbed = new EmbedBuilder()
              .setTitle('🔔 スヌーズリマインダー')
              .setDescription(`<@${userId}> **${habit.name}** の時間です！（再通知）`)
              .setColor('#00BCD4');

            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`habit_quick_done_${habitId}`)
                  .setLabel('✅ 完了！')
                  .setStyle(ButtonStyle.Success)
              );

            await channel.send({ embeds: [reminderEmbed], components: [row] });
          }
        } catch (error) {
          console.error('スヌーズリマインダー送信エラー:', error);
        }
      }, 30 * 60 * 1000); // 30分 = 30 * 60 * 1000ミリ秒

    } catch (error) {
      console.error('スヌーズ処理エラー:', error);
      await interaction.editReply({
        content: '❌ スヌーズの設定に失敗しました。',
        components: []
      });
    }
  }

  // カレンダー表示
  async handleCalendarView(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📅 カレンダー表示')
        .setDescription('カレンダー表示機能は `/habit calendar` コマンドをご利用ください。')
        .setColor('#2196F3');

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('カレンダー表示エラー:', error);
    }
  }

  // 来月の目標設定
  async handleNewMonthGoals(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('🎯 来月の目標設定')
        .setDescription('新しい習慣の追加は `/habit add` コマンドで行えます。\n既存の習慣の調整は `/habit edit` コマンドをご利用ください。')
        .setColor('#4CAF50');

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('来月目標設定エラー:', error);
    }
  }
}

module.exports = HabitNotificationsHandler;
