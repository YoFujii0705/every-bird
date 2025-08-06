const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const RoutineService = require('../services/routineService');
const RoutineHabitLinkService = require('../services/routineHabitLinkService');

class RoutineHandler {
constructor() {
  this.routineService = new RoutineService();
  this.activeSessions = new Map();
  
  // 🔗 連携サービスを初期化
  try {
    const sheetsUtils = require('../utils/sheets');
    const RoutineHabitLinkService = require('../services/routineHabitLinkService');
    
    console.log('🔗 RoutineHabitLinkService をインポートしました');
    
    this.routineHabitLinkService = new RoutineHabitLinkService(sheetsUtils);
    
    console.log('🔗 RoutineHabitLinkService を初期化しました:', this.routineHabitLinkService ? 'Success' : 'Failed');
    console.log('🎯 RoutineHandler初期化完了 - 連携機能有効');
    
  } catch (error) {
    console.error('🔗 RoutineHabitLinkService 初期化エラー:', error);
    this.routineHabitLinkService = null;
  }
}

  /**
   * ルーティンコマンドのメインハンドラー
   */
async handleRoutineCommand(interaction) {
  const group = interaction.options.getSubcommandGroup(); // グループを取得
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  console.log('🎯 ルーティンコマンド実行:', { group, subcommand }); // subcommandGroupをgroupに修正
    
  try {
    // グループ化されたコマンドの処理
    if (group === 'link') {
      switch (subcommand) {
        case 'habit':
          await this.handleLinkHabit(interaction);
          break;
        case 'remove':
          await this.handleUnlinkHabit(interaction);
          break;
        case 'list':
          await this.handleShowLinks(interaction);
          break;
        default:
          await interaction.reply({
            content: `❌ 不明な連携コマンド: ${subcommand}`,
            flags: MessageFlags.Ephemeral
          });
      }
      return;
    }

    // サブコマンドグループの処理を追加
    if (group === 'notify') {
      return await this.handleNotifyCommand(interaction);
    }

    // 既存のサブコマンド処理
    switch (subcommand) {
      // === 基本管理 ===
      case 'create':
        return await this.handleCreate(interaction);
      case 'list':
        return await this.handleList(interaction);
      case 'info':
        return await this.handleInfo(interaction);
      case 'edit':
        return await this.handleEdit(interaction);
      case 'delete':
        return await this.handleDelete(interaction);

      // === ステップ管理 ===
      case 'steps':
        return await this.handleSteps(interaction);
      case 'add-step':
        return await this.handleAddStep(interaction);
      case 'edit-step':
        return await this.handleEditStep(interaction);
      case 'delete-step':
        return await this.handleDeleteStep(interaction);

      // === 実行制御 ===
      case 'start':
        return await this.handleStart(interaction);
      case 'next':
        return await this.handleNext(interaction);
      case 'skip':
        return await this.handleSkip(interaction);
      case 'pause':
        return await this.handlePause(interaction);
      case 'resume':
        return await this.handleResume(interaction);
      case 'stop':
        return await this.handleStop(interaction);
      case 'status':
        return await this.handleStatus(interaction);

      // === 履歴・統計 ===
      case 'today':
        return await this.handleToday(interaction);
      case 'history':
        return await this.handleHistory(interaction);
      case 'stats':
        return await this.handleStats(interaction);

      // === ユーティリティ ===
      case 'search':
        return await this.handleSearch(interaction);
      case 'copy':
        return await this.handleCopy(interaction);
      case 'template':
        return await this.handleTemplate(interaction);
      case 'debug-sheets':
        return await this.handleDebugSheets(interaction);
      case 'fix-counts':
        return await this.handleFixCounts(interaction);

      default:
        return await interaction.reply({
          content: '❌ 不明なサブコマンドです。',
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('ルーティンコマンド処理エラー:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ コマンドの処理中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

  // === 基本管理ハンドラー ===

 async handleCreate(interaction) {
  const userId = interaction.user.id;
  const name = interaction.options.getString('name');
  const category = interaction.options.getString('category') || 'general';
  const description = interaction.options.getString('description') || '';

  try {
    // 即座にレスポンスを送信
    await interaction.deferReply();
    
    const routineId = await this.routineService.createRoutine(userId, name, description, category);

    const categoryEmoji = {
      'morning': '🌅',
      'evening': '🌙',
      'work': '💼',
      'exercise': '💪',
      'general': '🔄'
    };

    const embed = new EmbedBuilder()
      .setTitle('✅ ルーティンを作成しました！')
      .setDescription(`${categoryEmoji[category]} **${name}** (ID: ${routineId})`)
      .addFields(
        { name: '📝 説明', value: description || 'なし', inline: false },
        { name: '📂 カテゴリ', value: category, inline: true },
        { name: '🔄 次のステップ', value: '`/routine add-step` でステップを追加しましょう', inline: false }
      )
      .setColor('#4CAF50')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('ルーティン作成エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ ルーティンの作成に失敗しました。' });
      } else {
        await interaction.reply({ content: '❌ ルーティンの作成に失敗しました。', ephemeral: true });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleList(interaction) {
  const userId = interaction.user.id;
  
  try {
    // 即座にレスポンスを送信
    await interaction.deferReply();
    
    const routines = await this.routineService.getRoutines(userId);

    if (routines.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 ルーティン一覧')
        .setDescription('まだルーティンが登録されていません。\n`/routine create` で新しいルーティンを作成しましょう！')
        .setColor('#FFC107');

      return await interaction.editReply({ embeds: [embed] });
    }

    const routineList = routines.map(routine => {
      const categoryEmoji = {
        'morning': '🌅',
        'evening': '🌙',
        'work': '💼',
        'exercise': '💪',
        'general': '🔄'
      };
      
      const emoji = categoryEmoji[routine.category] || '🔄';
      const lastExecuted = routine.lastExecuted 
        ? new Date(routine.lastExecuted).toLocaleDateString('ja-JP')
        : '未実行';
      
      return `${emoji} **ID: ${routine.id}** - ${routine.name}\n` +
             `   📊 実行回数: ${routine.totalExecutions}回 | 📅 最終実行: ${lastExecuted}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle('📋 ルーティン一覧')
      .setDescription(routineList)
      .addFields({
        name: '💡 ヒント',
        value: '`/routine info [ID]` で詳細確認\n`/routine start [ID]` で実行開始',
        inline: false
      })
      .setColor('#2196F3')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('ルーティン一覧取得エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ ルーティン一覧の取得に失敗しました。' });
      } else {
        await interaction.reply({ content: '❌ ルーティン一覧の取得に失敗しました。', ephemeral: true });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleInfo(interaction) {
  const routineId = interaction.options.getInteger('id');

  try {
    // 即座にレスポンスを送信
    await interaction.deferReply();
    
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    const steps = await this.routineService.getRoutineSteps(routineId);
    
    // 安全な統計計算（手動で計算）
    const history = await this.routineService.getRoutineExecutionHistory(routineId, 30);
    const safeStats = this.calculateSafeRoutineStats(history);

    const categoryEmoji = {
      'morning': '🌅',
      'evening': '🌙',
      'work': '💼',
      'exercise': '💪',
      'general': '🔄'
    };

    const embed = new EmbedBuilder()
      .setTitle(`${categoryEmoji[routineInfo.category]} ${routineInfo.name}`)
      .setDescription(routineInfo.description || 'なし')
      .addFields(
        { name: '🆔 ID', value: routineId.toString(), inline: true },
        { name: '📂 カテゴリ', value: routineInfo.category, inline: true },
        { name: '🔢 ステップ数', value: steps.length.toString(), inline: true },
        { name: '⏱️ 予想時間', value: `${routineInfo.estimatedDuration || 0}分`, inline: true },
        { name: '🔄 総実行回数', value: routineInfo.totalExecutions.toString(), inline: true },
        { name: '📅 最終実行', value: routineInfo.lastExecuted ? new Date(routineInfo.lastExecuted).toLocaleDateString('ja-JP') : '未実行', inline: true },
        { name: '📊 完了率（30日）', value: `${safeStats.completionRate}%`, inline: true },
        { name: '⏰ 平均時間', value: safeStats.avgDuration > 0 ? `${safeStats.avgDuration}分` : '記録なし', inline: true },
        { name: '✅ 平均ステップ完了率', value: `${safeStats.avgCompletionRate}%`, inline: true }
      )
      .setColor('#2196F3')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`routine_start_${routineId}`)
          .setLabel('🎯 実行開始')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`routine_steps_${routineId}`)
          .setLabel('📝 ステップ確認')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('ルーティン情報取得エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ ルーティン情報の取得に失敗しました。' });
      } else {
        await interaction.reply({ content: '❌ ルーティン情報の取得に失敗しました。', ephemeral: true });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

// 安全なルーティン統計計算メソッドをクラスに追加
calculateSafeRoutineStats(history) {
  if (!history || history.length === 0) {
    return {
      totalExecutions: 0,
      completedExecutions: 0,
      completionRate: 0,
      avgDuration: 0,
      avgCompletionRate: 0
    };
  }
  
  const completedExecutions = history.filter(ex => ex.status === 'completed');
  const completionRate = Math.round((completedExecutions.length / history.length) * 100);
  
  // 安全な平均時間計算
  const validDurations = [];
  completedExecutions.forEach(ex => {
    if (ex.startTime && ex.endTime) {
      const duration = this.calculateSafeExecutionTime(ex.startTime, ex.endTime);
      if (duration > 0) {
        validDurations.push(duration);
      }
    }
  });
  
  const avgDuration = validDurations.length > 0 ? 
    Math.round(validDurations.reduce((sum, d) => sum + d, 0) / validDurations.length) : 0;
  
  // ステップ完了率の平均計算
  const validStepRates = history
    .filter(ex => ex.totalSteps > 0)
    .map(ex => (ex.completedSteps / ex.totalSteps) * 100);
  
  const avgCompletionRate = validStepRates.length > 0 ?
    Math.round(validStepRates.reduce((sum, rate) => sum + rate, 0) / validStepRates.length) : 0;
  
  return {
    totalExecutions: history.length,
    completedExecutions: completedExecutions.length,
    completionRate: completionRate,
    avgDuration: avgDuration,
    avgCompletionRate: avgCompletionRate
  };
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

  async handleEdit(interaction) {
    const routineId = interaction.options.getInteger('id');
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const category = interaction.options.getString('category');

    try {
      const routineInfo = await this.routineService.getRoutineInfo(routineId);
      if (!routineInfo) {
        return await interaction.reply({
          content: '❌ 指定されたIDのルーティンが見つかりません。',
          ephemeral: true
        });
      }

      const updates = {};
      if (name !== null) updates.name = name;
      if (description !== null) updates.description = description;
      if (category !== null) updates.category = category;

      if (Object.keys(updates).length === 0) {
        return await interaction.reply({
          content: '❌ 更新する項目を指定してください。',
          ephemeral: true
        });
      }

      const success = await this.routineService.updateRoutine(routineId, updates);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ ルーティンを更新しました')
          .setDescription(`**${updates.name || routineInfo.name}** の情報を更新しました。`)
          .setColor('#4CAF50');

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: '❌ ルーティンの更新に失敗しました。',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('ルーティン編集エラー:', error);
      await interaction.reply({
        content: '❌ ルーティンの編集に失敗しました。',
        ephemeral: true
      });
    }
  }

  async handleDelete(interaction) {
    const routineId = interaction.options.getInteger('id');

    try {
      const routineInfo = await this.routineService.getRoutineInfo(routineId);
      if (!routineInfo) {
        return await interaction.reply({
          content: '❌ 指定されたIDのルーティンが見つかりません。',
          ephemeral: true
        });
      }

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`routine_delete_confirm_${routineId}`)
            .setLabel('🗑️ 削除する')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('routine_delete_cancel')
            .setLabel('❌ キャンセル')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setTitle('⚠️ ルーティン削除の確認')
        .setDescription(`**${routineInfo.name}** を削除しますか？\n\n⚠️ この操作は取り消せません。`)
        .setColor('#FF5722');

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
      console.error('ルーティン削除確認エラー:', error);
      await interaction.reply({
        content: '❌ 削除確認の表示に失敗しました。',
        ephemeral: true
      });
    }
  }

  // === ステップ管理ハンドラー ===

async handleSteps(interaction) {
  const routineId = interaction.options.getInteger('id');

  try {
    // 即座にレスポンスを送信
    await interaction.deferReply();
    
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    const steps = await this.routineService.getRoutineSteps(routineId);

    if (steps.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📝 ${routineInfo.name} - ステップ一覧`)
        .setDescription('まだステップが登録されていません。\n`/routine add-step` でステップを追加しましょう！')
        .setColor('#FFC107');

      return await interaction.editReply({ embeds: [embed] });
    }

    const stepList = steps.map(step => {
      const timeText = step.estimatedMinutes > 0 ? `(${step.estimatedMinutes}分)` : '';
      const requiredText = step.isRequired ? '🔴' : '🔵';
      return `${requiredText} **${step.order}.** ${step.name} ${timeText}`;
    }).join('\n');

    const totalTime = steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);

    const embed = new EmbedBuilder()
      .setTitle(`📝 ${routineInfo.name} - ステップ一覧`)
      .setDescription(stepList)
      .addFields(
        { name: '⏱️ 総予想時間', value: `${totalTime}分`, inline: true },
        { name: '🔢 ステップ数', value: steps.length.toString(), inline: true }
      )
      .setFooter({ text: '🔴=必須 🔵=任意' })
      .setColor('#2196F3');

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('ステップ一覧取得エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ ステップ一覧の取得に失敗しました。' });
      } else {
        await interaction.reply({ content: '❌ ステップ一覧の取得に失敗しました。', ephemeral: true });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleAddStep(interaction) {
  const routineId = interaction.options.getInteger('routine_id');
  const stepName = interaction.options.getString('name');
  const description = interaction.options.getString('description') || '';
  const minutes = interaction.options.getInteger('minutes') || 0;
  const required = interaction.options.getBoolean('required') ?? true;

  try {
    // 最初に即座にレスポンスを送信（3秒以内）
    await interaction.deferReply();
    
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    const stepId = await this.routineService.addRoutineStep(routineId, stepName, description, minutes, required);
    const steps = await this.routineService.getRoutineSteps(routineId);

    const embed = new EmbedBuilder()
      .setTitle('✅ ステップを追加しました！')
      .setDescription(`**${routineInfo.name}** にステップを追加しました。`)
      .addFields(
        { name: '📝 ステップ名', value: stepName, inline: false },
        { name: '🔢 順番', value: steps.length.toString(), inline: true },
        { name: '⏱️ 予想時間', value: `${minutes}分`, inline: true },
        { name: '🎯 必須', value: required ? '必須' : '任意', inline: true }
      )
      .setColor('#4CAF50');

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('ステップ追加エラー:', error);
    
    try {
      // interactionが既に期限切れの場合のエラーハンドリング
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ステップの追加に失敗しました。',
        });
      } else {
        await interaction.reply({
          content: '❌ ステップの追加に失敗しました。',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信も失敗:', replyError);
    }
  }
}

  async handleEditStep(interaction) {
    const stepId = interaction.options.getInteger('step_id');
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const minutes = interaction.options.getInteger('minutes');

    try {
      const updates = {};
      if (name !== null) updates.name = name;
      if (description !== null) updates.description = description;
      if (minutes !== null) updates.estimatedMinutes = minutes;

      if (Object.keys(updates).length === 0) {
        return await interaction.reply({
          content: '❌ 更新する項目を指定してください。',
          ephemeral: true
        });
      }

      const success = await this.routineService.updateRoutineStep(stepId, updates);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ ステップを更新しました')
          .setDescription('ステップの情報を更新しました。')
          .setColor('#4CAF50');

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: '❌ ステップの更新に失敗しました。指定されたIDのステップが見つからない可能性があります。',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('ステップ編集エラー:', error);
      await interaction.reply({
        content: '❌ ステップの編集に失敗しました。',
        ephemeral: true
      });
    }
  }

  async handleDeleteStep(interaction) {
    const stepId = interaction.options.getInteger('step_id');

    try {
      const success = await this.routineService.deleteRoutineStep(stepId);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ ステップを削除しました')
          .setDescription('ステップを削除しました。')
          .setColor('#4CAF50');

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: '❌ ステップの削除に失敗しました。指定されたIDのステップが見つからない可能性があります。',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('ステップ削除エラー:', error);
      await interaction.reply({
        content: '❌ ステップの削除に失敗しました。',
        ephemeral: true
      });
    }
  }

  // === 実行制御ハンドラー ===

  async handleStart(interaction) {
  const routineId = interaction.options.getInteger('id');
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    // デバッグログを追加
    console.log('🔍 ルーティン開始:', { userId, routineId });
    console.log('🔍 開始前のアクティブセッション数:', this.activeSessions.size);

    if (this.activeSessions.has(userId)) {
      return await interaction.editReply({
        content: '❌ 既に実行中のルーティンがあります。先に完了または中断してください。\n`/routine status` で確認できます。',
      });
    }

    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    const steps = await this.routineService.getRoutineSteps(routineId);
    if (steps.length === 0) {
      return await interaction.editReply({
        content: '❌ このルーティンにはステップが登録されていません。先にステップを追加してください。',
      });
    }

    const session = await this.routineService.startRoutineSession(userId, routineId, routineInfo, steps);
    console.log('🔍 セッション作成:', { userId, sessionExists: !!session });
    
    this.activeSessions.set(userId, session);
    console.log('🔍 セッション保存後のアクティブセッション数:', this.activeSessions.size);
    console.log('🔍 保存されたセッションのキー:', Array.from(this.activeSessions.keys()));

    const { embed, components } = this.createStepDisplay(session);
    await interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    console.error('ルーティン開始エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ルーティンの開始に失敗しました。',
        });
      } else {
        await interaction.reply({
          content: '❌ ルーティンの開始に失敗しました。',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

// handlers/routineHandler.js の handleNext メソッドに以下を追加

async handleNext(interaction) {
  const userId = interaction.user.id;
  const notes = interaction.options.getString('notes') || '';

  try {
    const session = this.activeSessions.get(userId);
    if (!session) {
      return await interaction.reply({
        content: '❌ 実行中のルーティンがありません。`/routine start` で開始してください。',
        flags: MessageFlags.Ephemeral
      });
    }

    // 🔗 現在のステップ情報を保存（連携処理用）
    const currentStep = session.getCurrentStep();
    const currentStepId = currentStep.stepId;
    const routineId = session.routineId;
    
    console.log('🔗 ステップ完了前の情報:', { 
      userId: userId.substring(0, 6) + '...', 
      routineId, 
      currentStepId, 
      stepName: currentStep.name 
    });

    const result = await session.next(notes);
    
    // 🔗 ステップ完了時の習慣連携処理を追加
    if (this.routineHabitLinkService) {
      try {
        console.log('🔗 連携処理開始:', { routineId, currentStepId });
        
        const linkResult = await this.routineHabitLinkService.processStepCompletion(
          userId, 
          routineId, 
          currentStepId, 
          'completed'
        );
        
        if (linkResult) {
          console.log('🔗 習慣自動記録成功:', linkResult);
        } else {
          console.log('🔗 連携なし、または既に記録済み');
        }
      } catch (linkError) {
        console.error('🔗 習慣連携処理エラー:', linkError);
        // 連携エラーはメイン処理を阻害しない
      }
    } else {
      console.log('⚠️ routineHabitLinkService が初期化されていません');
    }
    
    if (result.completed) {
      // ルーティン完了
      this.activeSessions.delete(userId);
      const embed = this.createCompletionEmbed(session, result);
      
      // 🔗 連携成功時の追加情報を埋め込みに追加
      if (this.routineHabitLinkService) {
        try {
          const linkStats = await this.routineHabitLinkService.getLinkStats(userId);
          if (linkStats.todayExecutions > 0) {
            embed.addFields({
              name: '🔗 習慣連携',
              value: `今日の連携実行: ${linkStats.todayExecutions}件`,
              inline: true
            });
          }
        } catch (statsError) {
          console.error('連携統計取得エラー:', statsError);
        }
      }
      
      await interaction.reply({ embeds: [embed] });
    } else {
      // 次のステップを表示
      const { embed, components } = this.createStepDisplay(session);
      await interaction.reply({ embeds: [embed], components });
    }
  } catch (error) {
    console.error('次のステップエラー:', error);
    await interaction.reply({
      content: '❌ 次のステップへの進行に失敗しました。',
      flags: MessageFlags.Ephemeral
    });
  }
}

  async handleSkip(interaction) {
    const userId = interaction.user.id;
    const reason = interaction.options.getString('reason') || '';

    try {
      const session = this.activeSessions.get(userId);
      if (!session) {
        return await interaction.reply({
          content: '❌ 実行中のルーティンがありません。`/routine start` で開始してください。',
          ephemeral: true
        });
      }

      const result = await session.skip(reason);
      
      if (result.completed) {
        // ルーティン完了
        this.activeSessions.delete(userId);
        const embed = this.createCompletionEmbed(session, result);
        await interaction.reply({ embeds: [embed] });
      } else {
        // 次のステップを表示
        const { embed, components } = this.createStepDisplay(session);
        await interaction.reply({ embeds: [embed], components });
      }
    } catch (error) {
      console.error('ステップスキップエラー:', error);
      await interaction.reply({
        content: '❌ ステップのスキップに失敗しました。',
        ephemeral: true
      });
    }
  }

  async handlePause(interaction) {
    const userId = interaction.user.id;

    try {
      const session = this.activeSessions.get(userId);
      if (!session) {
        return await interaction.reply({
          content: '❌ 実行中のルーティンがありません。',
          ephemeral: true
        });
      }

      session.pause();

      const embed = new EmbedBuilder()
        .setTitle('⏸️ ルーティンを一時停止しました')
        .setDescription(`**${session.routineName}** を一時停止しました。\n\n\`/routine resume\` で再開できます。`)
        .setColor('#FF9800');

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('ルーティン一時停止エラー:', error);
      await interaction.reply({
        content: '❌ ルーティンの一時停止に失敗しました。',
        ephemeral: true
      });
    }
  }

  async handleResume(interaction) {
    const userId = interaction.user.id;

    try {
      const session = this.activeSessions.get(userId);
      if (!session) {
        return await interaction.reply({
          content: '❌ 実行中のルーティンがありません。',
          ephemeral: true
        });
      }

      if (session.status !== 'paused') {
        return await interaction.reply({
          content: '❌ 一時停止中のルーティンがありません。',
          ephemeral: true
        });
      }

      session.resume();

      const { embed, components } = this.createStepDisplay(session);
      await interaction.reply({ embeds: [embed], components });
    } catch (error) {
      console.error('ルーティン再開エラー:', error);
      await interaction.reply({
        content: '❌ ルーティンの再開に失敗しました。',
        ephemeral: true
      });
    }
  }

  async handleStop(interaction) {
    const userId = interaction.user.id;
    const reason = interaction.options.getString('reason') || '';

    try {
      const session = this.activeSessions.get(userId);
      if (!session) {
        return await interaction.reply({
          content: '❌ 実行中のルーティンがありません。',
          ephemeral: true
        });
      }

      await session.abort(reason);
      this.activeSessions.delete(userId);

      const embed = new EmbedBuilder()
        .setTitle('⏹️ ルーティンを中断しました')
        .setDescription(`**${session.routineName}** を中断しました。`)
        .addFields(
          { name: '📊 進行状況', value: `${session.currentStepIndex}/${session.steps.length} ステップ完了`, inline: true },
          { name: '🔍 中断理由', value: reason || 'なし', inline: true }
        )
        .setColor('#F44336');

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('ルーティン中断エラー:', error);
      await interaction.reply({
        content: '❌ ルーティンの中断に失敗しました。',
        ephemeral: true
      });
    }
  }

  async handleStatus(interaction) {
    const userId = interaction.user.id;

    try {
      const session = this.activeSessions.get(userId);
      if (!session) {
        return await interaction.reply({
          content: '📊 現在実行中のルーティンはありません。',
          ephemeral: true
        });
      }

      const { embed, components } = this.createStepDisplay(session);
      await interaction.reply({ embeds: [embed], components });
    } catch (error) {
      console.error('ルーティン状況確認エラー:', error);
      await interaction.reply({
        content: '❌ ルーティン状況の確認に失敗しました。',
        ephemeral: true
      });
    }
  }

// 🔗 新しい連携コマンド処理メソッドを追加
async handleLinkHabit(interaction) {
  const userId = interaction.user.id;
  const routineId = interaction.options.getInteger('routine_id');
  const stepOrder = interaction.options.getInteger('step_order');
  const habitName = interaction.options.getString('habit_name');

  try {
    await interaction.deferReply();

    // ルーティン存在確認
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたルーティンが見つかりません。',
      });
    }

    // ステップ存在確認
    const steps = await this.routineService.getRoutineSteps(routineId);
    const targetStep = steps.find(step => step.order === stepOrder);
    if (!targetStep) {
      return await interaction.editReply({
        content: `❌ ステップ${stepOrder}が見つかりません。`,
      });
    }

    // 習慣存在確認
    const sheetsUtils = require('../utils/sheets');
    const habit = await sheetsUtils.getHabitByName(userId, habitName);
    if (!habit) {
      return await interaction.editReply({
        content: `❌ 習慣「${habitName}」が見つかりません。`,
      });
    }

    // 連携を作成
    if (!this.routineHabitLinkService) {
      return await interaction.editReply({
        content: '❌ 連携サービスが初期化されていません。',
      });
    }

    const linkId = await this.routineHabitLinkService.createLink(
      userId, 
      routineId, 
      targetStep.stepId, 
      habit.id
    );

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🔗 ルーティン-習慣連携を作成しました！')
      .setDescription(`ステップ完了時に習慣が自動記録されます`)
      .addFields(
        { name: '🔄 ルーティン', value: routineInfo.name, inline: true },
        { name: '📝 ステップ', value: `${stepOrder}. ${targetStep.name}`, inline: true },
        { name: '🏃 習慣', value: habit.name, inline: true },
        { name: '🆔 連携ID', value: linkId.toString(), inline: true },
        { name: '📅 作成日', value: new Date().toLocaleDateString('ja-JP'), inline: true }
      )
      .setColor('#4CAF50')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('習慣連携作成エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ 習慣連携の作成に失敗しました。',
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleUnlinkHabit(interaction) {
  const userId = interaction.user.id;
  const linkId = interaction.options.getInteger('link_id');

  try {
    await interaction.deferReply();

    if (!this.routineHabitLinkService) {
      return await interaction.editReply({
        content: '❌ 連携サービスが初期化されていません。',
      });
    }

    // 連携情報を取得
    const link = await this.routineHabitLinkService.getLinkById(linkId);
    if (!link || link.userId !== userId) {
      return await interaction.editReply({
        content: '❌ 指定された連携が見つからないか、権限がありません。',
      });
    }

    // 連携を削除
    const success = await this.routineHabitLinkService.removeLink(userId, linkId);
    
    if (success) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('🔗 連携を削除しました')
        .setDescription(`連携ID: ${linkId} を削除しました。`)
        .addFields(
          { name: '📅 削除日', value: new Date().toLocaleDateString('ja-JP'), inline: true }
        )
        .setColor('#FF5722')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: '❌ 連携の削除に失敗しました。',
      });
    }

  } catch (error) {
    console.error('習慣連携削除エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ 習慣連携の削除に失敗しました。',
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleShowLinks(interaction) {
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (!this.routineHabitLinkService) {
      return await interaction.editReply({
        content: '❌ 連携サービスが初期化されていません。',
      });
    }

    // 連携一覧を取得
    const links = await this.routineHabitLinkService.getUserLinks(userId);
    
    if (links.length === 0) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('🔗 ルーティン-習慣連携一覧')
        .setDescription('まだ連携が設定されていません。\n`/routine link-habit` で連携を作成しましょう！')
        .setColor('#FFC107');

      return await interaction.editReply({ embeds: [embed] });
    }

    // 詳細情報を取得
    const enrichedLinks = await this.routineHabitLinkService.enrichLinks(links);
    
    // 連携統計を取得
    const stats = await this.routineHabitLinkService.getLinkStats(userId);

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🔗 ルーティン-習慣連携一覧')
      .setDescription(`設定済み連携: ${links.length}件`)
      .addFields(
        { name: '📊 今日の実行', value: `${stats.todayExecutions}/${stats.totalLinks}件`, inline: true },
        { name: '📈 達成率', value: `${stats.completionRate}%`, inline: true },
        { name: '📅 今週の実行', value: `${stats.weekExecutions}件`, inline: true }
      )
      .setColor('#2196F3')
      .setTimestamp();

    // 連携詳細を表示
    const linkDetails = enrichedLinks.map(link => 
      `**ID: ${link.linkId}** ${link.routineName} → ${link.habitName}\n` +
      `   📝 ${link.stepOrder}. ${link.stepName}`
    ).join('\n\n');

    if (linkDetails.length > 0) {
      embed.addFields({ name: '🔗 連携詳細', value: linkDetails, inline: false });
    }

    embed.addFields({
      name: '💡 操作',
      value: '`/routine unlink-habit [ID]` で連携を削除',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('連携一覧表示エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ 連携一覧の取得に失敗しました。',
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

  // === 履歴・統計ハンドラー ===

async handleToday(interaction) {
  const userId = interaction.user.id; // userIdを追加
  
  try {
    const executions = await this.routineService.getTodayRoutineExecutions(userId); // userIdを渡す

    if (executions.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📅 今日のルーティン実行状況')
        .setDescription('今日はまだルーティンを実行していません。\n`/routine start` で始めましょう！')
        .setColor('#FFC107');

      return await interaction.reply({ embeds: [embed] });
    }

    // executionListの生成を修正（routineNameを取得する処理を追加）
    const executionList = [];
    for (const ex of executions) {
      const routineInfo = await this.routineService.getRoutineInfo(ex.routineId);
      const routineName = routineInfo ? routineInfo.name : `ID:${ex.routineId}`;
      
      const statusEmoji = {
        'completed': '✅',
        'running': '🔄',
        'paused': '⏸️',
        'aborted': '❌'
      };

      const completionRate = ex.totalSteps > 0 ? Math.round((ex.completedSteps / ex.totalSteps) * 100) : 0;
      const timeText = ex.endTime ? `${ex.startTime}-${ex.endTime}` : `${ex.startTime}～`;

      executionList.push(`${statusEmoji[ex.status]} **${routineName}** (${completionRate}%) ${timeText}`);
    }

    const completed = executions.filter(ex => ex.status === 'completed').length;
    const running = executions.filter(ex => ex.status === 'running').length;

    const embed = new EmbedBuilder()
      .setTitle('📅 今日のルーティン実行状況')
      .setDescription(executionList.join('\n'))
      .addFields(
        { name: '✅ 完了', value: completed.toString(), inline: true },
        { name: '🔄 実行中', value: running.toString(), inline: true },
        { name: '📊 総実行数', value: executions.length.toString(), inline: true }
      )
      .setColor('#2196F3')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('今日の実行状況取得エラー:', error);
    await interaction.reply({
      content: '❌ 今日の実行状況の取得に失敗しました。',
      ephemeral: true
    });
  }
}

async handleHistory(interaction) {
  const routineId = interaction.options.getInteger('id');
  const days = interaction.options.getInteger('days') || 7;

  try {
    await interaction.deferReply(); // deferReplyを追加

    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    const history = await this.routineService.getRoutineExecutionHistory(routineId, days);

    if (history.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📜 ${routineInfo.name} - 実行履歴（${days}日間）`)
        .setDescription('この期間に実行履歴がありません。')
        .setColor('#FFC107');

      return await interaction.editReply({ embeds: [embed] });
    }

    const historyList = history.slice(0, 10).map(ex => {
      const statusEmoji = {
        'completed': '✅',
        'running': '🔄',
        'paused': '⏸️',
        'aborted': '❌'
      };

      const date = new Date(ex.executionDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
      const completionRate = ex.totalSteps > 0 ? Math.round((ex.completedSteps / ex.totalSteps) * 100) : 0;
      const timeText = ex.endTime ? `${ex.startTime}-${ex.endTime}` : `${ex.startTime}～`;

      return `${statusEmoji[ex.status]} ${date} (${completionRate}%) ${timeText}`;
    }).join('\n');

    const completed = history.filter(ex => ex.status === 'completed').length;
    const completionRate = Math.round((completed / history.length) * 100);

    const embed = new EmbedBuilder()
      .setTitle(`📜 ${routineInfo.name} - 実行履歴（${days}日間）`)
      .setDescription(historyList)
      .addFields(
        { name: '📊 総実行数', value: history.length.toString(), inline: true },
        { name: '✅ 完了数', value: completed.toString(), inline: true },
        { name: '📈 完了率', value: `${completionRate}%`, inline: true }
      )
      .setColor('#2196F3')
      .setTimestamp();

    // setFooterの修正 - 空文字列の場合は設定しない
    if (history.length > 10) {
      embed.setFooter({ text: '※最新の10件を表示' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('ルーティン履歴取得エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ルーティン履歴の取得に失敗しました。',
        });
      } else {
        await interaction.reply({
          content: '❌ ルーティン履歴の取得に失敗しました。',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

  async handleStats(interaction) {
    const routineId = interaction.options.getInteger('id');
    const days = interaction.options.getInteger('days') || 30;

    try {
      const routineInfo = await this.routineService.getRoutineInfo(routineId);
      if (!routineInfo) {
        return await interaction.reply({
          content: '❌ 指定されたIDのルーティンが見つかりません。',
          ephemeral: true
        });
      }

      const stats = await this.routineService.getRoutineStats(routineId, days);

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${routineInfo.name} - 統計情報（${days}日間）`)
        .addFields(
          { name: '🔄 総実行回数', value: stats.totalExecutions.toString(), inline: true },
          { name: '✅ 完了回数', value: stats.completedExecutions.toString(), inline: true },
          { name: '📈 完了率', value: `${stats.completionRate}%`, inline: true },
          { name: '⏰ 平均所要時間', value: `${stats.avgDuration}分`, inline: true },
          { name: '📊 平均ステップ完了率', value: `${stats.avgCompletionRate}%`, inline: true },
          { name: '📅 分析期間', value: `${days}日間`, inline: true }
        )
        .setColor('#4CAF50')
        .setTimestamp();

      // パフォーマンス評価を追加
      let performance = '';
      if (stats.completionRate >= 80) {
        performance = '🏆 素晴らしい継続率です！';
      } else if (stats.completionRate >= 60) {
        performance = '👍 良いペースで続けています';
      } else if (stats.completionRate >= 40) {
        performance = '📈 改善の余地があります';
      } else {
        performance = '💪 継続を頑張りましょう！';
      }

      embed.addFields({ name: '🎯 評価', value: performance, inline: false });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('ルーティン統計取得エラー:', error);
      await interaction.reply({
        content: '❌ ルーティン統計の取得に失敗しました。',
        ephemeral: true
      });
    }
  }

  // === ユーティリティハンドラー ===

 async handleSearch(interaction) {
  const userId = interaction.user.id; // userIdを追加
  const keyword = interaction.options.getString('keyword');

  try {
    const results = await this.routineService.searchRoutines(userId, keyword); // userIdを渡す

    if (results.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔍 検索結果')
        .setDescription(`「**${keyword}**」に一致するルーティンが見つかりませんでした。`)
        .setColor('#FFC107');

      return await interaction.reply({ embeds: [embed] });
    }

    // 検索結果の表示形式を修正
    const resultList = results.map(routine => {
      const categoryEmoji = {
        'morning': '🌅',
        'evening': '🌙',
        'work': '💼',
        'exercise': '💪',
        'general': '🔄'
      };
      
      const emoji = categoryEmoji[routine.category] || '🔄';
      return `${emoji} **ID: ${routine.id}** - ${routine.name}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🔍 検索結果')
      .setDescription(`「**${keyword}**」の検索結果:\n\n${resultList}`)
      .setColor('#2196F3')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('ルーティン検索エラー:', error);
    await interaction.reply({
      content: '❌ ルーティンの検索に失敗しました。',
      ephemeral: true
    });
  }
}

// handleCopyメソッドの修正
async handleCopy(interaction) {
  const userId = interaction.user.id; // userIdを追加
  const sourceId = interaction.options.getInteger('source_id');
  const newName = interaction.options.getString('new_name');

  try {
    const sourceRoutine = await this.routineService.getRoutineInfo(sourceId);
    if (!sourceRoutine) {
      return await interaction.reply({
        content: '❌ コピー元のルーティンが見つかりません。',
        ephemeral: true
      });
    }

    const sourceSteps = await this.routineService.getRoutineSteps(sourceId);

    // 新しいルーティンを作成
    const newRoutineId = await this.routineService.createRoutine(
      userId, // userIdを追加
      newName,
      `${sourceRoutine.description} (コピー)`,
      sourceRoutine.category
    );

    // ステップをコピー
    for (const step of sourceSteps) {
      await this.routineService.addRoutineStep(
        newRoutineId,
        step.name,
        step.description,
        step.estimatedMinutes,
        step.isRequired
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ ルーティンをコピーしました！')
      .setDescription(`**${sourceRoutine.name}** を **${newName}** としてコピーしました。`)
      .addFields(
        { name: '🆔 新しいID', value: newRoutineId.toString(), inline: true },
        { name: '📝 ステップ数', value: sourceSteps.length.toString(), inline: true }
      )
      .setColor('#4CAF50');

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('ルーティンコピーエラー:', error);
    await interaction.reply({
      content: '❌ ルーティンのコピーに失敗しました。',
      ephemeral: true
    });
  }
}

// 新しいメソッドを追加
async handleFixCounts(interaction) {
  try {
    await interaction.deferReply();
    
    // 既存の全ルーティンの実行回数を修正
    if (sheetsUtils.updateRoutineTotalExecutions) {
      // ルーティンID 1の実行回数を修正
      await sheetsUtils.updateRoutineTotalExecutions(1);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ 実行回数を修正しました')
        .setDescription('ルーティンの実行回数を正しく更新しました。')
        .setColor('#4CAF50');

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: '❌ 実行回数更新メソッドが見つかりません。',
      });
    }
  } catch (error) {
    console.error('実行回数修正エラー:', error);
    await interaction.editReply({
      content: '❌ 実行回数の修正に失敗しました。',
    });
  }
}

async handleTemplate(interaction) {
  const userId = interaction.user.id; // userIdを追加
  const templateType = interaction.options.getString('type');

  try {
    const template = this.getRoutineTemplate(templateType);
    if (!template) {
      return await interaction.reply({
        content: '❌ 指定されたテンプレートが見つかりません。',
        ephemeral: true
      });
    }

    // テンプレートからルーティンを作成
    const routineId = await this.routineService.createRoutine(
      userId, // userIdを追加
      template.name,
      template.description,
      template.category
    );

    // ステップを追加
    for (const step of template.steps) {
      await this.routineService.addRoutineStep(
        routineId,
        step.name,
        step.description,
        step.minutes,
        step.required
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ テンプレートからルーティンを作成しました！')
      .setDescription(`**${template.name}** を作成しました。`)
      .addFields(
        { name: '🆔 ルーティンID', value: routineId.toString(), inline: true },
        { name: '📝 ステップ数', value: template.steps.length.toString(), inline: true },
        { name: '⏱️ 予想時間', value: `${template.steps.reduce((sum, s) => sum + s.minutes, 0)}分`, inline: true }
      )
      .setColor('#4CAF50');

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('テンプレート作成エラー:', error);
    await interaction.reply({
      content: '❌ テンプレートからの作成に失敗しました。',
      ephemeral: true
    });
  }
}
  // === ユーティリティメソッド ===

  /**
   * ステップ表示用のEmbedとボタンを作成
   */
  createStepDisplay(session) {
    const currentStep = session.getCurrentStep();
    const progress = `${session.currentStepIndex + 1}/${session.steps.length}`;
    const progressBar = this.generateProgressBar(session.currentStepIndex, session.steps.length);
    
    const statusEmoji = {
      'running': '▶️',
      'paused': '⏸️'
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji[session.status]} ${session.routineName} - ステップ ${progress}`)
      .setDescription(`${progressBar}\n\n**現在のステップ:**\n${currentStep.name}`)
      .addFields(
        { name: '📝 詳細', value: currentStep.description || 'なし', inline: false },
        { name: '⏱️ 予想時間', value: `${currentStep.estimatedMinutes || 0}分`, inline: true },
        { name: '🎯 必須', value: currentStep.isRequired ? '必須' : '任意', inline: true }
      )
      .setColor(session.status === 'running' ? '#00BCD4' : '#FF9800')
      .setTimestamp();

    const components = [];
    if (session.status === 'running') {
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('routine_next')
            .setLabel('✅ 完了')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('routine_skip')
            .setLabel('⏩ スキップ')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('routine_pause')
            .setLabel('⏸️ 一時停止')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('routine_stop')
            .setLabel('⏹️ 中断')
            .setStyle(ButtonStyle.Danger)
        );
      components.push(row);
    }

    return { embed, components };
  }

  /**
   * 完了時のEmbedを作成
   */
  createCompletionEmbed(session, result) {
    const duration = Math.round((result.endTime - session.startTime) / (1000 * 60));
    const completedSteps = session.currentStepIndex;
    const completionRate = Math.round((completedSteps / session.steps.length) * 100);

    return new EmbedBuilder()
      .setTitle('🎉 ルーティン完了！')
      .setDescription(`**${session.routineName}** を完了しました！`)
      .addFields(
        { name: '⏱️ 所要時間', value: `${duration}分`, inline: true },
        { name: '✅ 完了率', value: `${completionRate}% (${completedSteps}/${session.steps.length})`, inline: true },
        { name: '📊 今日の実績', value: '`/routine today` で確認', inline: true }
      )
      .setColor('#4CAF50')
      .setTimestamp();
  }

  /**
   * プログレスバーを生成
   */
  generateProgressBar(current, total) {
    const progress = (current / total) * 100;
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(progress)}%`;
  }

  /**
   * ルーティンテンプレートを取得
   */
  getRoutineTemplate(type) {
    const templates = {
      morning_basic: {
        name: '基本的な朝ルーティン',
        description: '健康的な朝の習慣',
        category: 'morning',
        steps: [
          { name: '起床', description: '決まった時間に起きる', minutes: 0, required: true },
          { name: '水分補給', description: 'コップ1杯の水を飲む', minutes: 2, required: true },
          { name: '軽いストレッチ', description: '体をほぐす', minutes: 10, required: false },
          { name: '朝食', description: 'バランスの良い朝食', minutes: 20, required: true },
          { name: '身支度', description: '歯磨き・洗顔・着替え', minutes: 15, required: true }
        ]
      },
      evening_basic: {
        name: '基本的な夜ルーティン',
        description: '良質な睡眠のための夜の習慣',
        category: 'evening',
        steps: [
          { name: 'デジタルデトックス', description: 'スマホ・PCの使用を停止', minutes: 0, required: true },
          { name: '入浴', description: 'リラックスできるお風呂時間', minutes: 30, required: true },
          { name: '読書', description: '本を読んでリラックス', minutes: 20, required: false },
          { name: '明日の準備', description: '翌日の予定確認と準備', minutes: 10, required: true },
          { name: '就寝', description: '決まった時間に寝る', minutes: 0, required: true }
        ]
      },
      exercise_basic: {
        name: '基本的な運動ルーティン',
        description: '日常的な運動習慣',
        category: 'exercise',
        steps: [
          { name: 'ウォームアップ', description: '軽いストレッチ', minutes: 5, required: true },
          { name: '有酸素運動', description: 'ジョギングや自転車', minutes: 30, required: true },
          { name: '筋力トレーニング', description: '基本的な筋トレ', minutes: 20, required: false },
          { name: 'クールダウン', description: '整理体操', minutes: 5, required: true },
          { name: '水分補給', description: '失った水分を補給', minutes: 5, required: true }
        ]
      },
      work_start: {
        name: '在宅ワーク開始ルーティン',
        description: '効率的な在宅ワーク開始の習慣',
        category: 'work',
        steps: [
          { name: 'ワークスペース整理', description: 'デスク周りを片付ける', minutes: 5, required: true },
          { name: 'PCセットアップ', description: '必要なアプリを起動', minutes: 3, required: true },
          { name: 'メールチェック', description: '緊急メールを確認', minutes: 10, required: true },
          { name: '今日のタスク確認', description: 'TODOリストを見直し', minutes: 5, required: true },
          { name: 'カレンダー確認', description: '予定とミーティングを確認', minutes: 3, required: true },
          { name: '集中モード開始', description: '通知オフ・集中環境作り', minutes: 2, required: true }
        ]
      },
      study_basic: {
        name: '基本的な学習ルーティン',
        description: '効果的な学習習慣',
        category: 'general',
        steps: [
          { name: '学習環境準備', description: '机を片付け、教材を準備', minutes: 5, required: true },
          { name: '目標設定', description: '今日の学習目標を決める', minutes: 3, required: true },
          { name: '復習', description: '前回の内容を振り返る', minutes: 10, required: true },
          { name: '新しい内容学習', description: 'メインの学習時間', minutes: 45, required: true },
          { name: '理解度チェック', description: '学んだ内容を確認', minutes: 10, required: true },
          { name: '学習記録', description: '進捗と感想を記録', minutes: 5, required: false }
        ]
      }
    };

    return templates[type] || null;
  }

// 通知関連のハンドラーメソッド
async handleNotifyCommand(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();
  
  if (group === 'notify') {
    switch (subcommand) {
      case 'reminder':
        return await this.handleNotifyReminder(interaction);
      case 'weekly':
        return await this.handleNotifyWeekly(interaction);
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
  }
}

async handleNotifyReminder(interaction) {
  const userId = interaction.user.id;
  const routineId = interaction.options.getInteger('routine_id');
  const time = interaction.options.getString('time');
  const days = interaction.options.getString('days') || '1,2,3,4,5'; // デフォルト: 平日
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  try {
    await interaction.deferReply();

    // 時刻形式チェック
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return await interaction.editReply({
        content: '❌ 時刻の形式が正しくありません。例: 07:00',
      });
    }

    // ルーティン存在チェック
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    // 通知設定を作成
    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const notificationId = await this.notificationService.setReminder(
      userId, routineId, time, days, channel.id
    );

    const dayNames = {
      '0': '日', '1': '月', '2': '火', '3': '水', 
      '4': '木', '5': '金', '6': '土'
    };
    const dayText = days.split(',').map(d => dayNames[d]).join('・');

    const embed = new EmbedBuilder()
      .setTitle('✅ リマインダーを設定しました！')
      .setDescription(`**${routineInfo.name}** のリマインダーを設定しました。`)
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

async handleNotifyWeekly(interaction) {
  const userId = interaction.user.id;
  const routineId = interaction.options.getInteger('routine_id');
  const day = interaction.options.getInteger('day') ?? 0; // デフォルト: 日曜日
  const time = interaction.options.getString('time') || '20:00';
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  try {
    await interaction.deferReply();

    // 時刻形式チェック
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return await interaction.editReply({
        content: '❌ 時刻の形式が正しくありません。例: 20:00',
      });
    }

    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const notificationId = await this.notificationService.setWeeklyReport(
      userId, routineId, day.toString(), time, channel.id
    );

    const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

    const embed = new EmbedBuilder()
      .setTitle('✅ 週次レポートを設定しました！')
      .setDescription(`**${routineInfo.name}** の週次レポートを設定しました。`)
      .addFields(
        { name: '📊 レポート日', value: dayNames[day], inline: true },
        { name: '⏰ 通知時刻', value: time, inline: true },
        { name: '📍 通知先', value: `<#${channel.id}>`, inline: true },
        { name: '🆔 通知ID', value: notificationId.toString(), inline: true }
      )
      .setColor('#4CAF50')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('週次レポート設定エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ 週次レポートの設定に失敗しました。',
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleNotifyAlert(interaction) {
  const userId = interaction.user.id;
  const routineId = interaction.options.getInteger('routine_id');
  const thresholdDays = interaction.options.getInteger('threshold_days') || 7;
  const thresholdCount = interaction.options.getInteger('threshold_count') || 3;
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  try {
    await interaction.deferReply();

    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    if (!routineInfo) {
      return await interaction.editReply({
        content: '❌ 指定されたIDのルーティンが見つかりません。',
      });
    }

    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const notificationId = await this.notificationService.setLowCompletionAlert(
      userId, routineId, thresholdDays, thresholdCount, channel.id
    );

    const embed = new EmbedBuilder()
      .setTitle('✅ 継続率アラートを設定しました！')
      .setDescription(`**${routineInfo.name}** の継続率アラートを設定しました。`)
      .addFields(
        { name: '📊 チェック期間', value: `${thresholdDays}日間`, inline: true },
        { name: '🎯 最低実行回数', value: `${thresholdCount}回`, inline: true },
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

async handleNotifyList(interaction) {
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const notifications = await this.notificationService.getUserNotifications(userId);

    if (notifications.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 通知設定一覧')
        .setDescription('まだ通知が設定されていません。\n`/routine notify reminder` で通知を設定しましょう！')
        .setColor('#FFC107');

      return await interaction.editReply({ embeds: [embed] });
    }

    const typeNames = {
      'reminder': '⏰ リマインダー',
      'weekly_report': '📊 週次レポート',
      'low_completion': '⚠️ 継続率アラート'
    };

    const notificationList = [];
    for (const notification of notifications) {
      const routineInfo = await this.routineService.getRoutineInfo(notification.routineId);
      const routineName = routineInfo ? routineInfo.name : `ID:${notification.routineId}`;
      
      const statusEmoji = notification.isEnabled ? '🟢' : '🔴';
      const typeText = typeNames[notification.type] || notification.type;
      
      notificationList.push(
        `${statusEmoji} **ID: ${notification.id}** - ${typeText}\n` +
        `   📝 ルーティン: ${routineName}\n` +
        `   ⏰ 時刻: ${notification.time} | 📍 <#${notification.channelId}>`
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 通知設定一覧')
      .setDescription(notificationList.join('\n\n'))
      .addFields({
        name: '💡 操作',
        value: '`/routine notify disable [ID]` で無効化\n`/routine notify test [ID]` でテスト送信',
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

async handleNotifyDisable(interaction) {
  const notificationId = interaction.options.getInteger('notification_id');
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const success = await this.notificationService.disableNotification(notificationId, userId);
    
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

async handleNotifyTest(interaction) {
  const notificationId = interaction.options.getInteger('notification_id');
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (!this.notificationService) {
      return await interaction.editReply({
        content: '❌ 通知サービスが初期化されていません。',
      });
    }

    const success = await this.notificationService.testNotification(notificationId, userId);
    
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

// 新しいメソッドを追加
async handleDebugSheets(interaction) {
  try {
    await interaction.deferReply();
    
    // Google Sheetsの状況を確認
    const data = await this.routineService.googleSheetsService.getData('routine_notifications!A:L');
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Google Sheets デバッグ情報')
      .setDescription('現在のシート状況:')
      .addFields(
        { name: '📋 routine_notifications', value: `${data.length}行のデータ`, inline: true },
        { name: '🔍 ヘッダー', value: data[0] ? data[0].join(', ') : 'なし', inline: false }
      )
      .setColor('#2196F3');

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('デバッグエラー:', error);
    await interaction.editReply({
      content: '❌ デバッグ情報の取得に失敗しました。',
    });
  }
}

  /**
   * ボタンインタラクションハンドラー
   */
// handlers/routineHandler.js のボタンハンドラー部分を修正

async handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    console.log('🔍 ボタンが押されました:', customId);
    console.log('🔍 ユーザーID:', userId);
    
    if (customId === 'routine_next') {
        await this.handleButtonNext(interaction);
    } else if (customId === 'routine_skip') {
        await this.handleButtonSkip(interaction);
    } else if (customId === 'routine_stop') {
        await this.handleButtonStop(interaction);
    }
}

async handleButtonNext(interaction) {
    const userId = interaction.user.id;
    
    try {
        // 🔥 重要：最初に即座に応答してタイムアウトを防ぐ
        await interaction.deferUpdate();
        
        const session = this.activeSessions.get(userId);
        if (!session) {
            return await interaction.editReply({
                content: '❌ 実行中のルーティンがありません。',
                components: []
            });
        }
        
        // 現在のステップ情報を保存（連携処理用）
        const currentStep = session.getCurrentStep();
        const currentStepId = currentStep.stepId;
        const routineId = session.routineId;
        
        console.log('🔗 ステップ完了前の情報:', { 
            userId: userId.substring(0, 6) + '...', 
            routineId, 
            currentStepId, 
            stepName: currentStep.name 
        });
        
        const result = await session.next();
        
        // 🔗 連携処理（非同期で実行してメイン処理を遅延させない）
        if (this.routineHabitLinkService) {
            // 連携処理を別プロセスで実行（awaitしない）
            this.processHabitLinkAsync(userId, routineId, currentStepId);
        }
        
        if (result.completed) {
            // ルーティン完了
            this.activeSessions.delete(userId);
            const embed = this.createCompletionEmbed(session, result);
            
            await interaction.editReply({ embeds: [embed], components: [] });
        } else {
            // 次のステップを表示
            const { embed, components } = this.createStepDisplay(session);
            await interaction.editReply({ embeds: [embed], components });
        }
        
    } catch (error) {
        console.error('ボタンNext処理エラー:', error);
        
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ ステップ処理でエラーが発生しました。',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.editReply({
                    content: '❌ ステップ処理でエラーが発生しました。',
                    components: []
                });
            }
        } catch (replyError) {
            console.error('エラー応答送信失敗:', replyError);
        }
    }
}

// 🔗 非同期で習慣連携処理を実行（メイン処理を遅延させない）
async processHabitLinkAsync(userId, routineId, currentStepId) {
    try {
        console.log('🔗 非同期連携処理開始:', { routineId, currentStepId });
        
        const linkResult = await this.routineHabitLinkService.processStepCompletion(
            userId, 
            routineId, 
            currentStepId, 
            'completed'
        );
        
        if (linkResult) {
            console.log('🔗 習慣自動記録成功 (非同期):', linkResult);
        } else {
            console.log('🔗 連携なし、または既に記録済み (非同期)');
        }
    } catch (linkError) {
        console.error('🔗 非同期連携処理エラー:', linkError);
    }
}

  async startRoutineFromButton(interaction, routineId) {
    const userId = interaction.user.id;

    if (this.activeSessions.has(userId)) {
      return await interaction.reply({
        content: '❌ 既に実行中のルーティンがあります。',
        ephemeral: true
      });
    }

    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    const steps = await this.routineService.getRoutineSteps(routineId);

    if (!routineInfo || steps.length === 0) {
      return await interaction.reply({
        content: '❌ ルーティンまたはステップが見つかりません。',
        ephemeral: true
      });
    }

    const session = await this.routineService.startRoutineSession(userId, routineId, routineInfo, steps);
    this.activeSessions.set(userId, session);

    const { embed, components } = this.createStepDisplay(session);
    await interaction.update({ embeds: [embed], components });
  }

  async showStepsFromButton(interaction, routineId) {
    const routineInfo = await this.routineService.getRoutineInfo(routineId);
    const steps = await this.routineService.getRoutineSteps(routineId);

    if (!routineInfo) {
      return await interaction.reply({
        content: '❌ ルーティンが見つかりません。',
        ephemeral: true
      });
    }

    if (steps.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📝 ${routineInfo.name} - ステップ一覧`)
        .setDescription('まだステップが登録されていません。')
        .setColor('#FFC107');

      return await interaction.update({ embeds: [embed], components: [] });
    }

    const stepList = steps.map(step => {
      const timeText = step.estimatedMinutes > 0 ? `(${step.estimatedMinutes}分)` : '';
      const requiredText = step.isRequired ? '🔴' : '🔵';
      return `${requiredText} **${step.order}.** ${step.name} ${timeText}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`📝 ${routineInfo.name} - ステップ一覧`)
      .setDescription(stepList)
      .setFooter({ text: '🔴=必須 🔵=任意' })
      .setColor('#2196F3');

    await interaction.update({ embeds: [embed], components: [] });
  }

  async confirmDeleteRoutine(interaction, routineId) {
    const success = await this.routineService.deleteRoutine(routineId);
    
    if (success) {
      await interaction.update({
        content: '✅ ルーティンを削除しました。',
        embeds: [],
        components: []
      });
    } else {
      await interaction.update({
        content: '❌ ルーティンの削除に失敗しました。',
        embeds: [],
        components: []
      });
    }
  }

async handleButtonSkip(interaction) {
  const userId = interaction.user.id;
  
  try {
    await interaction.deferUpdate();
    
    const session = this.activeSessions.get(userId);
    
    if (!session) {
      return await interaction.editReply({
        content: '❌ 実行中のルーティンがありません。',
        embeds: [],
        components: []
      });
    }

    const result = await session.skip('ボタンからスキップ');
    
    if (result.completed) {
      this.activeSessions.delete(userId);
      const embed = this.createCompletionEmbed(session, result);
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      const { embed, components } = this.createStepDisplay(session);
      await interaction.editReply({ embeds: [embed], components });
    }
  } catch (error) {
    console.error('ボタンSkip処理エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ステップのスキップに失敗しました。',
          embeds: [],
          components: []
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleButtonPause(interaction) {
  const userId = interaction.user.id;
  
  try {
    await interaction.deferUpdate();
    
    const session = this.activeSessions.get(userId);
    
    if (!session) {
      return await interaction.editReply({
        content: '❌ 実行中のルーティンがありません。',
        embeds: [],
        components: []
      });
    }

    session.pause();
    const { embed, components } = this.createStepDisplay(session);
    await interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    console.error('ボタンPause処理エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ルーティンの一時停止に失敗しました。',
          embeds: [],
          components: []
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}

async handleButtonStop(interaction) {
  const userId = interaction.user.id;
  
  try {
    await interaction.deferUpdate();
    
    const session = this.activeSessions.get(userId);
    
    if (!session) {
      return await interaction.editReply({
        content: '❌ 実行中のルーティンがありません。',
        embeds: [],
        components: []
      });
    }

    await session.abort('ボタンから中断');
    this.activeSessions.delete(userId);

    const embed = new EmbedBuilder()
      .setTitle('⏹️ ルーティンを中断しました')
      .setDescription(`**${session.routineName}** を中断しました。`)
      .setColor('#F44336');

    await interaction.editReply({ embeds: [embed], components: [] });
  } catch (error) {
    console.error('ボタンStop処理エラー:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ ルーティンの中断に失敗しました。',
          embeds: [],
          components: []
        });
      }
    } catch (replyError) {
      console.error('エラー応答送信失敗:', replyError);
    }
  }
}
}

module.exports = RoutineHandler;

