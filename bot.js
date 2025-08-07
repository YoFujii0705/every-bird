// bot.js - 完全版（全機能統合 + 通知システム + ボタン処理修正版 + goals機能追加）

// ===== インポート部分 =====
const { Client, Events, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// コマンドモジュールのインポート
const diaryCommands = require('./commands/diary');
const habitCommands = require('./commands/habit');
const weightCommands = require('./commands/weight');
const goalsCommands = require('./commands/goals'); // 🎯 新追加
const interactionHandler = require('./handlers/interactions');
const routineCommands = require('./commands/routine');
const RoutineHandler = require('./handlers/routineHandler');
const whoamiCommands = require('./commands/whoami');

// 通知システムのインポート
const NotificationManager = require('./handlers/notifications');

// 🔔 Habit通知システムのインポート
const { HabitNotificationService } = require('./services/habitNotificationService');
const HabitNotificationsHandler = require('./handlers/habitNotifications');

// 環境変数の読み込み
require('dotenv').config();

// ===== クライアント設定 =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// 通知マネージャーのインスタンス
let notificationManager;
let routineHandler;
let habitNotificationService;
let habitNotificationsHandler;

// コマンド配列の作成
const commands = [
    diaryCommands.createCommand(),
    habitCommands.createCommand(),
    weightCommands.createCommand(),
    goalsCommands.createCommand(), // 🎯 新追加
    whoamiCommands.createCommand(), // 🌟 新追加
    routineCommands.createCommand(), 
    
    // 🔔 通知テスト用コマンド
    new SlashCommandBuilder()
        .setName('test-notification')
        .setDescription('通知システムのテスト')
        .addSubcommand(subcommand =>
            subcommand
                .setName('weight')
                .setDescription('体重記録リマインダーをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('diary')
                .setDescription('日記リマインダーをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('habit')
                .setDescription('習慣サマリーをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('weekly')
                .setDescription('週次レポートをテスト'))
        .addSubcommand(subcommand =>  // 🌟 新追加
            subcommand
                .setName('whoami')
                .setDescription('Who Am I リマインダーをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('habit-notification')
                .setDescription('🔔 習慣通知をテスト'))
                
].map(command => command.toJSON());

// REST APIの設定
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const sheetsUtils = require('./utils/sheets');

// Bot起動時に実行
async function initializeBot() {
    try {
        // 食事記録用シートの初期化
        await sheetsUtils.initializeMealLogsSheet();
        console.log('✅ 食事記録シートの初期化完了');
// Who Am I用シートの初期化 🌟 新追加
        await sheetsUtils.initializeWhoAmISheet();
        console.log('✅ Who Am I シートの初期化完了');
   // 🔔 習慣通知用シートの初期化
        await initializeHabitNotificationSheet();
        console.log('✅ 習慣通知シートの初期化完了');

    } catch (error) {
        console.error('❌ 初期化エラー:', error);
    }
}

// 🔔 習慣通知用シートの初期化
async function initializeHabitNotificationSheet() {
    try {
        const data = await sheetsUtils.getSheetData('habit_notifications', 'A:L');
        
        // ヘッダーが存在しない場合は初期化
        if (!data || data.length === 0 || !data[0] || data[0].length === 0) {
            console.log('📝 habit_notificationsシートのヘッダーを作成中...');
            
            const headers = [
                'notification_id', 'user_id', 'habit_id', 'notification_type', 
                'is_enabled', 'notification_time', 'days_of_week', 'channel_id',
                'threshold_days', 'threshold_count', 'last_sent', 'created_at'
            ];
            
            await sheetsUtils.saveToSheet('habit_notifications', headers);
            console.log('✅ habit_notificationsシートのヘッダーを作成しました');
        } else {
            console.log('✅ habit_notificationsシートは既に存在します');
        }
    } catch (error) {
        console.error('❌ habit_notificationsシート初期化エラー:', error);
        // エラーが発生してもBot起動は続行
    }
}

// Botが起動したら実行
client.once('ready', async () => {
    console.log('Bot is ready!');
    await initializeBot();
});

// ===== Ready イベント =====
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ ${readyClient.user.tag} がログインしました！`);
    
    // コマンド登録
    try {
        console.log('🔄 スラッシュコマンドを登録中...');
        
        // グローバルコマンドとして登録
        await rest.put(
            Routes.applicationCommands(readyClient.user.id),
            { body: commands }
        );
        
        console.log('✅ スラッシュコマンドを登録しました');
    } catch (error) {
        console.error('❌ コマンド登録エラー:', error);
    }
    
    // 通知システムを初期化
    try {
        notificationManager = new NotificationManager(client);
        notificationManager.initialize();
    } catch (error) {
        console.error('通知システム初期化エラー:', error);
    }

// ルーティンハンドラーを初期化
try {
    routineHandler = new RoutineHandler();
    console.log('🔄 ルーティンハンドラーを初期化しました');
    
    // デバッグ情報を出力
    console.log('🔍 ルーティンサービス確認:', {
        hasRoutineService: !!routineHandler.routineService,
        routineServiceType: routineHandler.routineService?.constructor?.name,
        hasGoogleSheetsService: !!routineHandler.routineService?.googleSheetsService
    });
    
} catch (error) {
    console.error('ルーティンハンドラー初期化エラー:', error);
}

// ルーティン通知システムを初期化
try {
    const { RoutineNotificationService } = require('./services/routineNotificationService');
    const routineNotificationService = new RoutineNotificationService(client, routineHandler.routineService);
    
    // ハンドラーに通知サービスを設定
    routineHandler.notificationService = routineNotificationService;
    
    // 既存の通知をロード
    await routineNotificationService.loadAllNotifications();
    
    console.log('🔔 ルーティン通知システムを初期化しました');
} catch (error) {
    console.error('ルーティン通知システム初期化エラー:', error);
}

  // 🔔 Habit通知システムを初期化
    try {
        console.log('🔔 Habit通知システム初期化中...');
        
        // Habit通知サービスを初期化
        habitNotificationService = new HabitNotificationService(client, sheetsUtils);
        habitNotificationsHandler = new HabitNotificationsHandler(habitNotificationService, sheetsUtils);
        
        // グローバルに設定（habit.jsから参照するため）
        global.habitNotificationsHandler = habitNotificationsHandler;
        
        // Habit通知をロード
        await habitNotificationService.loadAllNotifications();
        console.log('✅ Habit通知システム初期化完了');
        
    } catch (error) {
        console.error('❌ Habit通知システム初期化エラー:', error);
    }
 
    console.log('🤖 Botが正常に起動しました！');
});

// ===== インタラクション処理（修正版・重複削除） =====
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            switch (commandName) {
                case 'diary':
                    await diaryCommands.handleCommand(interaction);
                    break;
                case 'habit':
                    await habitCommands.handleCommand(interaction);
                    break;
                case 'weight':
                    await weightCommands.handleCommand(interaction);
                    break;
                case 'goals':
                    await goalsCommands.handleCommand(interaction);
                    break;
                case 'whoami':
                    await whoamiCommands.handleCommand(interaction);
                    break;
                case 'test-notification':
                    await handleTestNotification(interaction);
                    break;
                case 'routine':
                    await routineCommands.handleCommand(interaction, routineHandler);
                    break;
            }

        } else if (interaction.isButton()) {
            // ボタンインタラクション処理
            const customId = interaction.customId;
            console.log('🔍 ボタンが押されました:', customId);
            console.log('🔍 ユーザーID:', interaction.user.id);
            
            // ⭐ 最初に必ずdeferを実行（3秒ルール対策）
            try {
                if (!interaction.deferred && !interaction.replied) {
                    // updateかreplyかは処理内容によって決める
                    if (customId.includes('quick_done') || customId.includes('snooze')) {
                        await interaction.deferUpdate(); // メッセージを更新する場合
                    } else {
                        await interaction.deferReply({ ephemeral: true }); // 新しい返信の場合
                    }
                }
            } catch (deferError) {
                console.error('defer実行エラー:', deferError);
                return; // deferに失敗したら処理を中断
            }
            
            try {
                // 🔔 Habit通知関連のボタン処理
                if (customId.startsWith('habit_quick_done_') || 
                    customId.startsWith('habit_snooze_') ||
                    customId === 'habit_calendar_view' ||
                    customId === 'habit_new_month_goals') {
                    
                    console.log('🔔 Habit通知ボタンを検出:', customId);
                    
                    if (habitNotificationsHandler) {
                        console.log('✅ Habit通知ハンドラーに処理を委譲');
                        await habitNotificationsHandler.handleButtonInteraction(interaction);
                        console.log('✅ Habit通知ボタン処理完了');
                        return;
                    } else {
                        console.log('❌ Habit通知ハンドラーが見つかりません');
                        await interaction.editReply({
                            content: '❌ Habit通知ハンドラーが初期化されていません。'
                        });
                        return;
                    }
                }

                // Who Am I 関連のボタン処理
                if (customId.startsWith('whoami_') || customId === 'whoami_setup_start') {
                    console.log('🌟 Who Am I ボタンを検出:', customId);
                    await whoamiCommands.handleButtonInteraction(interaction);
                    return;
                }

                // 緊急修正: ルーティンボタン処理（bot.js内）
if (customId.startsWith('routine_') || 
    ['routine_next', 'routine_skip', 'routine_pause', 'routine_stop'].includes(customId)) {
    
    console.log('🔄 ルーティンボタンを検出:', customId);
    
    try {
        // まず簡単なテスト応答
        if (customId === 'routine_start_1') {
            await interaction.editReply({
                content: '🧪 テスト: ルーティン開始ボタンが押されました！',
                components: []
            });
            return;
        }
        
        // 他のルーティンボタンの場合
        if (routineHandler) {
            console.log('✅ ルーティンハンドラーに処理を委譲');
            
            // タイムアウト対策
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('処理タイムアウト')), 2000);
            });
            
            await Promise.race([
                routineHandler.handleButtonInteraction(interaction),
                timeoutPromise
            ]);
            
            console.log('✅ ルーティンボタン処理完了');
        } else {
            console.log('❌ ルーティンハンドラーが見つかりません');
            await interaction.editReply({
                content: '❌ ルーティンハンドラーが初期化されていません。'
            });
        }
    } catch (error) {
        console.error('❌ ルーティンボタン処理エラー:', error);
        
        try {
            await interaction.editReply({
                content: `❌ ルーティン処理エラー: ${error.message}`,
                components: []
            });
        } catch (replyError) {
            console.error('エラーメッセージ送信失敗:', replyError);
        }
    }
    return;
}
                
                // 🎯 統合目標ダッシュボードのボタン処理
                if (customId === 'goals_dashboard') {
                    // ダッシュボードに戻るボタン
                    if (!interaction.deferred) await interaction.deferUpdate();
                    await goalsCommands.handleGoalsDashboard(interaction);
                    
                } else if (customId === 'goals_refresh') {
                    // 更新ボタン（現在のページを再表示）
                    if (!interaction.deferred) await interaction.deferUpdate();
                    
                    // 現在表示中のページを判定して適切な関数を呼び出し
                    const embed = interaction.message.embeds[0];
                    const title = embed?.title || '';
                    
                    if (title.includes('統合目標ダッシュボード')) {
                        await goalsCommands.handleGoalsDashboard(interaction);
                    } else if (title.includes('達成バッジ・実績')) {
                        await goalsCommands.handleGoalsAchievements(interaction);
                    } else if (title.includes('目標達成カレンダー')) {
                        await goalsCommands.handleGoalsCalendar(interaction);
                    } else {
                        // デフォルトはダッシュボード
                        await goalsCommands.handleGoalsDashboard(interaction);
                    }
                    
                } else if (customId === 'goals_achievements') {
                    // 実績表示ボタン（ダッシュボードから）
                    if (!interaction.deferred) await interaction.deferUpdate();
                    await goalsCommands.handleGoalsAchievements(interaction);
                    
                } else if (customId === 'goals_calendar') {
                    // カレンダー表示ボタン（ダッシュボードから）
                    console.log('🔍 goals_calendarボタンが押されました');
                    
                    try {
                        if (!interaction.deferred && !interaction.replied) {
                            console.log('🔄 deferUpdateを実行中...');
                            await interaction.deferUpdate();
                        }
                        
                        console.log('📅 goalsCommands.handleGoalsCalendarを呼び出し中...');
                        await goalsCommands.handleGoalsCalendar(interaction);
                        console.log('✅ カレンダー表示完了');
                        
                    } catch (error) {
                        console.error('❌ goals_calendarボタンエラー:', error);
                        
                        try {
                            if (interaction.deferred) {
                                await interaction.editReply({ 
                                    content: '❌ カレンダーの表示中にエラーが発生しました。', 
                                    embeds: [],
                                    components: []
                                });
                            } else if (!interaction.replied) {
                                await interaction.reply({ 
                                    content: '❌ カレンダーの表示中にエラーが発生しました。', 
                                    ephemeral: true 
                                });
                            }
                        } catch (replyError) {
                            console.error('エラーメッセージ送信失敗:', replyError);
                        }
                    }
                    
                } else if (customId.startsWith('goals_calendar_') && customId !== 'goals_calendar_today') {
                    // カレンダーナビゲーション処理（前月/次月）
                    if (!interaction.deferred) await interaction.deferUpdate();
                    await handleGoalsCalendarNavigation(interaction);
                    
                } else if (customId === 'goals_calendar_today') {
                    // 今月に戻るボタン
                    if (!interaction.deferred) await interaction.deferUpdate();
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = today.getMonth() + 1;
                    await showGoalsCalendar(interaction, year, month);
                    
                // 既存のボタン処理
                } else if (customId === 'quick_weight_record') {
                    // クイック体重記録のモーダルを表示
                    await showQuickWeightModal(interaction);
                    
                } else if (customId.startsWith('weight_record_')) {
                    // 特定ユーザーの体重記録
                    const userId = customId.replace('weight_record_', '');
                    if (interaction.user.id === userId) {
                        await showQuickWeightModal(interaction);
                    } else {
                        await interaction.editReply({ 
                            content: 'これはあなた向けのリマインダーではありません。' 
                        });
                    }
                    
                } else if (customId === 'write_diary') {
                    // 日記書くボタン - モーダルを直接表示
                    await showDiaryModal(interaction);
                    
                } else if (customId === 'add_habit') {
                    // 習慣追加ボタン - モーダルを直接表示
                    await showAddHabitModal(interaction);
                    
                } else if (customId === 'quick_done') {
                    // 習慣完了ボタン - 習慣一覧を表示
                    await showHabitQuickDoneSelect(interaction);
                    
                } else if (customId === 'habit_list') {
                    // 習慣一覧ボタン - 習慣一覧を表示
                    await showHabitListMessage(interaction);
                    
                } else if (customId === 'view_weekly_stats') {
                    // 週次統計を表示
                    await showWeeklyStats(interaction);
                    
                } else if (customId === 'set_weekly_goals') {
                    // 週次目標設定
                    await showWeeklyGoalsModal(interaction);
                    
                } else if (customId.startsWith('habit_delete_confirm_')) {
                    // 習慣削除確認
                    const habitId = customId.replace('habit_delete_confirm_', '');
                    await habitCommands.executeHabitDelete(interaction, habitId);
                    
                } else if (customId === 'habit_delete_cancel') {
                    // 習慣削除キャンセル
                    await interaction.update({ 
                        content: '削除をキャンセルしました。',
                        embeds: [],
                        components: []
                    });
                    
                } else if (customId.startsWith('calendar_')) {
                    // カレンダーナビゲーション処理（習慣用）
                    await habitCommands.handleCalendarNavigation(interaction);
                    
                } else if (customId === 'diary_goal_frequency') {
                    await handleDiaryGoalFrequency(interaction);
                    
                } else if (customId === 'diary_goal_mood') {
                    await handleDiaryGoalMood(interaction);
                    
                } else if (customId === 'diary_goal_review') {
                    await handleDiaryGoalReview(interaction);
                    
                } else if (customId === 'diary_goal_progress_button') {
                    await handleDiaryGoalProgressButton(interaction);
                    
                } else if (customId === 'diary_review_save') {
                    // 振り返り保存ボタン
                    await handleDiaryReviewSave(interaction);
                    
                } else if (customId === 'diary_review_share') {
                    // 振り返り詳細表示ボタン
                    await handleDiaryReviewShare(interaction);
                    
                } else {
                    // 既存のボタン処理（日記、習慣など）
                    await interactionHandler.handleInteraction(interaction);
                }
                
            } catch (error) {
                console.error('ボタン処理エラー:', error);
                try {
                    if (interaction.deferred) {
                        await interaction.editReply({ 
                            content: 'ボタン処理中にエラーが発生しました。'
                        });
                    } else if (!interaction.replied) {
                        await interaction.reply({ 
                            content: 'ボタン処理中にエラーが発生しました。', 
                            ephemeral: true 
                        });
                    }
                } catch (replyError) {
                    console.error('エラーメッセージ送信失敗:', replyError);
                }
            }
            
        } else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            
            try {
                if (customId === 'habit_done_select') {
                    // 習慣完了選択
                    await habitCommands.handleHabitDoneSelect(interaction);
                } else if (customId === 'habit_edit_select') {
                    // 習慣編集選択
                    await habitCommands.handleHabitEditSelect(interaction);
                } else if (customId === 'habit_delete_select') {
                    // 習慣削除選択
                    await habitCommands.handleHabitDeleteSelect(interaction);
                } else if (customId === 'quick_done_select') {
                    // クイック完了選択
                    await handleQuickDoneSelect(interaction);
                } else if (customId === 'diary_mood_first_select') {
                    // 日記気分選択（最初）
                    await handleDiaryMoodFirstSelect(interaction);
                } else if (customId === 'diary_content_modal') {
                    await handleDiaryContentSubmit(interaction);
                } else {
                    // 既存のセレクトメニュー処理
                    await interactionHandler.handleInteraction(interaction);
                }
            } catch (error) {
                console.error('セレクトメニュー処理エラー:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'セレクトメニュー処理中にエラーが発生しました。', 
                        ephemeral: true 
                    });
                }
            }
            
        } else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            
            try {
                // Who Am I モーダル処理
                if (customId.startsWith('whoami_edit_')) {
                    const handled = await whoamiCommands.handleModalSubmit(interaction);
                    if (handled) return;
                }
                
                // 既存のモーダル処理
                if (customId === 'quick_weight_modal') {
                    // クイック体重記録の処理
                    await handleQuickWeightSubmit(interaction);
                } else if (customId === 'weekly_goals_modal') {
                    // 週次目標設定の処理
                    await handleWeeklyGoalsSubmit(interaction);
                } else if (customId === 'diary_modal') {
                    // 旧日記モーダル（削除予定）
                    await handleDiarySubmit(interaction);
                } else if (customId === 'diary_content_modal') {
                    // 新日記本文モーダル
                    await handleDiaryContentSubmit(interaction);
                } else if (customId === 'add_habit_modal') {
                    // 習慣追加モーダルの処理
                    await handleAddHabitSubmit(interaction);
                } else if (customId.startsWith('habit_edit_modal_')) {
                    // 習慣編集モーダル
                    const habitId = customId.replace('habit_edit_modal_', '');
                    await habitCommands.saveHabitEdit(interaction, habitId);
                } else if (customId === 'diary_goal_frequency_modal') {
                    await handleDiaryGoalFrequencySubmit(interaction);
                } else if (customId === 'diary_goal_mood_modal') {
                    await handleDiaryGoalMoodSubmit(interaction);
                } else if (customId === 'diary_goal_review_modal') {
                    await handleDiaryGoalReviewSubmit(interaction);
                } else {
                    // 既存のモーダル処理（日記、習慣など）
                    await interactionHandler.handleInteraction(interaction);
                }
            } catch (error) {
                console.error('モーダル処理エラー:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'モーダル処理中にエラーが発生しました。', 
                        ephemeral: true 
                    });
                }
            }
            
        } else {
            // その他のインタラクション
            await interactionHandler.handleInteraction(interaction);
        }
    } catch (error) {
        console.error('インタラクション処理エラー:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: 'エラーが発生しました。しばらく後にもう一度お試しください。', 
                ephemeral: true 
            });
        }
    }
});

// ===== 🎯 統合目標ダッシュボード用のヘルパー関数 =====

// 目標カレンダー表示（update版）
async function showGoalsCalendar(interaction, year, month) {
    try {
        // 既にdeferされているかチェック
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }
        
        // 仮のカレンダーオプションを作成
        const fakeOptions = {
            getInteger: (name) => {
                if (name === 'year') return year;
                if (name === 'month') return month;
                return null;
            }
        };
        
        // 一時的にoptionsを置き換え
        const originalOptions = interaction.options;
        interaction.options = fakeOptions;
        
        // handleGoalsCalendarを呼び出し（deferは既に実行済み）
        await goalsCommands.handleGoalsCalendar(interaction);
        
        // optionsを元に戻す
        interaction.options = originalOptions;
        
    } catch (error) {
        console.error('目標カレンダー表示エラー:', error);
        
        const errorMessage = '❌ カレンダーの表示中にエラーが発生しました。';
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        } else if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
    }
}

// ===== 通知テスト用関数（habit通知追加版） =====
async function handleTestNotification(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (!notificationManager) {
        await interaction.reply({ 
            content: '❌ 通知システムが初期化されていません。', 
            ephemeral: true 
        });
        return;
    }
    
    try {
        switch (subcommand) {
            case 'weight':
                await notificationManager.testNotification('weight');
                await interaction.reply({ 
                    content: '⚖️ 体重記録リマインダーをテスト送信しました。', 
                    ephemeral: true 
                });
                break;
                
            case 'diary':
                await notificationManager.testNotification('diary');
                await interaction.reply({ 
                    content: '📝 日記リマインダーをテスト送信しました。', 
                    ephemeral: true 
                });
                break;
                
            case 'habit':
                await notificationManager.testNotification('habit');
                await interaction.reply({ 
                    content: '🏃‍♂️ 習慣サマリーをテスト送信しました。', 
                    ephemeral: true 
                });
                break;
                
            case 'weekly':
                await notificationManager.testNotification('weekly');
                await interaction.reply({ 
                    content: '📊 週次レポートをテスト送信しました。', 
                    ephemeral: true 
                });
                break;
                
           case 'whoami':
                await notificationManager.testNotification('whoami');
                await interaction.reply({ 
                    content: '🌟 Who Am I リマインダーをテスト送信しました。', 
                    ephemeral: true 
                });
                break;

            case 'habit-notification':
                // 🔔 Habit通知のテスト送信
                if (habitNotificationService) {
                    // テスト用のリマインダー通知を送信
                    const channel = interaction.channel;
                    const userId = interaction.user.id;
                    
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔔 【テスト】習慣リマインダー')
                        .setDescription(`<@${userId}> これはテスト通知です！`)
                        .addFields(
                            { name: '📝 習慣名', value: 'テスト習慣', inline: true },
                            { name: '⚡ 難易度', value: '🟡 normal', inline: true },
                            { name: '📅 頻度', value: 'daily', inline: true }
                        )
                        .setColor('#00BCD4')
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`habit_quick_done_test`)
                                .setLabel('✅ テスト完了！')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`habit_snooze_test`)
                                .setLabel('⏰ 30分後')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await channel.send({ embeds: [embed], components: [row] });
                    
                    await interaction.reply({ 
                        content: '🔔 習慣通知をテスト送信しました。', 
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: '❌ 習慣通知サービスが初期化されていません。', 
                        ephemeral: true 
                    });
                }
                break;

            default:
                await interaction.reply({ 
                    content: '❌ 不明な通知タイプです。', 
                    ephemeral: true 
                });
        }
    } catch (error) {
        console.error('通知テストエラー:', error);
        await interaction.reply({ 
            content: '❌ 通知テスト中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// ===== 通知システム用のヘルパー関数 =====

// クイック体重記録モーダル
async function showQuickWeightModal(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('quick_weight_modal')
        .setTitle('体重記録');

    const weightInput = new TextInputBuilder()
        .setCustomId('weight_value')
        .setLabel('体重（kg）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 70.5')
        .setRequired(true)
        .setMaxLength(10);

    const memoInput = new TextInputBuilder()
        .setCustomId('weight_memo')
        .setLabel('メモ（体調など）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 調子良い、むくんでる、など')
        .setRequired(false)
        .setMaxLength(100);

    const weightRow = new ActionRowBuilder().addComponents(weightInput);
    const memoRow = new ActionRowBuilder().addComponents(memoInput);

    modal.addComponents(weightRow, memoRow);
    
    await interaction.showModal(modal);
}

// クイック体重記録の処理（タイムアウト対策版）
async function handleQuickWeightSubmit(interaction) {
    const weightValue = interaction.fields.getTextInputValue('weight_value');
    const memo = interaction.fields.getTextInputValue('weight_memo') || '';
    
    const weight = parseFloat(weightValue);
    
    if (isNaN(weight) || weight < 20 || weight > 300) {
        await interaction.reply({ 
            content: '❌ 有効な体重を入力してください（20-300kg）', 
            flags: 64 
        });
        return;
    }
    
    try {
        // 最初に defer してタイムアウトを防ぐ
        await interaction.deferReply();
        
        const moment = require('moment');
        const sheetsUtils = require('./utils/sheets');
        const calculations = require('./utils/calculations');
        const { EmbedBuilder } = require('discord.js');
        
        const userId = interaction.user.id;
        const today = moment().format('YYYY-MM-DD');
        
        // 前回の記録を取得（保存前に取得）
        const lastEntry = await sheetsUtils.getLatestWeightEntry(userId);
        
        // 体重を保存
        await sheetsUtils.saveWeightToSheet(userId, today, weight, memo);
        
        // 前回比の計算
        let changeText = '';
        if (lastEntry && lastEntry.weight && lastEntry.date !== today) {
            const change = weight - parseFloat(lastEntry.weight);
            if (change > 0) {
                changeText = `前回比: +${change.toFixed(1)}kg`;
            } else if (change < 0) {
                changeText = `前回比: ${change.toFixed(1)}kg`;
            } else {
                changeText = '前回比: 変化なし';
            }
        }
        
        // 初回からの変化を計算（エラーハンドリング付き）
        let firstChangeText = '';
        let firstChangeData = null;
        try {
            firstChangeData = await calculations.getChangeFromFirst(userId);
            if (firstChangeData && firstChangeData.change !== '0.0') {
                firstChangeText = ` 開始時比: ${firstChangeData.changeText}`;
            }
        } catch (changeError) {
            console.error('初回からの変化計算エラー:', changeError);
            // エラーが発生してもメイン処理は続行
        }
        
        // 最終的な変化テキスト
        const fullChangeText = changeText + firstChangeText;
        
        const embed = new EmbedBuilder()
            .setTitle('⚖️ 体重を記録しました')
            .setDescription(`**${weight}kg** ${fullChangeText}`)
            .addFields(
                { name: '日付', value: today, inline: true },
                { name: 'メモ', value: memo || 'なし', inline: true }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        // 初回からの変化詳細情報を追加（情報がある場合のみ）
        if (firstChangeData) {
            embed.addFields({
                name: '📊 記録詳細',
                value: `開始日: ${firstChangeData.startDate}\n記録期間: ${firstChangeData.daysSinceStart}日`,
                inline: false
            });
        }
        
        // deferReply を使用しているので editReply で応答
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('クイック体重記録エラー:', error);
        
        // エラー時の応答
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: '体重の記録中にエラーが発生しました。' });
            } else {
                await interaction.reply({ content: '体重の記録中にエラーが発生しました。', flags: 64 });
            }
        } catch (replyError) {
            console.error('エラー応答失敗:', replyError);
        }
    }
}

// コンテンツを指定した文字数で分割する関数
function splitContent(content, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    // 文を単位で分割（句読点で区切る）
    const sentences = content.split(/([。！？\n])/);
    
    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = (sentences[i] || '') + (sentences[i + 1] || '');
        
        if (currentChunk.length + sentence.length <= maxLength) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                // 1つの文が長すぎる場合は強制的に分割
                chunks.push(sentence.substring(0, maxLength));
                currentChunk = sentence.substring(maxLength);
            }
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

// 日記Embed作成関数（長文対応）
function createDiaryEmbed(date, mood, content) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('📝 日記を保存しました')
        .setColor(0x9B59B6)
        .setTimestamp();

    // 基本情報をfieldで表示
    embed.addFields(
        { name: '📅 日付', value: date, inline: true },
        { name: '😊 気分', value: mood, inline: true }
    );

    // コンテンツの長さに応じて処理を分岐
    if (content.length <= 4000) {
        // 4000文字以下ならdescriptionに全て表示
        embed.setDescription(`**今日の日記**\n${content}`);
    } else {
        // 4000文字を超える場合は分割
        const chunks = splitContent(content, 1020); // field valueの制限を考慮
        
        embed.setDescription('**今日の日記**');
        
        chunks.forEach((chunk, index) => {
            const fieldName = index === 0 ? '📖 内容' : `📖 内容 (続き ${index + 1})`;
            embed.addFields({ name: fieldName, value: chunk, inline: false });
        });
    }

    return embed;
}

// 日記モーダル表示 → 気分選択表示に変更
async function showDiaryModal(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    // 気分選択用のセレクトメニューを表示
    const moodOptions = [
        { label: '😊 最高', value: '😊', description: '今日はとても良い気分です' },
        { label: '🙂 良い', value: '🙂', description: '今日は良い気分です' },
        { label: '😐 普通', value: '😐', description: '普通の気分です' },
        { label: '😔 悪い', value: '😔', description: '今日は少し気分が良くないです' },
        { label: '😞 最悪', value: '😞', description: '今日はとても気分が悪いです' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('diary_mood_first_select')
        .setPlaceholder('今日の気分を選択してください')
        .addOptions(moodOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle('📝 今日の気分を選択')
        .setDescription('まず今日の気分を選択してから、日記を書きましょう。')
        .setColor(0x9B59B6);

    await interaction.reply({
        embeds: [embed],
        components: [row],
    });
}

// 最初の気分選択処理（新規）
async function handleDiaryMoodFirstSelect(interaction) {
    const mood = interaction.values[0];
    
    // 選択された気分を一時保存
    global.tempDiaryData = global.tempDiaryData || {};
    global.tempDiaryData[interaction.user.id] = { mood: mood };
    
    // 日記本文入力モーダルを表示
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('diary_content_modal')
        .setTitle(`今日の日記を書く ${mood}`);

    const contentInput = new TextInputBuilder()
        .setCustomId('diary_content')
        .setLabel('今日の出来事・感想')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('今日どんなことがありましたか？')
        .setRequired(true)
        .setMaxLength(2000);

    const contentRow = new ActionRowBuilder().addComponents(contentInput);
    modal.addComponents(contentRow);
    
    await interaction.showModal(modal);
}

// 日記本文入力モーダル処理（修正版・長文対応）
async function handleDiaryContentSubmit(interaction) {
    const content = interaction.fields.getTextInputValue('diary_content');
    
    try {
        const userId = interaction.user.id;
        const today = require('moment')().format('YYYY-MM-DD');
        const sheetsUtils = require('./utils/sheets');
        
        // 一時保存された気分を取得
        global.tempDiaryData = global.tempDiaryData || {};
        const tempData = global.tempDiaryData[userId];
        
        if (!tempData || !tempData.mood) {
            await interaction.reply({
                content: '❌ 気分選択データが見つかりません。もう一度やり直してください。',
                ephemeral: true
            });
            return;
        }
        
        const mood = tempData.mood;
        
        // 日記を保存
        await sheetsUtils.saveDiaryToSheet(userId, today, content, mood);
        
        // 一時データを削除
        delete global.tempDiaryData[userId];
        
        // 修正されたEmbed作成（長文対応版）
        const embed = createDiaryEmbed(today, mood, content);
        
        await interaction.reply({
            embeds: [embed],
        });
        
    } catch (error) {
        console.error('日記保存エラー:', error);
        await interaction.reply({
            content: '❌ 日記の保存中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// 習慣追加モーダル表示
async function showAddHabitModal(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('add_habit_modal')
        .setTitle('新しい習慣を追加');

    const nameInput = new TextInputBuilder()
        .setCustomId('habit_name')
        .setLabel('習慣名')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 朝の散歩、読書、瞑想')
        .setRequired(true)
        .setMaxLength(50);

    const frequencyInput = new TextInputBuilder()
        .setCustomId('habit_frequency')
        .setLabel('頻度')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('daily, weekly, custom')
        .setRequired(true)
        .setMaxLength(20);

    const difficultyInput = new TextInputBuilder()
        .setCustomId('habit_difficulty')
        .setLabel('難易度')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('easy, normal, hard')
        .setRequired(true)
        .setMaxLength(20);

    const nameRow = new ActionRowBuilder().addComponents(nameInput);
    const frequencyRow = new ActionRowBuilder().addComponents(frequencyInput);
    const difficultyRow = new ActionRowBuilder().addComponents(difficultyInput);

    modal.addComponents(nameRow, frequencyRow, difficultyRow);
    
    await interaction.showModal(modal);
}

// 習慣クイック完了選択
async function showHabitQuickDoneSelect(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
        const sheetsUtils = require('./utils/sheets');
        const habits = await sheetsUtils.getUserHabits(userId);
        
        if (habits.length === 0) {
            await interaction.reply({
                content: '❌ 登録された習慣がありません。まず `/habit add` で習慣を追加してください。',
                ephemeral: true
            });
            return;
        }

        const today = require('moment')().format('YYYY-MM-DD');
        const todayLogs = await sheetsUtils.getHabitLogsInRange(userId, today, today);
        
        // 今日未完了の習慣のみフィルタリング
        const pendingHabits = habits.filter(habit => 
            !todayLogs.some(log => log.habitId === habit.id)
        );

        if (pendingHabits.length === 0) {
            await interaction.reply({
                content: '🎉 今日の習慣はすべて完了しています！',
            });
            return;
        }

        const options = pendingHabits.map(habit => ({
            label: habit.name,
            value: habit.id,
            description: `頻度: ${habit.frequency} | 難易度: ${habit.difficulty}`,
            emoji: habit.difficulty === 'easy' ? '🟢' : habit.difficulty === 'normal' ? '🟡' : '🔴'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('quick_done_select')
            .setPlaceholder('完了する習慣を選択してください')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🏃‍♂️ 習慣を完了する')
            .setDescription(`今日未完了の習慣: ${pendingHabits.length}個`)
            .setColor(0x3498DB);

        await interaction.reply({
            embeds: [embed],
            components: [row],
        });

    } catch (error) {
        console.error('習慣クイック完了選択エラー:', error);
        await interaction.reply({
            content: '❌ 習慣一覧の取得中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// 習慣一覧表示
async function showHabitListMessage(interaction) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
        const sheetsUtils = require('./utils/sheets');
        const habits = await sheetsUtils.getUserHabits(userId);
        
        if (habits.length === 0) {
            await interaction.reply({
                content: '❌ 登録された習慣がありません。まず `/habit add` で習慣を追加してください。',
                ephemeral: true
            });
            return;
        }

        const today = require('moment')().format('YYYY-MM-DD');
        const todayLogs = await sheetsUtils.getHabitLogsInRange(userId, today, today);
        
        let habitList = '';
        habits.forEach(habit => {
            const isCompleted = todayLogs.some(log => log.habitId === habit.id);
            const status = isCompleted ? '✅' : '⭕';
            const difficulty = habit.difficulty === 'easy' ? '🟢' : habit.difficulty === 'normal' ? '🟡' : '🔴';
            habitList += `${status} ${difficulty} **${habit.name}** (${habit.frequency})\n`;
        });

        const completedCount = todayLogs.length;
        const totalCount = habits.length;

        const embed = new EmbedBuilder()
            .setTitle('📋 あなたの習慣一覧')
            .setDescription(habitList)
            .addFields(
                { name: '📊 今日の進捗', value: `${completedCount}/${totalCount} 完了`, inline: true },
                { name: '📅 日付', value: today, inline: true }
            )
            .setColor(0x3498DB);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('quick_done')
                    .setLabel('習慣を完了')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('add_habit')
                    .setLabel('習慣を追加')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('➕')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row],
        });

    } catch (error) {
        console.error('習慣一覧表示エラー:', error);
        await interaction.reply({
            content: '❌ 習慣一覧の取得中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// 週次統計表示
async function showWeeklyStats(interaction) {
    const { EmbedBuilder } = require('discord.js');
    const moment = require('moment');
    
    const lastWeekEnd = moment().subtract(1, 'day').endOf('isoWeek');
    const lastWeekStart = lastWeekEnd.clone().startOf('isoWeek');
    
    try {
        const userId = interaction.user.id;
        const sheetsUtils = require('./utils/sheets');
        
        const weightEntries = await sheetsUtils.getWeightEntriesInRange(
            userId, 
            lastWeekStart.format('YYYY-MM-DD'), 
            lastWeekEnd.format('YYYY-MM-DD')
        );
        
        const diaryEntries = await sheetsUtils.getDiaryEntriesInRange(
            userId, 
            lastWeekStart.format('YYYY-MM-DD'), 
            lastWeekEnd.format('YYYY-MM-DD')
        );
        
        const habitLogs = await sheetsUtils.getHabitLogsInRange(
            userId, 
            lastWeekStart.format('YYYY-MM-DD'), 
            lastWeekEnd.format('YYYY-MM-DD')
        );
        
        const embed = new EmbedBuilder()
            .setTitle('📊 週次統計')
            .setDescription(`${lastWeekStart.format('MM/DD')} - ${lastWeekEnd.format('MM/DD')}`)
            .addFields(
                { name: '⚖️ 体重記録', value: `${weightEntries.length}/7日`, inline: true },
                { name: '📝 日記', value: `${diaryEntries.length}/7日`, inline: true },
                { name: '🏃‍♂️ 習慣', value: `${habitLogs.length}回実行`, inline: true }
            )
            .setColor(0x3498DB)
            .setTimestamp();
        
        if (weightEntries.length >= 2) {
            const firstWeight = parseFloat(weightEntries[0].weight);
            const lastWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
            const change = lastWeight - firstWeight;
            const changeText = change >= 0 ? `+${change.toFixed(1)}kg` : `${change.toFixed(1)}kg`;
            
            embed.addFields({ name: '📈 体重変化', value: changeText, inline: true });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('週次統計エラー:', error);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 週次統計')
            .setDescription(`${lastWeekStart.format('MM/DD')} - ${lastWeekEnd.format('MM/DD')}`)
            .addFields(
                { name: '📈 統計情報', value: 'データを取得中にエラーが発生しました', inline: false }
            )
            .setColor(0xE74C3C)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// 週次目標設定モーダル
async function showWeeklyGoalsModal(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('weekly_goals_modal')
        .setTitle('今週の目標設定');

    const goalInput = new TextInputBuilder()
        .setCustomId('weekly_goal')
        .setLabel('今週の目標')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('例: 毎日運動する、体重を1kg減らす、日記を5日書く')
        .setRequired(true)
        .setMaxLength(500);

    const goalRow = new ActionRowBuilder().addComponents(goalInput);
    modal.addComponents(goalRow);
    
    await interaction.showModal(modal);
}

// 週次目標設定の処理
async function handleWeeklyGoalsSubmit(interaction) {
    const goal = interaction.fields.getTextInputValue('weekly_goal');
    
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('🎯 今週の目標を設定しました')
        .setDescription(goal)
        .addFields(
            { name: '💪 頑張りましょう！', value: '小さな一歩が大きな変化を生みます', inline: false }
        )
        .setColor(0x27AE60)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    console.log(`週次目標設定: ${interaction.user.id} - ${goal}`);
}

// 習慣追加モーダル送信処理
async function handleAddHabitSubmit(interaction) {
    const name = interaction.fields.getTextInputValue('habit_name');
    const frequency = interaction.fields.getTextInputValue('habit_frequency');
    const difficulty = interaction.fields.getTextInputValue('habit_difficulty');
    
    try {
        const userId = interaction.user.id;
        const sheetsUtils = require('./utils/sheets');
        
        // 習慣を保存
        const habitId = await sheetsUtils.saveHabitToSheet(userId, name, frequency, difficulty);
        
        const { EmbedBuilder } = require('discord.js');
        
        const difficultyEmoji = difficulty === 'easy' ? '🟢' : difficulty === 'normal' ? '🟡' : '🔴';
        
        const embed = new EmbedBuilder()
            .setTitle('✅ 習慣を追加しました')
            .addFields(
                { name: '習慣名', value: name, inline: true },
                { name: '頻度', value: frequency, inline: true },
                { name: '難易度', value: `${difficultyEmoji} ${difficulty}`, inline: true }
            )
            .setColor(0x27AE60)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        
    } catch (error) {
        console.error('習慣追加エラー:', error);
        await interaction.reply({ 
            content: '❌ 習慣の追加中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// クイック完了セレクト処理
async function handleQuickDoneSelect(interaction) {
    const habitId = interaction.values[0];
    
    try {
        const userId = interaction.user.id;
        const today = require('moment')().format('YYYY-MM-DD');
        const sheetsUtils = require('./utils/sheets');
        
        // 習慣ログを保存
        await sheetsUtils.saveHabitLog(userId, habitId, today);
        
        // 習慣情報を取得
        const habit = await sheetsUtils.getHabitById(habitId);
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 習慣を完了しました！')
            .setDescription(`**${habit.name}** を実行しました`)
            .addFields(
                { name: '実行日', value: today, inline: true },
                { name: '継続中', value: '素晴らしいです！', inline: true }
            )
            .setColor(0x27AE60)
            .setTimestamp();
        
        await interaction.update({
            embeds: [embed],
            components: []
        });
        
    } catch (error) {
        console.error('習慣完了エラー:', error);
        await interaction.update({
            content: '❌ 習慣の完了処理中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// ===== 日記目標設定のボタン処理 =====

// 記録頻度目標設定
async function handleDiaryGoalFrequency(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('diary_goal_frequency_modal')
        .setTitle('📝 記録頻度目標の設定');

    const periodInput = new TextInputBuilder()
        .setCustomId('goal_period')
        .setLabel('期間（weekly または monthly）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('weekly')
        .setRequired(true)
        .setMaxLength(10);

    const targetInput = new TextInputBuilder()
        .setCustomId('goal_target')
        .setLabel('目標回数')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 5（週5回の場合）')
        .setRequired(true)
        .setMaxLength(2);

    const periodRow = new ActionRowBuilder().addComponents(periodInput);
    const targetRow = new ActionRowBuilder().addComponents(targetInput);

    modal.addComponents(periodRow, targetRow);
    
    await interaction.showModal(modal);
}

// 気分改善目標設定
async function handleDiaryGoalMood(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('diary_goal_mood_modal')
        .setTitle('😊 気分改善目標の設定');

    const targetInput = new TextInputBuilder()
        .setCustomId('mood_target')
        .setLabel('ポジティブな気分の目標割合（%）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 60（60%以上の場合）')
        .setRequired(true)
        .setMaxLength(3);

    const periodInput = new TextInputBuilder()
        .setCustomId('mood_period')
        .setLabel('評価期間（weekly または monthly）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('monthly')
        .setRequired(true)
        .setMaxLength(10);

    const targetRow = new ActionRowBuilder().addComponents(targetInput);
    const periodRow = new ActionRowBuilder().addComponents(periodInput);

    modal.addComponents(targetRow, periodRow);
    
    await interaction.showModal(modal);
}

// 振り返り目標設定
async function handleDiaryGoalReview(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('diary_goal_review_modal')
        .setTitle('📅 振り返り目標の設定');

    const frequencyInput = new TextInputBuilder()
        .setCustomId('review_frequency')
        .setLabel('振り返り頻度（weekly または monthly）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('weekly')
        .setRequired(true)
        .setMaxLength(10);

    const dayInput = new TextInputBuilder()
        .setCustomId('review_day')
        .setLabel('実行曜日（週次の場合、例: sunday）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('sunday')
        .setRequired(false)
        .setMaxLength(10);

    const frequencyRow = new ActionRowBuilder().addComponents(frequencyInput);
    const dayRow = new ActionRowBuilder().addComponents(dayInput);

    modal.addComponents(frequencyRow, dayRow);
    
    await interaction.showModal(modal);
}

// ===== モーダル送信処理 =====

// 記録頻度目標の保存
async function handleDiaryGoalFrequencySubmit(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    
    const period = interaction.fields.getTextInputValue('goal_period');
    const target = parseInt(interaction.fields.getTextInputValue('goal_target'));
    
    if (!['weekly', 'monthly'].includes(period)) {
        await interaction.reply({ 
            content: '❌ 期間は "weekly" または "monthly" を入力してください。', 
            ephemeral: true 
        });
        return;
    }
    
    if (isNaN(target) || target < 1 || target > 31) {
        await interaction.reply({ 
            content: '❌ 目標回数は1-31の数値を入力してください。', 
            ephemeral: true 
        });
        return;
    }
    
    try {
        const userId = interaction.user.id;
        const goalData = {
            type: 'frequency',
            period: period,
            target: target,
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        await sheetsUtils.saveDiaryGoal(userId, 'frequency', JSON.stringify(goalData));
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 記録頻度目標を設定しました')
            .addFields(
                { name: '期間', value: period === 'weekly' ? '週次' : '月次', inline: true },
                { name: '目標回数', value: `${target}回`, inline: true },
                { name: '設定日', value: moment().format('YYYY-MM-DD'), inline: true }
            )
            .setColor(0x9B59B6)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('記録頻度目標保存エラー:', error);
        await interaction.reply({ 
            content: '❌ 目標の保存中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 気分改善目標の保存
async function handleDiaryGoalMoodSubmit(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    
    const target = parseInt(interaction.fields.getTextInputValue('mood_target'));
    const period = interaction.fields.getTextInputValue('mood_period');
    
    if (!['weekly', 'monthly'].includes(period)) {
        await interaction.reply({ 
            content: '❌ 期間は "weekly" または "monthly" を入力してください。', 
            ephemeral: true 
        });
        return;
    }
    
    if (isNaN(target) || target < 10 || target > 100) {
        await interaction.reply({ 
            content: '❌ 目標割合は10-100の数値を入力してください。', 
            ephemeral: true 
        });
        return;
    }
    
    try {
        const userId = interaction.user.id;
        const goalData = {
            type: 'mood',
            target: target,
            period: period,
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        await sheetsUtils.saveDiaryGoal(userId, 'mood', JSON.stringify(goalData));
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('😊 気分改善目標を設定しました')
            .addFields(
                { name: '目標', value: `ポジティブな気分 ${target}%以上`, inline: true },
                { name: '期間', value: period === 'weekly' ? '週次' : '月次', inline: true },
                { name: '設定日', value: moment().format('YYYY-MM-DD'), inline: true }
            )
            .setColor(0x9B59B6)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('気分改善目標保存エラー:', error);
        await interaction.reply({ 
            content: '❌ 目標の保存中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 振り返り目標の保存
async function handleDiaryGoalReviewSubmit(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    
    const frequency = interaction.fields.getTextInputValue('review_frequency');
    const day = interaction.fields.getTextInputValue('review_day') || '';
    
    if (!['weekly', 'monthly'].includes(frequency)) {
        await interaction.reply({ 
            content: '❌ 頻度は "weekly" または "monthly" を入力してください。', 
            ephemeral: true 
        });
        return;
    }
    
    try {
        const userId = interaction.user.id;
        const goalData = {
            type: 'review',
            frequency: frequency,
            day: day,
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        await sheetsUtils.saveDiaryGoal(userId, 'review', JSON.stringify(goalData));
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('📅 振り返り目標を設定しました')
            .addFields(
                { name: '頻度', value: frequency === 'weekly' ? '週次' : '月次', inline: true },
                { name: '実行日', value: day || '任意', inline: true },
                { name: '設定日', value: moment().format('YYYY-MM-DD'), inline: true }
            )
            .setColor(0x9B59B6)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('振り返り目標保存エラー:', error);
        await interaction.reply({ 
            content: '❌ 目標の保存中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 日記目標進捗表示ボタン処理
async function handleDiaryGoalProgressButton(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    const userId = interaction.user.id;
    
    try {
        const goals = await sheetsUtils.getDiaryGoals(userId);
        
        if (!goals || goals.length === 0) {
            await interaction.reply({ 
                content: '設定された日記目標がありません。', 
                ephemeral: true 
            });
            return;
        }
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('📊 日記目標の進捗')
            .setColor(0x9B59B6)
            .setTimestamp();
        
        for (const goal of goals) {
            try {
                const goalData = JSON.parse(goal.content);
                const progress = await calculateDiaryGoalProgress(userId, goalData);
                
                embed.addFields({
                    name: `${getGoalTypeEmoji(goalData.type)} ${getGoalTypeName(goalData.type)}`,
                    value: formatGoalProgress(goalData, progress),
                    inline: false
                });
            } catch (parseError) {
                console.error('目標データ解析エラー:', parseError);
                continue;
            }
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('日記目標進捗エラー:', error);
        await interaction.reply({ 
            content: '進捗の確認中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 目標進捗計算関数
async function calculateDiaryGoalProgress(userId, goalData) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    
    const now = moment();
    let startDate, endDate;
    
    // 期間の設定
    switch (goalData.period) {
        case 'weekly':
            startDate = now.clone().startOf('isoWeek').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
            break;
        case 'monthly':
            startDate = now.clone().startOf('month').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
            break;
        default:
            // デフォルトは今月
            startDate = now.clone().startOf('month').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
    }
    
    // 期間内の日記エントリーを取得
    const entries = await sheetsUtils.getDiaryEntriesInRange(userId, startDate, endDate);
    
    let current = 0;
    let target = goalData.target;
    
    switch (goalData.type) {
        case 'frequency':
            current = entries.length;
            break;
        case 'mood':
            if (entries.length > 0) {
                const positiveMoods = entries.filter(e => ['😊', '🙂'].includes(e.mood));
                current = Math.round((positiveMoods.length / entries.length) * 100);
            }
            break;
        case 'review':
            // 振り返り目標の進捗は別途実装
            current = 0;
            target = 1;
            break;
    }
    
    const percentage = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    
    return {
        current,
        target,
        percentage: percentage.toFixed(1),
        period: goalData.period,
        startDate,
        endDate
    };
}

// ヘルパー関数群
function getGoalTypeEmoji(type) {
    const emojis = {
        'frequency': '📝',
        'mood': '😊',
        'review': '📅'
    };
    return emojis[type] || '🎯';
}

function getGoalTypeName(type) {
    const names = {
        'frequency': '記録頻度目標',
        'mood': '気分改善目標',
        'review': '振り返り目標'
    };
    return names[type] || '目標';
}

function formatGoalProgress(goalData, progress) {
    const percentage = Math.min(100, parseFloat(progress.percentage));
    const progressBar = generateProgressBar(percentage);
    
    let goalDescription = '';
    switch (goalData.type) {
        case 'frequency':
            goalDescription = `目標: ${goalData.period}に${progress.target}回記録\n現在: ${progress.current}回記録`;
            break;
        case 'mood':
            goalDescription = `目標: ポジティブな気分${progress.target}%以上\n現在: ${progress.current}%`;
            break;
        case 'review':
            goalDescription = `目標: ${goalData.frequency}振り返り\n現在: 設定済み`;
            break;
    }
    
    return `${goalDescription}\n進捗: ${progressBar} ${percentage}%`;
}

function generateProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// ===== 日記振り返りボタン処理 =====

// 振り返り保存ボタン処理
async function handleDiaryReviewSave(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    const { EmbedBuilder } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
        
        // 振り返りデータを保存（既に実行されているが、改めて確認メッセージを表示）
        const embed = new EmbedBuilder()
            .setTitle('💾 振り返りを保存しました')
            .setDescription('今回の振り返り内容が記録されました。')
            .addFields(
                { name: '✅ 保存完了', value: '振り返りデータがシートに保存されました', inline: false },
                { name: '📅 保存日時', value: moment().format('YYYY-MM-DD HH:mm:ss'), inline: true },
                { name: '🔍 確認方法', value: '過去の振り返りは目標データシートで確認できます', inline: true }
            )
            .setColor(0x27AE60)
            .setTimestamp();
        
        await interaction.update({
            embeds: [embed],
            components: [] // ボタンを削除
        });
        
        console.log('振り返り保存確認:', userId);
        
    } catch (error) {
        console.error('振り返り保存ボタンエラー:', error);
        await interaction.update({
            content: '❌ 振り返りの保存確認中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// 振り返り詳細表示ボタン処理
async function handleDiaryReviewShare(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    const { EmbedBuilder } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
        
        // 最新の振り返りデータを取得
        const reviewData = await getLatestReviewData(userId);
        
        if (!reviewData) {
            await interaction.update({
                content: '振り返りデータが見つかりませんでした。',
                embeds: [],
                components: []
            });
            return;
        }
        
        // 詳細な振り返り表示を作成
        const detailEmbed = createDetailedReviewEmbed(reviewData);
        
        await interaction.update({
            embeds: [detailEmbed],
            components: [] // ボタンを削除
        });
        
    } catch (error) {
        console.error('振り返り詳細表示エラー:', error);
        await interaction.update({
            content: '❌ 振り返り詳細の表示中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// 最新の振り返りデータを取得
async function getLatestReviewData(userId) {
    const sheetsUtils = require('./utils/sheets');
    
    try {
        const goals = await sheetsUtils.getDiaryGoals(userId);
        
        // review_record タイプの最新データを取得
        const reviewRecords = goals.filter(goal => {
            try {
                const data = JSON.parse(goal.content);
                return data.type === 'review';
            } catch {
                return false;
            }
        });
        
        if (reviewRecords.length === 0) return null;
        
        // 最新の振り返り記録を取得
        const latestRecord = reviewRecords.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        )[0];
        
        return JSON.parse(latestRecord.content);
        
    } catch (error) {
        console.error('振り返りデータ取得エラー:', error);
        return null;
    }
}

// 詳細な振り返りEmbedを作成
function createDetailedReviewEmbed(reviewData) {
    const { EmbedBuilder } = require('discord.js');
    const moment = require('moment');
    
    const analysis = reviewData.analysis;
    const period = reviewData.period;
    
    const embed = new EmbedBuilder()
        .setTitle(`📋 ${period.name} 詳細振り返り`)
        .setDescription(analysis.summary)
        .setColor(0x9B59B6)
        .setTimestamp();
    
    // 基本統計を詳細に表示
    embed.addFields(
        { 
            name: '📊 期間統計（詳細）', 
            value: analysis.periodSummary + '\n\n**分析期間**: ' + period.start + ' ～ ' + period.end,
            inline: false 
        }
    );
    
    // 気分の詳細分析
    embed.addFields(
        { 
            name: '💭 気分分析（詳細）', 
            value: analysis.moodReflection + '\n\n**気分の傾向**: 期間全体を通じた心理状態の変化を分析',
            inline: false 
        }
    );
    
    // ハイライトの詳細
    embed.addFields(
        { 
            name: '🌟 期間のハイライト', 
            value: analysis.highlights + '\n\n**特筆事項**: 記録の中で特に注目すべき出来事や成果',
            inline: false 
        }
    );
    
    // 成長と改善の詳細提案
    embed.addFields(
        { 
            name: '🚀 成長・改善提案（詳細）', 
            value: analysis.suggestions + '\n\n**次のステップ**: より良い日記習慣のための具体的なアクション',
            inline: false 
        }
    );
    
    // 振り返りのメタ情報
    embed.addFields(
        { 
            name: '📅 振り返り情報', 
            value: `作成日時: ${moment(reviewData.createdAt).format('YYYY-MM-DD HH:mm')}\n種類: ${period.name}\n状態: 保存済み`,
            inline: false 
        }
    );
    
    // フッターにアドバイス
    embed.setFooter({ 
        text: '💡 定期的な振り返りは自己理解と成長に役立ちます。今回の気づきを今後の日記に活かしましょう。' 
    });
    
    return embed;
}

// 振り返り履歴表示関数（オプション）
async function showReviewHistory(interaction) {
    const moment = require('moment');
    const sheetsUtils = require('./utils/sheets');
    const { EmbedBuilder } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
        const goals = await sheetsUtils.getDiaryGoals(userId);
        
        // review_record タイプの全データを取得
        const reviewRecords = goals.filter(goal => {
            try {
                const data = JSON.parse(goal.content);
                return data.type === 'review';
            } catch {
                return false;
            }
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (reviewRecords.length === 0) {
            await interaction.reply({
                content: '過去の振り返り記録がありません。',
                ephemeral: true
            });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📚 振り返り履歴')
            .setDescription(`過去の振り返り記録: ${reviewRecords.length}件`)
            .setColor(0x9B59B6)
            .setTimestamp();
        
        // 最新5件を表示
        const recentReviews = reviewRecords.slice(0, 5);
        recentReviews.forEach((record, index) => {
            try {
                const data = JSON.parse(record.content);
                const date = moment(data.createdAt).format('MM/DD HH:mm');
                const periodName = data.period.name || '不明';
                
                embed.addFields({
                    name: `${index + 1}. ${periodName}`,
                    value: `実行日時: ${date}\n概要: ${data.analysis.summary.substring(0, 50)}...`,
                    inline: false
                });
            } catch (parseError) {
                // JSON解析エラーは無視
            }
        });
        
        if (reviewRecords.length > 5) {
            embed.addFields({
                name: '📌 注意',
                value: `他にも${reviewRecords.length - 5}件の振り返り記録があります。`,
                inline: false
            });
        }
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        
    } catch (error) {
        console.error('振り返り履歴表示エラー:', error);
        await interaction.reply({
            content: '❌ 振り返り履歴の取得中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// goals専用のカレンダーナビゲーション処理
async function handleGoalsCalendarNavigation(interaction) {
    const customId = interaction.customId;
    
    // goals_calendar_2025_1 形式からyearとmonthを抽出
    const parts = customId.split('_');
    if (parts.length >= 4) {
        const year = parseInt(parts[2]);
        const month = parseInt(parts[3]);
        
        // 🔄 この行を修正
        const currentYear = new Date().getFullYear();
        const maxYear = currentYear + 10;
        
        if (!isNaN(year) && !isNaN(month) && year >= 2020 && year <= maxYear && month >= 1 && month <= 12) {
            await showGoalsCalendar(interaction, year, month);
        } else {
            await interaction.editReply({ 
                content: '❌ 無効な日付です。', 
                embeds: [],
                components: []
            });
        }
    } else {
        await interaction.editReply({ 
            content: '❌ カレンダーナビゲーションエラー。', 
            embeds: [],
            components: []
        });
    }
}

// goals専用のカレンダー表示
async function showGoalsCalendar(interaction, year, month) {
    try {
        // 仮のオプションオブジェクトを作成
        const fakeOptions = {
            getInteger: (name) => {
                if (name === 'year') return year;
                if (name === 'month') return month;
                return null;
            }
        };
        
        // 一時的にoptionsを置き換え
        const originalOptions = interaction.options;
        interaction.options = fakeOptions;
        
        // handleGoalsCalendarを呼び出し
        await goalsCommands.handleGoalsCalendar(interaction);
        
        // optionsを元に戻す
        interaction.options = originalOptions;
        
    } catch (error) {
        console.error('goals専用カレンダー表示エラー:', error);
        
        const errorMessage = '❌ カレンダーの表示中にエラーが発生しました。';
        
        try {
            await interaction.editReply({ 
                content: errorMessage,
                embeds: [],
                components: []
            });
        } catch (replyError) {
            console.error('エラーメッセージ送信失敗:', replyError);
        }
    }
}

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('Botを停止中...');
    
    // 通知システムを停止
    if (routineHandler && routineHandler.notificationService) {
        routineHandler.notificationService.shutdown();
    }
    
    if (notificationManager) {
        notificationManager.shutdown();
    }
   
// 🔔 Habit通知システムを停止
    if (habitNotificationService) {
        habitNotificationService.shutdown();
    }
 
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Botを停止中...');
    
    // 通知システムを停止
    if (routineHandler && routineHandler.notificationService) {
        routineHandler.notificationService.shutdown();
    }
    
    if (notificationManager) {
        notificationManager.shutdown();
    }

// 🔔 Habit通知システムを停止
    if (habitNotificationService) {
        habitNotificationService.shutdown();
    }
    
    client.destroy();
    process.exit(0);
});
// ログイン
client.login(process.env.DISCORD_TOKEN);
