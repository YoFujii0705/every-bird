// bot.js - 修正版 Part 1: インポート・初期設定

// bot.js - 完全版 Part 1: インポート・初期設定

// ===== インポート部分 =====
const { Client, Events, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// コマンドモジュールのインポート
const diaryCommands = require('./commands/diary');
const habitCommands = require('./commands/habit');
const weightCommands = require('./commands/weight');
const goalsCommands = require('./commands/goals');
const dietCommands = require('./commands/diet');
const interactionHandler = require('./handlers/interactions');
const routineCommands = require('./commands/routine');
const RoutineHandler = require('./handlers/routineHandler');
const whoamiCommands = require('./commands/whoami');

// 通知システムのインポート
const NotificationManager = require('./handlers/notifications');

// Habit通知システムのインポート
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

// グローバル変数（1つのインスタンスのみ保持）
let notificationManager;
let routineHandler;
let habitNotificationService;
let habitNotificationsHandler;

// 重複実行防止フラグ
let isInitialized = false;

// sheetsUtilsのインポート
const sheetsUtils = require('./utils/sheets');

// ===== コマンド配列の作成 =====
const commands = [
    diaryCommands.createCommand(),
    habitCommands.createCommand(),
    weightCommands.createCommand(),
    goalsCommands.createCommand(),
    whoamiCommands.createCommand(),
    routineCommands.createCommand(),
    dietCommands.createCommand(), // 新しく追加
    
    // 通知テスト用コマンド
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
        .addSubcommand(subcommand =>
            subcommand
                .setName('whoami')
                .setDescription('Who Am I リマインダーをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('habit-notification')
                .setDescription('習慣通知をテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('morning')
                .setDescription('朝の通知セットをテスト'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('evening')
                .setDescription('夜の通知セットをテスト'))
                
].map(command => command.toJSON());

// REST APIの設定
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Bot起動時に実行（重複実行防止版）
async function initializeBot() {
    if (isInitialized) {
        console.log('⚠️ 既に初期化済みのためスキップ');
        return;
    }
    
    try {
        // 食事記録用シートの初期化
        await sheetsUtils.initializeMealLogsSheet();
        console.log('✅ 食事記録シートの初期化完了');
        
        // Who Am I用シートの初期化
        await sheetsUtils.initializeWhoAmISheet();
        console.log('✅ Who Am I シートの初期化完了');
        
        // ダイエット記録用シートの初期化
        await initializeDietRecordsSheet();
        console.log('✅ ダイエット記録シートの初期化完了');
        
        // 習慣通知用シートの初期化
        await initializeHabitNotificationSheet();
        console.log('✅ 習慣通知シートの初期化完了');

        isInitialized = true;

    } catch (error) {
        console.error('❌ 初期化エラー:', error);
    }
}

// ダイエット記録用シートの初期化
async function initializeDietRecordsSheet() {
    try {
        const data = await sheetsUtils.getSheetData('diet_records', 'A:N');
        
        // ヘッダーが存在しない場合は初期化
        if (!data || data.length === 0 || !data[0] || data[0].length === 0) {
            console.log('📝 diet_recordsシートのヘッダーを作成中...');
            
            const headers = [
                'date', 'user_id', 'no_overeating', 'good_sleep', 'milo_count', 
                'exercise_minutes', 'water_2l', 'breakfast_time_ok', 'lunch_time_ok',
                'dinner_time_ok', 'snacks_list', 'stress_level', 'daily_note', 'created_at'
            ];
            
            await sheetsUtils.saveToSheet('diet_records', headers);
            console.log('✅ diet_recordsシートのヘッダーを作成しました');
        } else {
            console.log('✅ diet_recordsシートは既に存在します');
        }
    } catch (error) {
        console.error('❌ diet_recordsシート初期化エラー:', error);
        // エラーが発生してもBot起動は続行
    }
}

// 習慣通知用シートの初期化
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

// bot.js - 修正版 Part 3: Readyイベント（重複削除版）

// bot.js - 完全版 Part 2: Ready イベント・メッセージ処理・朝夜通知

// ===== Ready イベント（1つのみ） =====
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ ${readyClient.user.tag} がログインしました！`);
    
    // Bot初期化を実行
    await initializeBot();
    
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
        console.log('✅ 通知システムを初期化しました');
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

    // Habit通知システムを初期化
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

// ===== メッセージ処理（起床・就寝トリガー用） =====
client.on(Events.MessageCreate, async message => {
    // Botのメッセージは無視
    if (message.author.bot) return;
    
    const messageContent = message.content.toLowerCase();
    
    // 起床キーワードをチェック
    const wakeupKeywords = ['起きた', 'おはよう', 'おはよ', 'good morning', 'wake up', 'おきた'];
    const isWakeupMessage = wakeupKeywords.some(keyword => 
        messageContent.includes(keyword.toLowerCase())
    );
    
    // 就寝キーワードをチェック
    const sleepKeywords = ['寝る', 'おやすみ', 'good night', 'ねる', 'おやすみなさい'];
    const isSleepMessage = sleepKeywords.some(keyword => 
        messageContent.includes(keyword.toLowerCase())
    );
    
    if (isWakeupMessage) {
        console.log(`🌅 起床メッセージを検知: ${message.author.id} - "${message.content}"`);
        await triggerMorningNotifications(message);
    } else if (isSleepMessage) {
        console.log(`🌙 就寝メッセージを検知: ${message.author.id} - "${message.content}"`);
        await triggerEveningNotifications(message);
    }
});

// 朝の通知を手動トリガー（重複防止強化版）
async function triggerMorningNotifications(message) {
    try {
        const userId = message.author.id;
        const channel = message.channel;
        
        // 重複防止: 最後の起床通知から1時間以内は送信しない
        const lastNotificationKey = `morning_notification_${userId}`;
        const lastNotificationTime = global[lastNotificationKey] || 0;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        if (now - lastNotificationTime < oneHour) {
            console.log(`⏰ 起床通知スキップ（1時間以内に送信済み）: ${userId}`);
            await message.react('⏰');
            return;
        }
        
        // 朝の通知を送信
        await sendMorningNotificationSet(channel, userId);
        
        // 最後の通知時間を記録
        global[lastNotificationKey] = now;
        
        // 確認メッセージ
        await message.react('☀️');
        
    } catch (error) {
        console.error('朝の通知トリガーエラー:', error);
        await message.react('❌');
    }
}

// 夜の通知を手動トリガー（重複防止強化版）
async function triggerEveningNotifications(message) {
    try {
        const userId = message.author.id;
        const channel = message.channel;
        
        // 重複防止: 最後の就寝通知から1時間以内は送信しない
        const lastNotificationKey = `evening_notification_${userId}`;
        const lastNotificationTime = global[lastNotificationKey] || 0;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        if (now - lastNotificationTime < oneHour) {
            console.log(`⏰ 就寝通知スキップ（1時間以内に送信済み）: ${userId}`);
            await message.react('⏰');
            return;
        }
        
        // 夜の通知を送信
        await sendEveningNotificationSet(channel, userId);
        
        // 最後の通知時間を記録
        global[lastNotificationKey] = now;
        
        // 確認メッセージ
        await message.react('🌙');
        
    } catch (error) {
        console.error('夜の通知トリガーエラー:', error);
        await message.react('❌');
    }
}

// bot.js - 修正版 Part 5: 朝の通知セット送信

// 朝の通知セットを送信（重複防止強化版）
async function sendMorningNotificationSet(channel, userId) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    console.log(`🌅 朝の通知セット送信開始: ${userId}`);
    
    // 送信済みフラグで重複防止
    const sendingKey = `morning_sending_${userId}`;
    if (global[sendingKey]) {
        console.log(`⚠️ 朝の通知セット送信中につきスキップ: ${userId}`);
        return;
    }
    
    global[sendingKey] = true;
    
    try {
        // 1. Who Am I リマインダー（DM送信）
        try {
            const user = await client.users.fetch(userId);
            
            const whoAmIEmbed = new EmbedBuilder()
                .setTitle('🌟 おはようございます！')
                .setDescription(`新しい一日の始まりです！\n今日のあなたを確認してみましょう。`)
                .addFields(
                    { name: '💭 今日の自分', value: 'Who Am I で今日の気持ちや目標を確認', inline: false },
                    { name: '🎯 今日の意識', value: '今日はどんな自分でありたいですか？', inline: false }
                )
                .setColor('#FFD700')
                .setTimestamp();

            const whoAmIRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('whoami_setup_start')
                        .setLabel('🌟 Who Am I 確認')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('whoami_skip')
                        .setLabel('⏭️ スキップ')
                        .setStyle(ButtonStyle.Secondary)
                );

            // DMで送信（自分だけに表示）
            await user.send({ embeds: [whoAmIEmbed], components: [whoAmIRow] });
            console.log(`✅ Who Am I をDMで送信: ${userId}`);
            
        } catch (error) {
            console.error('Who Am I DM送信エラー:', error);
            
            // DMが送信できない場合は通常のチャンネルに送信（5分後に削除）
            try {
                const whoAmIEmbed = new EmbedBuilder()
                    .setTitle('🌟 おはようございます！')
                    .setDescription(`<@${userId}> 新しい一日の始まりです！\n今日のあなたを確認してみましょう。`)
                    .addFields(
                        { name: '💭 今日の自分', value: 'Who Am I で今日の気持ちや目標を確認', inline: false },
                        { name: '🎯 今日の意識', value: '今日はどんな自分でありたいですか？', inline: false },
                        { name: '⚠️ 注意', value: 'DMが無効のため、こちらに表示しています（5分後に削除）', inline: false }
                    )
                    .setColor('#FFD700')
                    .setTimestamp();

                const whoAmIRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('whoami_setup_start')
                            .setLabel('🌟 Who Am I 確認')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('whoami_skip')
                            .setLabel('⏭️ スキップ')
                            .setStyle(ButtonStyle.Secondary)
                    );

                const whoAmIMessage = await channel.send({ 
                    embeds: [whoAmIEmbed], 
                    components: [whoAmIRow]
                });
                
                // 5分後に削除
                setTimeout(() => {
                    whoAmIMessage.delete().catch(console.error);
                }, 300000);
                
            } catch (fallbackError) {
                console.error('Who Am I fallback送信エラー:', fallbackError);
            }
        }

        // 待機時間を追加（重複防止）
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機

        // 2. 体重記録リマインダー
        try {
            const weightEmbed = new EmbedBuilder()
                .setTitle('⚖️ 朝の体重測定')
                .setDescription(`<@${userId}> 今日の体重を記録しましょう！`)
                .addFields(
                    { name: '📊 継続の力', value: '毎日の記録が変化を可視化します', inline: false },
                    { name: '💡 ヒント', value: '起床後、トイレ後の測定がおすすめです', inline: false }
                )
                .setColor('#00BCD4')
                .setTimestamp();

            const weightRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`weight_record_${userId}`)
                        .setLabel('⚖️ 体重を記録')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('weight_skip')
                        .setLabel('⏭️ 後で記録')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({ embeds: [weightEmbed], components: [weightRow] });
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
        } catch (error) {
            console.error('体重記録通知送信エラー:', error);
        }

        // 3. 朝のルーティン開始リマインダー
        try {
            if (routineHandler && routineHandler.routineService) {
                let routines = [];
                
                try {
                    console.log('🔍 ルーティン取得開始...');
                    routines = await routineHandler.routineService.getUserRoutines(userId);
                    console.log('✅ ルーティン取得成功:', { count: routines.length });
                    
                } catch (routineError) {
                    console.error('ルーティン取得エラー:', routineError);
                    routines = [];
                }
                
                // 朝のルーティンをフィルタリング
                const morningRoutines = routines.filter(r => 
                    r.name.toLowerCase().includes('朝') || 
                    r.name.toLowerCase().includes('モーニング') || 
                    r.name.toLowerCase().includes('morning') ||
                    r.name.toLowerCase().includes('起床')
                );

                console.log('🌅 朝のルーティン検索結果:', { 
                    totalRoutines: routines.length, 
                    morningRoutines: morningRoutines.length,
                    names: morningRoutines.map(r => r.name)
                });

                if (morningRoutines.length > 0) {
                    const routineEmbed = new EmbedBuilder()
                        .setTitle('🌅 朝のルーティン')
                        .setDescription(`<@${userId}> 朝のルーティンを開始しますか？`)
                        .addFields(
                            { name: '📋 利用可能なルーティン', value: morningRoutines.map(r => `• ${r.name}`).join('\n'), inline: false },
                            { name: '💪 今日も頑張りましょう！', value: '良い一日の始まりです', inline: false }
                        )
                        .setColor('#FF9800')
                        .setTimestamp();

                    const routineRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`routine_start_${morningRoutines[0].id}`)
                                .setLabel('🎯 ルーティン開始')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('routine_later')
                                .setLabel('⏭️ 後で実行')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await channel.send({ embeds: [routineEmbed], components: [routineRow] });
                    console.log('✅ 朝のルーティン通知送信完了');
                } else {
                    console.log('📋 朝のルーティンが見つかりませんでした');
                }
            } else {
                console.log('⚠️ routineHandlerまたはroutineServiceが初期化されていません');
            }
        } catch (routineError) {
            console.error('ルーティンリマインダー送信エラー:', routineError);
        }
        
        console.log(`✅ 朝の通知セット送信完了: ${userId}`);
        
    } finally {
        // 送信完了フラグをクリア（必ず実行）
        delete global[sendingKey];
        console.log(`🔓 朝の通知セット送信フラグクリア: ${userId}`);
    }
}


// bot.js - 修正版 Part 4: 夜の通知セット・インタラクション処理開始

// bot.js - 完全版 Part 4: 夜の通知セット・ダイエット機能完全統合版

// 夜の通知セットを送信（ダイエット機能統合版）
async function sendEveningNotificationSet(channel, userId) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    console.log(`🌙 夜の通知セット送信開始: ${userId}`);
    
    try {
        // 1. 日記書くリマインダー
        try {
            const diaryEmbed = new EmbedBuilder()
                .setTitle('📝 今日の日記を書きましょう')
                .setDescription(`<@${userId}> 今日一日を振り返って日記を書いてみませんか？`)
                .addFields(
                    { name: '✨ 振り返りの力', value: '今日の出来事や感情を記録することで、成長につながります', inline: false },
                    { name: '💭 考えてみよう', value: '今日良かったこと、学んだこと、明日への気持ち', inline: false }
                )
                .setColor('#9B59B6')
                .setTimestamp();

            const diaryRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('diary_write_start')
                        .setLabel('📝 日記を書く')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('diary_skip')
                        .setLabel('⏭️ 後で書く')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({ embeds: [diaryEmbed], components: [diaryRow] });
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
        } catch (error) {
            console.error('日記リマインダー送信エラー:', error);
        }

        // 2. ダイエットチェックリスト（新規追加）
        try {
            const dietEmbed = new EmbedBuilder()
                .setTitle('📋 今日のダイエット記録')
                .setDescription(`<@${userId}> 今日の取り組みを振り返りましょう`)
                .addFields(
                    { name: '📝 記録内容', value: '過食状況、睡眠、運動、食事時間など', inline: false },
                    { name: '💪 継続の力', value: '毎日の記録が健康的な習慣につながります', inline: false }
                )
                .setColor('#4CAF50')
                .setTimestamp();

            const dietRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('diet_checklist_modal')
                        .setLabel('📋 ダイエット記録')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('diet_skip')
                        .setLabel('⏭️ 後で記録')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({ embeds: [dietEmbed], components: [dietRow] });
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
        } catch (error) {
            console.error('ダイエット記録通知送信エラー:', error);
        }

        // 3. 夜のルーティンリマインダー
        try {
            if (routineHandler && routineHandler.routineService) {
                let routines = [];
                
                // routineService のメソッドを安全に呼び出し
                try {
                    if (typeof routineHandler.routineService.getUserRoutines === 'function') {
                        routines = await routineHandler.routineService.getUserRoutines(userId);
                    } else if (typeof routineHandler.routineService.getRoutines === 'function') {
                        const allRoutines = await routineHandler.routineService.getRoutines();
                        routines = allRoutines.filter(r => r.userId === userId);
                    } else {
                        // 直接シートから取得を試行
                        const routineData = await sheetsUtils.getSheetData('routines_master', 'A:Z');
                        routines = routineData.slice(1).filter(row => row[1] === userId).map(row => ({
                            id: row[0],
                            userId: row[1],
                            name: row[2],
                            description: row[3] || ''
                        }));
                    }
                } catch (routineError) {
                    console.error('夜のルーティン取得エラー:', routineError);
                    routines = [];
                }
                
                const eveningRoutines = routines.filter(r => 
                    r.name.toLowerCase().includes('夜') || 
                    r.name.toLowerCase().includes('夕方') || 
                    r.name.toLowerCase().includes('evening') ||
                    r.name.toLowerCase().includes('就寝') ||
                    r.name.toLowerCase().includes('寝る前')
                );

                if (eveningRoutines.length > 0) {
                    const routineEmbed = new EmbedBuilder()
                        .setTitle('🌙 夜のルーティン')
                        .setDescription(`<@${userId}> 今日一日お疲れ様でした！\n夜のルーティンを開始しますか？`)
                        .addFields(
                            { name: '📋 利用可能なルーティン', value: eveningRoutines.map(r => `• ${r.name}`).join('\n'), inline: false },
                            { name: '😴 良い睡眠を', value: '明日に向けてゆっくり休みましょう', inline: false }
                        )
                        .setColor('#4A154B')
                        .setTimestamp();

                    const routineRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`routine_start_${eveningRoutines[0].id}`)
                                .setLabel('🎯 ルーティン開始')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('routine_later')
                                .setLabel('⏭️ 後で実行')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await channel.send({ embeds: [routineEmbed], components: [routineRow] });
                } else {
                    console.log('📋 夜のルーティンが見つかりませんでした');
                }
            } else {
                console.log('⚠️ routineHandlerまたはroutineServiceが初期化されていません');
            }
        } catch (routineError) {
            console.error('夜のルーティンリマインダー送信エラー:', routineError);
        }
        
        console.log(`✅ 夜の通知セット送信完了: ${userId}`);
        
    } catch (error) {
        console.error('夜の通知セット送信エラー:', error);
    }
}

// ===== ダイエット機能のヘルパー関数（段階的セレクトメニュー版） =====

// ダイエットチェックリスト開始（段階的システム）
// 現在のshowDietChecklistModal関数を以下に置き換え
async function showDietChecklistModal(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    // 一時保存用のグローバル変数を初期化
    global.tempDietData = global.tempDietData || {};
    global.tempDietData[interaction.user.id] = {};
    
    // Step 1: 過食について
    const embed = new EmbedBuilder()
        .setTitle('📋 ダイエット記録 (1/6)')
        .setDescription('今日は過食をしませんでしたか？')
        .setColor('#4CAF50');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('diet_step1_overeating')
        .setPlaceholder('過食の状況を選択してください')
        .addOptions([
            {
                label: '過食しなかった',
                value: 'no_overeating_yes',
                description: '今日は過食をしませんでした',
                emoji: '✅'
            },
            {
                label: '過食してしまった',
                value: 'no_overeating_no',
                description: '今日は過食をしてしまいました',
                emoji: '❌'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

// Step 2: 睡眠について
async function showDietStep2Sleep(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('📋 ダイエット記録 (2/6)')
        .setDescription('今日は良い睡眠がとれましたか？（中途覚醒なし）')
        .setColor('#4CAF50');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('diet_step2_sleep')
        .setPlaceholder('睡眠の質を選択してください')
        .addOptions([
            {
                label: '良い睡眠がとれた',
                value: 'good_sleep_yes',
                description: '中途覚醒なしで良く眠れました',
                emoji: '😴'
            },
            {
                label: '睡眠に問題があった',
                value: 'good_sleep_no',
                description: '中途覚醒があったり眠りが浅かった',
                emoji: '😰'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// Step 3: 水分摂取について
async function showDietStep3Water(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('📋 ダイエット記録 (3/6)')
        .setDescription('今日は水分を2L以上摂取しましたか？')
        .setColor('#4CAF50');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('diet_step3_water')
        .setPlaceholder('水分摂取量を選択してください')
        .addOptions([
            {
                label: '2L以上摂取した',
                value: 'water_2l_yes',
                description: '今日は十分な水分を摂取しました',
                emoji: '💧'
            },
            {
                label: '2L未満だった',
                value: 'water_2l_no',
                description: '水分摂取が少なかった',
                emoji: '💧'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// Step 4: 食事時間について
async function showDietStep4MealTimes(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setTitle('📋 ダイエット記録 (4/6)')
        .setDescription('食事時間はどうでしたか？（複数選択可）')
        .setColor('#4CAF50');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('diet_step4_meals')
        .setPlaceholder('規則正しく食べられた食事を選択してください')
        .setMinValues(0)
        .setMaxValues(3)
        .addOptions([
            {
                label: '朝食を7-9時に食べた',
                value: 'breakfast_time_ok',
                description: '朝食を適切な時間に摂取しました',
                emoji: '🌅'
            },
            {
                label: '昼食を12-14時に食べた',
                value: 'lunch_time_ok',
                description: '昼食を適切な時間に摂取しました',
                emoji: '☀️'
            },
            {
                label: '夕食を18-20時に食べた',
                value: 'dinner_time_ok',
                description: '夕食を適切な時間に摂取しました',
                emoji: '🌙'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// Step 5: 全ての数値・テキスト入力を一度に（簡素化版）
// Step 5: 全項目入力（最終ステップ）
async function showDietStep5Numbers(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('diet_checklist_submit') // 直接最終処理へ
        .setTitle('ダイエット記録 (5/5)');

    const miloCount = new TextInputBuilder()
        .setCustomId('milo_count')
        .setLabel('ミロ回数（数字のみ）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 3（0の場合は空欄）')
        .setRequired(false)
        .setMaxLength(2);

    const exerciseMinutes = new TextInputBuilder()
        .setCustomId('exercise_minutes')
        .setLabel('エアロバイク時間（分）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 30（0の場合は空欄）')
        .setRequired(false)
        .setMaxLength(3);

    const snacks = new TextInputBuilder()
        .setCustomId('snacks')
        .setLabel('間食（なしの場合は空欄）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: クッキー2枚、りんご1個')
        .setRequired(false)
        .setMaxLength(100);

    // ストレス度と今日のひとことを1つのフィールドに統合
    const finalNotes = new TextInputBuilder()
        .setCustomId('final_notes')
        .setLabel('ストレス度（1-5）と今日のひとこと')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1行目: ストレス度（1-5の数字）\n2行目以降: 今日の感想など')
        .setRequired(false)
        .setMaxLength(300);

    const row1 = new ActionRowBuilder().addComponents(miloCount);
    const row2 = new ActionRowBuilder().addComponents(exerciseMinutes);
    const row3 = new ActionRowBuilder().addComponents(snacks);
    const row4 = new ActionRowBuilder().addComponents(finalNotes);

    modal.addComponents(row1, row2, row3, row4);
    
    await interaction.showModal(modal);
}

// ===== ダイエット段階的処理のハンドラー関数 =====

// Step 1: 過食についての処理
async function handleDietStep1Overeating(interaction) {
    const selectedValue = interaction.values[0];
    const userId = interaction.user.id;
    
    // 一時保存
    global.tempDietData[userId].no_overeating = selectedValue === 'no_overeating_yes';
    
    console.log('Step 1完了:', global.tempDietData[userId]);
    
    // Step 2へ
    await showDietStep2Sleep(interaction);
}

// Step 2: 睡眠についての処理
async function handleDietStep2Sleep(interaction) {
    const selectedValue = interaction.values[0];
    const userId = interaction.user.id;
    
    // 一時保存
    global.tempDietData[userId].good_sleep = selectedValue === 'good_sleep_yes';
    
    console.log('Step 2完了:', global.tempDietData[userId]);
    
    // Step 3へ
    await showDietStep3Water(interaction);
}

// Step 3: 水分摂取についての処理
async function handleDietStep3Water(interaction) {
    const selectedValue = interaction.values[0];
    const userId = interaction.user.id;
    
    // 一時保存
    global.tempDietData[userId].water_2l = selectedValue === 'water_2l_yes';
    
    console.log('Step 3完了:', global.tempDietData[userId]);
    
    // Step 4へ
    await showDietStep4MealTimes(interaction);
}

// Step 4: 食事時間についての処理
async function handleDietStep4Meals(interaction) {
    const selectedValues = interaction.values;
    const userId = interaction.user.id;
    
    // 一時保存（複数選択対応）
    global.tempDietData[userId].breakfast_time = selectedValues.includes('breakfast_time_ok');
    global.tempDietData[userId].lunch_time = selectedValues.includes('lunch_time_ok');
    global.tempDietData[userId].dinner_time = selectedValues.includes('dinner_time_ok');
    
    console.log('Step 4完了:', global.tempDietData[userId]);
    
    // Step 5へ（モーダル表示）
    await showDietStep5Numbers(interaction);
}

// Step 5: 数値入力の処理

// 健康的なアプローチを重視した励ましメッセージ生成
function generateHealthyEncouragement(achievementCount, data) {
    const messages = [];
    
    // 記録をつけたこと自体を評価
    messages.push('今日も記録をつけることができました。継続することが一番大切です。');
    
    // 過食について健康的なメッセージ
    if (data.no_overeating) {
        messages.push('過食をコントロールできたのは素晴らしいことです。');
    } else if (!data.no_overeating && data.milo_count > 0) {
        messages.push(`過食衝動に対してミロで対処する工夫ができています（${data.milo_count}回）。`);
    }
    
    // 運動について
    if (data.exercise_minutes >= 30) {
        messages.push('30分以上の運動、体にも心にも良い影響があります。');
    } else if (data.exercise_minutes > 0) {
        messages.push('運動を実施できました。短時間でも続けることに意味があります。');
    }
    
    // 全体的な達成について
    if (achievementCount >= 4) {
        messages.push('多くの健康的な習慣を実践できています。');
    } else if (achievementCount >= 2) {
        messages.push('着実に健康的な生活に向かっています。');
    }
    
    return messages.join(' ');
}

// Google Sheetsにダイエット記録を保存
async function saveDietRecord(userId, date, data) {
    const rowData = [
        date,                           // A: date
        userId,                         // B: user_id
        data.no_overeating || false,    // C: no_overeating
        data.good_sleep || false,       // D: good_sleep
        data.milo_count || 0,           // E: milo_count
        data.exercise_minutes || 0,     // F: exercise_minutes
        data.water_2l || false,         // G: water_2l
        data.breakfast_time || false,   // H: breakfast_time_ok
        data.lunch_time || false,       // I: lunch_time_ok
        data.dinner_time || false,      // J: dinner_time_ok
        data.snacks_list || '',         // K: snacks_list
        data.stress_level || null,      // L: stress_level
        data.daily_note || '',          // M: daily_note
        require('moment')().format('YYYY-MM-DD HH:mm:ss') // N: created_at
    ];
    
    await sheetsUtils.saveToSheet('diet_records', rowData);
}

// 健康的なアプローチを重視した励ましメッセージ生成
function generateHealthyEncouragement(achievementCount, data) {
    const messages = [];
    
    // 記録をつけたこと自体を評価
    messages.push('今日も記録をつけることができました。継続することが一番大切です。');
    
    // 過食について健康的なメッセージ
    if (data.no_overeating) {
        messages.push('過食をコントロールできたのは素晴らしいことです。');
    } else if (!data.no_overeating && data.milo_count > 0) {
        messages.push(`過食衝動に対してミロで対処する工夫ができています（${data.milo_count}回）。`);
    }
    
    // 運動について
    if (data.exercise_minutes >= 30) {
        messages.push('30分以上の運動、体にも心にも良い影響があります。');
    } else if (data.exercise_minutes > 0) {
        messages.push('運動を実施できました。短時間でも続けることに意味があります。');
    }
    
    // 全体的な達成について
    if (achievementCount >= 4) {
        messages.push('多くの健康的な習慣を実践できています。');
    } else if (achievementCount >= 2) {
        messages.push('着実に健康的な生活に向かっています。');
    }
    
    return messages.join(' ');
}

// 最終的なダイエットチェックリスト送信処理（段階的システム版）
// 修正版：新しい5ステップシステム対応のhandleDietChecklistSubmit
async function handleDietChecklistSubmit(interaction) {
    try {
        // まず最初にdefer（timeout回避）
        await interaction.deferReply();
        
        const userId = interaction.user.id;
        const today = require('moment')().format('YYYY-MM-DD');
        
        // Step 5の全入力を取得（新しいフィールド名に対応）
        const miloCount = parseInt(interaction.fields.getTextInputValue('milo_count')) || 0;
        const exerciseMinutes = parseInt(interaction.fields.getTextInputValue('exercise_minutes')) || 0;
        const snacks = interaction.fields.getTextInputValue('snacks') || '';
        
        // final_notesまたはstress_level + daily_noteを取得
        let stressLevel = null;
        let dailyNote = '';
        
        try {
            // 新しい統合フィールドを試行
            const finalNotesInput = interaction.fields.getTextInputValue('final_notes') || '';
            const notesLines = finalNotesInput.split('\n');
            stressLevel = notesLines.length > 0 ? parseInt(notesLines[0]) || null : null;
            dailyNote = notesLines.length > 1 ? notesLines.slice(1).join('\n') : '';
        } catch (finalNotesError) {
            // 古い分離フィールドを試行
            try {
                stressLevel = parseInt(interaction.fields.getTextInputValue('stress_level')) || null;
                dailyNote = interaction.fields.getTextInputValue('daily_note') || '';
            } catch (separateFieldsError) {
                console.log('ストレス度・ひとことフィールドが見つかりません（オプションのためスキップ）');
            }
        }
        
        // 一時保存されたデータを取得
        const tempData = global.tempDietData[userId] || {};
        
        console.log('最終データ:', tempData);
        
        // 最終データを作成
        const finalData = {
            no_overeating: tempData.no_overeating || false,
            good_sleep: tempData.good_sleep || false,
            water_2l: tempData.water_2l || false,
            breakfast_time: tempData.breakfast_time || false,
            lunch_time: tempData.lunch_time || false,
            dinner_time: tempData.dinner_time || false,
            milo_count: miloCount,
            exercise_minutes: exerciseMinutes,
            snacks_list: snacks,
            stress_level: stressLevel,
            daily_note: dailyNote
        };
        
        // Google Sheetsに保存
        await saveDietRecord(userId, today, finalData);
        
        // 結果表示
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('✅ ダイエット記録を保存しました')
            .setDescription('今日の記録')
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 達成項目の表示
        const achievements = [];
        if (finalData.no_overeating) achievements.push('過食なし');
        if (finalData.good_sleep) achievements.push('良い睡眠');
        if (finalData.water_2l) achievements.push('水分2L以上');
        if (finalData.breakfast_time) achievements.push('朝食時間OK');
        if (finalData.lunch_time) achievements.push('昼食時間OK');
        if (finalData.dinner_time) achievements.push('夕食時間OK');
        
        if (achievements.length > 0) {
            embed.addFields({
                name: '🎯 達成項目',
                value: achievements.join(', '),
                inline: false
            });
        }
        
        // 数値項目の表示
        const metrics = [];
        if (finalData.milo_count > 0) metrics.push(`ミロ: ${finalData.milo_count}回`);
        if (finalData.exercise_minutes > 0) metrics.push(`エアロバイク: ${finalData.exercise_minutes}分`);
        
        if (metrics.length > 0) {
            embed.addFields({
                name: '📊 実施記録',
                value: metrics.join(', '),
                inline: false
            });
        }
        
        if (finalData.snacks_list) {
            embed.addFields({
                name: '🍪 間食',
                value: finalData.snacks_list,
                inline: false
            });
        }
        
        if (finalData.stress_level) {
            const stressEmoji = ['😊', '🙂', '😐', '😰', '😫'][finalData.stress_level - 1] || '😐';
            embed.addFields({
                name: '😌 ストレス度',
                value: `${finalData.stress_level}/5 ${stressEmoji}`,
                inline: true
            });
        }
        
        if (finalData.daily_note) {
            embed.addFields({
                name: '💭 今日のひとこと',
                value: finalData.daily_note,
                inline: false
            });
        }
        
        // 健康的なアプローチを重視した励ましメッセージ
        const encouragement = generateHealthyEncouragement(achievements.length, finalData);
        if (encouragement) {
            embed.addFields({
                name: '💪 応援メッセージ',
                value: encouragement,
                inline: false
            });
        }
        
        // 一時データを削除
        delete global.tempDietData[userId];
        
        // deferReply を使用しているので editReply で応答
        await interaction.editReply({ embeds: [embed] });
        
        console.log('✅ ダイエット記録処理完了:', userId);
        
    } catch (error) {
        console.error('ダイエット記録保存エラー:', error);
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'ダイエット記録の保存中にエラーが発生しました。'
                });
            } else {
                await interaction.reply({
                    content: 'ダイエット記録の保存中にエラーが発生しました。',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('エラー応答失敗:', replyError);
        }
    }
}

// ===== インタラクション処理（修正版・defer問題解決） =====
// ===== インタラクション処理（修正版） =====
client.on(Events.InteractionCreate, async interaction => {
    try {
        // ===== スラッシュコマンド処理 =====
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
                case 'diet':
                    await dietCommands.handleCommand(interaction);
                    break;
                case 'test-notification':
                    await handleTestNotification(interaction);
                    break;
                case 'routine':
                    await routineCommands.handleCommand(interaction, routineHandler);
                    break;
            }

        // ===== ボタンインタラクション処理 =====
        } else if (interaction.isButton()) {
            const customId = interaction.customId;
            console.log('🔍 ボタンが押されました:', customId);
            console.log('🔍 ユーザーID:', interaction.user.id);
            
            try {
                // ===== モーダル表示系ボタン（deferなし・最優先） =====
                
                // ダイエットチェックリストボタン処理（直接実装）
                if (customId === 'diet_checklist_modal') {
                    console.log('📋 ダイエットチェックリストボタンを検出');
                    await showDietChecklistModal(interaction);
                    return;
                }
                
                // ルーティンボタン処理
                if (customId.startsWith('routine_') || 
                    ['routine_next', 'routine_skip', 'routine_pause', 'routine_stop'].includes(customId)) {
                    
                    console.log('🔄 ルーティンボタンを検出:', customId);
                    
                    if (routineHandler) {
                        console.log('✅ ルーティンハンドラーに処理を委譲');
                        
                        try {
                            await routineHandler.handleButtonInteraction(interaction);
                            console.log('✅ ルーティンボタン処理完了');
                            return;
                        } catch (routineError) {
                            console.error('❌ ルーティンボタン処理エラー:', routineError);
                            
                            try {
                                if (!interaction.replied && !interaction.deferred) {
                                    await interaction.reply({
                                        content: '❌ ルーティン操作中にエラーが発生しました。',
                                        ephemeral: true
                                    });
                                } else if (interaction.deferred) {
                                    await interaction.editReply({
                                        content: '❌ ルーティン操作中にエラーが発生しました。',
                                        components: []
                                    });
                                }
                            } catch (replyError) {
                                console.error('エラーメッセージ送信失敗:', replyError);
                            }
                            return;
                        }
                    } else {
                        console.log('❌ ルーティンハンドラーが見つかりません');
                        try {
                            await interaction.reply({
                                content: '❌ ルーティンハンドラーが初期化されていません。',
                                ephemeral: true
                            });
                        } catch (replyError) {
                            console.error('エラーメッセージ送信失敗:', replyError);
                        }
                        return;
                    }
                }

            // Who Am I ボタン処理
                if (customId.startsWith('whoami_') || customId === 'whoami_setup_start') {
                    console.log('🌟 Who Am I ボタンを検出:', customId);
                    await whoamiCommands.handleButtonInteraction(interaction);
                    return;
                }

                // 体重記録ボタン処理（個人用）
                if (customId.startsWith('weight_record_')) {
                    console.log('⚖️ 体重記録ボタンを検出:', customId);
                    const userId = customId.replace('weight_record_', '');
                    if (interaction.user.id === userId) {
                        await showQuickWeightModal(interaction);
                    } else {
                        await interaction.reply({ 
                            content: 'これはあなた向けのリマインダーではありません。',
                            ephemeral: true
                        });
                    }
                    return;
                }

                // 日記書くボタン処理
                if (customId === 'diary_write_start') {
                    console.log('📝 日記書くボタンを検出');
                    await showDiaryModal(interaction);
                    return;
                }

                // 習慣追加ボタン
                if (customId === 'add_habit') {
                    console.log('🏃‍♂️ 習慣追加ボタンを検出');
                    await showAddHabitModal(interaction);
                    return;
                }

                // 週次目標設定ボタン
                if (customId === 'set_weekly_goals') {
                    console.log('🎯 週次目標設定ボタンを検出');
                    await showWeeklyGoalsModal(interaction);
                    return;
                }

                // Habit通知関連のボタン処理
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
                        await interaction.reply({
                            content: '❌ Habit通知ハンドラーが初期化されていません。',
                            ephemeral: true
                        });
                        return;
                    }
                }

                // ここ以降のボタンはdeferしてから処理
                if (!interaction.deferred && !interaction.replied) {
                    if (customId.includes('quick_done') || customId.includes('snooze')) {
                        await interaction.deferUpdate();
                    } else {
                        await interaction.deferReply({ ephemeral: true });
                    }
                }

                // スキップボタン処理
                if (customId === 'whoami_skip') {
                    await interaction.editReply({
                        content: '⏭️ Who Am I をスキップしました。今日も良い一日を！',
                        embeds: [],
                        components: []
                    });
                    return;
                } else if (customId === 'weight_skip') {
                    await interaction.editReply({
                        content: '⏭️ 体重記録を後回しにしました。忘れずに記録してくださいね！',
                        embeds: [],
                        components: []
                    });
                    return;
                } else if (customId === 'routine_later') {
                    await interaction.editReply({
                        content: '⏭️ ルーティンを後で実行します。お疲れ様でした！',
                        embeds: [],
                        components: []
                    });
                    return;
                } else if (customId === 'diary_skip') {
                    await interaction.editReply({
                        content: '⏭️ 日記を後で書きます。今日もお疲れ様でした！',
                        embeds: [],
                        components: []
                    });
                    return;
                } else if (customId === 'diet_skip') {
                    await interaction.editReply({
                        content: '⏭️ ダイエット記録を後で入力します。健康的な生活を心がけましょう！',
                        embeds: [],
                        components: []
                    });
                    return;
                } else {
                    // その他の既存ボタン処理
                    await interactionHandler.handleInteraction(interaction);
                }
                
            } catch (error) {
                console.error('ボタン処理エラー:', error);
                try {
                    if (interaction.deferred) {
                        await interaction.editReply({ 
                            content: 'ボタン処理中にエラーが発生しました。',
                            components: []
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

        // ===== セレクトメニュー処理 =====
        } else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;

            try {
        // ダイエット記録の段階的セレクトメニュー処理
        if (customId === 'diet_step1_overeating') {
            await handleDietStep1Overeating(interaction);
        } else if (customId === 'diet_step2_sleep') {
            await handleDietStep2Sleep(interaction);
        } else if (customId === 'diet_step3_water') {
            await handleDietStep3Water(interaction);
        } else if (customId === 'diet_step4_meals') {
            await handleDietStep4Meals(interaction);
        } else if (customId === 'habit_done_select') {
            await habitCommands.handleHabitDoneSelect(interaction);
        } else if (customId === 'habit_edit_select') {
            await habitCommands.handleHabitEditSelect(interaction);
        } else if (customId === 'habit_delete_select') {
            await habitCommands.handleHabitDeleteSelect(interaction);
        } else if (customId === 'diary_mood_first_select') {
            await handleDiaryMoodFirstSelect(interaction);
        } else {
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
            
            try {
                if (customId === 'habit_done_select') {
                    await habitCommands.handleHabitDoneSelect(interaction);
                } else if (customId === 'habit_edit_select') {
                    await habitCommands.handleHabitEditSelect(interaction);
                } else if (customId === 'habit_delete_select') {
                    await habitCommands.handleHabitDeleteSelect(interaction);
                } else if (customId === 'diary_mood_first_select') {
                    await handleDiaryMoodFirstSelect(interaction);
                } else {
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
            
        // ===== モーダル処理 =====
        } else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            
            try {
                // Who Am I モーダル処理
                if (customId.startsWith('whoami_edit_')) {
                    const handled = await whoamiCommands.handleModalSubmit(interaction);
                    if (handled) return;
                }
                
                // ダイエットチェックリスト送信処理（直接実装）
                if (customId === 'diet_checklist_submit') {
                    await handleDietChecklistSubmit(interaction);
                    return;
                }
                
                // 既存のモーダル処理
                if (customId === 'quick_weight_modal') {
                    await handleQuickWeightSubmit(interaction);
                } else if (customId === 'weekly_goals_modal') {
                    await handleWeeklyGoalsSubmit(interaction);
                } else if (customId === 'diary_content_modal') {
                    await handleDiaryContentSubmit(interaction);
                } else if (customId === 'add_habit_modal') {
                    await handleAddHabitSubmit(interaction);
                } else if (customId.startsWith('habit_edit_modal_')) {
                    const habitId = customId.replace('habit_edit_modal_', '');
                    await habitCommands.saveHabitEdit(interaction, habitId);
                } else {
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


// bot.js - 修正版 Part 9: ヘルパー関数1 - 統合目標・通知テスト

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

// goals専用のカレンダーナビゲーション処理
async function handleGoalsCalendarNavigation(interaction) {
    const customId = interaction.customId;
    
    // goals_calendar_2025_1 形式からyearとmonthを抽出
    const parts = customId.split('_');
    if (parts.length >= 4) {
        const year = parseInt(parts[2]);
        const month = parseInt(parts[3]);
        
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

// ===== 通知テスト用関数（habit通知+朝の通知追加版） =====
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

            case 'morning':
                // 🌅 朝の通知セットのテスト送信
                const channel = interaction.channel;
                const userId = interaction.user.id;
                
                await sendMorningNotificationSet(channel, userId);
                
                await interaction.reply({ 
                    content: '🌅 朝の通知セットをテスト送信しました。', 
                    ephemeral: true 
                });
                break;

            case 'evening':
                // 🌙 夜の通知セットのテスト送信
                const eveningChannel = interaction.channel;
                const eveningUserId = interaction.user.id;
                
                await sendEveningNotificationSet(eveningChannel, eveningUserId);
                
                await interaction.reply({ 
                    content: '🌙 夜の通知セットをテスト送信しました。', 
                    ephemeral: true 
                });
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

// bot.js - 修正版 Part 10: ヘルパー関数2 - モーダル・UI関数

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

// 日記モーダル表示（修正版 - 気分選択表示に変更）
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

// bot.js - 修正版 Part 11: ハンドラー関数1 - 体重・日記・習慣

// ===== ハンドラー関数群 =====

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

// 習慣追加モーダル送信処理
async function handleAddHabitSubmit(interaction) {
    const name = interaction.fields.getTextInputValue('habit_name');
    const frequency = interaction.fields.getTextInputValue('habit_frequency');
    const difficulty = interaction.fields.getTextInputValue('habit_difficulty');
    
    try {
        const userId = interaction.user.id;
        
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

// ===== 週次目標保存関数の修正版 =====
// handleWeeklyGoalsSubmit の修正版
async function handleWeeklyGoalsSubmit(interaction) {
    const goal = interaction.fields.getTextInputValue('weekly_goal');
    
    try {
        const moment = require('moment');
        const { EmbedBuilder } = require('discord.js');
        
        const userId = interaction.user.id;
        const weekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const weekEnd = moment().endOf('isoWeek').format('YYYY-MM-DD');
        
        // 既存のgoals_dataシートに保存
        const goalContent = `[${weekStart}〜${weekEnd}] ${goal}`;
        
        // 🔧 修正：安全な保存関数を使用
        await saveWeeklyGoalToSheetSafe(userId, goalContent);
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 今週の目標を設定しました')
            .setDescription(`**目標:** ${goal}`)
            .addFields(
                { name: '📅 期間', value: `${moment().startOf('isoWeek').format('MM/DD')} - ${moment().endOf('isoWeek').format('MM/DD')}`, inline: false },
                { name: '💪 応援メッセージ', value: '素晴らしい目標ですね！一歩ずつ着実に進んでいきましょう。', inline: false }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        console.log(`✅ 週次目標設定完了: ${userId} - ${goal}`);
        
    } catch (error) {
        console.error('❌ 週次目標保存エラー:', error);
        await interaction.reply({
            content: '❌ 目標の保存中にエラーが発生しました。再度お試しください。',
            ephemeral: true
        });
    }
}

// 修正版2：既存のsheetsUtilsメソッドを使用した週次目標保存関数
async function saveWeeklyGoalToSheet(userId, goalContent) {
    try {
        const moment = require('moment');
        
        // 目標IDを生成（タイムスタンプ + ランダム）
        const goalId = `weekly_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        // 方法1: 既存のsaveToSheetメソッドを使用（推奨）
        try {
            const rowData = [
                goalId,                                    // A: 目標ID
                userId,                                    // B: ユーザーID
                'weekly',                                  // C: 目標タイプ
                goalContent,                               // D: 目標内容
                moment().format('YYYY-MM-DD HH:mm:ss')     // E: 作成日時
            ];
            
            console.log('💾 goals_dataにデータを保存中...', rowData);
            await sheetsUtils.saveToSheet('goals_data', rowData);
            
            console.log(`✅ 週次目標を保存 (method1): ${goalId} - ${goalContent}`);
            return goalId;
            
        } catch (saveToSheetError) {
            console.error('saveToSheetエラー:', saveToSheetError);
            
            // 方法2: Google Sheets APIを直接使用（フォールバック）
            console.log('🔄 Google Sheets API直接使用に切り替え...');
            
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const range = 'goals_data!A:E';
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const values = [[
                goalId,
                userId,
                'weekly',
                goalContent,
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            const response = await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });
            
            console.log(`✅ 週次目標を保存 (method2): ${goalId} - ${goalContent}`);
            return goalId;
        }
        
    } catch (error) {
        console.error('❌ 週次目標保存エラー:', error);
        throw error;
    }
}

// 更に安全な方法：既存の保存メソッドをチェックして使用
async function saveWeeklyGoalToSheetSafe(userId, goalContent) {
    try {
        const moment = require('moment');
        
        // 目標IDを生成
        const goalId = `weekly_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        console.log('🔍 利用可能なsheetsUtilsメソッドをチェック中...');
        console.log('sheetsUtils methods:', Object.getOwnPropertyNames(sheetsUtils));
        
        // 利用可能なメソッドを確認して使用
        if (typeof sheetsUtils.saveToSheet === 'function') {
            console.log('✅ saveToSheetメソッドを使用');
            
            const rowData = [
                goalId,
                userId,
                'weekly',
                goalContent,
                moment().format('YYYY-MM-DD HH:mm:ss')
            ];
            
            await sheetsUtils.saveToSheet('goals_data', rowData);
            
        } else if (typeof sheetsUtils.addRowToSheet === 'function') {
            console.log('✅ addRowToSheetメソッドを使用');
            
            await sheetsUtils.addRowToSheet('goals_data', [
                goalId, userId, 'weekly', goalContent, moment().format('YYYY-MM-DD HH:mm:ss')
            ]);
            
        } else if (typeof sheetsUtils.appendRowToSheet === 'function') {
            console.log('✅ appendRowToSheetメソッドを使用');
            
            await sheetsUtils.appendRowToSheet('goals_data', [
                goalId, userId, 'weekly', goalContent, moment().format('YYYY-MM-DD HH:mm:ss')
            ]);
            
        } else {
            // 直接Google Sheets APIを使用
            console.log('⚠️ 既存メソッドが見つからないため、Google Sheets APIを直接使用');
            
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const range = 'goals_data!A:E';
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const values = [[
                goalId,
                userId,
                'weekly',
                goalContent,
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });
        }
        
        console.log(`✅ 週次目標を保存: ${goalId} - ${goalContent}`);
        return goalId;
        
    } catch (error) {
        console.error('❌ 週次目標保存エラー:', error);
        throw error;
    }
}
// bot.js - 修正版 Part 12: ハンドラー関数2・UI表示関数

// クイック完了セレクト処理
async function handleQuickDoneSelect(interaction) {
    const habitId = interaction.values[0];
    
    try {
        const userId = interaction.user.id;
        const today = require('moment')().format('YYYY-MM-DD');
        
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

// ===== 日記目標関連のプレースホルダー関数（実装は他ファイルに委譲） =====
async function handleDiaryGoalFrequency(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalMood(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalReview(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalProgressButton(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryReviewSave(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryReviewShare(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalFrequencySubmit(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalMoodSubmit(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

async function handleDiaryGoalReviewSubmit(interaction) {
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

// 旧日記モーダル処理（削除予定）
async function handleDiarySubmit(interaction) {
    console.log('⚠️ 旧日記モーダルが使用されました。新しい気分選択フローに移行してください。');
    // 実装は commands/diary.js に委譲
    await interactionHandler.handleInteraction(interaction);
}

// 習慣クイック完了選択
async function showHabitQuickDoneSelect(interaction) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    
    try {
        const userId = interaction.user.id;
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


// ===== 通知テスト関数 =====
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
            case 'evening':
                const eveningChannel = interaction.channel;
                const eveningUserId = interaction.user.id;
                
                await sendEveningNotificationSet(eveningChannel, eveningUserId);
                
                await interaction.reply({ 
                    content: '🌙 夜の通知セット（ダイエット記録付き）をテスト送信しました。', 
                    ephemeral: true 
                });
                break;

            case 'morning':
                const channel = interaction.channel;
                const userId = interaction.user.id;
                
                await sendMorningNotificationSet(channel, userId);
                
                await interaction.reply({ 
                    content: '🌅 朝の通知セットをテスト送信しました。', 
                    ephemeral: true 
                });
                break;

            default:
                await notificationManager.testNotification(subcommand);
                await interaction.reply({ 
                    content: `📝 ${subcommand} 通知をテスト送信しました。`, 
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

// ===== プロセス終了時の処理 =====
process.on('SIGINT', () => {
    console.log('Botを停止中...');
    
    if (routineHandler && routineHandler.notificationService) {
        routineHandler.notificationService.shutdown();
    }
    
    if (notificationManager) {
        notificationManager.shutdown();
    }
   
    if (habitNotificationService) {
        habitNotificationService.shutdown();
    }
 
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Botを停止中...');
    
    if (routineHandler && routineHandler.notificationService) {
        routineHandler.notificationService.shutdown();
    }
    
    if (notificationManager) {
        notificationManager.shutdown();
    }

    if (habitNotificationService) {
        habitNotificationService.shutdown();
    }
    
    client.destroy();
    process.exit(0);
});

// ===== ログイン =====
client.login(process.env.DISCORD_TOKEN);
