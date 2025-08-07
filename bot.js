// bot.js - 完全版（全機能統合 + 通知システム + ボタン処理修正版 + goals機能追加 + 起床トリガー機能）

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
        .addSubcommand(subcommand =>  // 🌅 新追加
            subcommand
                .setName('morning')
                .setDescription('朝の通知セットをテスト'))
        .addSubcommand(subcommand =>  // 🌙 新追加
            subcommand
                .setName('evening')
                .setDescription('夜の通知セットをテスト'))
                
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

// ===== メッセージ処理（起床・就寝トリガー用） 🌅🌙 修正版 =====
client.on(Events.MessageCreate, async message => {
    // Botのメッセージは無視
    if (message.author.bot) return;
    
    const messageContent = message.content.toLowerCase();
    
    // 起床キーワードをチェック
    const wakeupKeywords = ['起きた', 'おはよう', 'おはよ', 'good morning', 'wake up', 'おきた'];
    const isWakeupMessage = wakeupKeywords.some(keyword => 
        messageContent.includes(keyword.toLowerCase())
    );
    
    // 就寝キーワードをチェック 🌙 新追加
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

// 朝の通知を手動トリガー 🌅 修正版
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

// 夜の通知を手動トリガー 🌙 新追加
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

// 朝の通知セットを送信 🌅 修正版（習慣削除、ルーティン修正）
async function sendMorningNotificationSet(channel, userId) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    console.log(`🌅 朝の通知セット送信開始: ${userId}`);
    
    // 1. Who Am I リマインダー（ephemeralに変更）
    try {
        const whoAmIEmbed = new EmbedBuilder()
            .setTitle('🌟 おはようございます！')
            .setDescription(`<@${userId}> 新しい一日の始まりです！\n今日のあなたを確認してみましょう。`)
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

        // ephemeral（自分だけ表示）で送信
        const whoAmIMessage = await channel.send({ 
            content: `<@${userId}> のみに表示`,
            embeds: [whoAmIEmbed], 
            components: [whoAmIRow]
        });
        
        // メッセージを一定時間後に削除（疑似ephemeral）
        setTimeout(() => {
            whoAmIMessage.delete().catch(console.error);
        }, 300000); // 5分後に削除
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
    } catch (error) {
        console.error('Who Am I 通知送信エラー:', error);
    }

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
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
    } catch (error) {
        console.error('体重記録通知送信エラー:', error);
    }

    // 3. 朝のルーティン開始リマインダー（修正版）
    try {
        if (routineHandler && routineHandler.routineService) {
            let routines = [];
            
            // routineService のメソッドを安全に呼び出し
            try {
                if (typeof routineHandler.routineService.getUserRoutines === 'function') {
                    routines = await routineHandler.routineService.getUserRoutines(userId);
                } else if (typeof routineHandler.routineService.getRoutines === 'function') {
                    // 代替メソッドを試行
                    const allRoutines = await routineHandler.routineService.getRoutines();
                    routines = allRoutines.filter(r => r.userId === userId);
                } else {
                    console.log('⚠️ ルーティン取得メソッドが見つかりません');
                    // 直接シートから取得を試行
                    const sheetsUtils = require('./utils/sheets');
                    const routineData = await sheetsUtils.getSheetData('routines_master', 'A:Z');
                    routines = routineData.slice(1).filter(row => row[1] === userId).map(row => ({
                        id: row[0],
                        userId: row[1],
                        name: row[2],
                        description: row[3] || ''
                    }));
                }
            } catch (routineError) {
                console.error('ルーティン取得エラー:', routineError);
                routines = [];
            }
            
            const morningRoutines = routines.filter(r => 
                r.name.toLowerCase().includes('朝') || 
                r.name.toLowerCase().includes('モーニング') || 
                r.name.toLowerCase().includes('morning') ||
                r.name.toLowerCase().includes('起床')
            );

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
}

// 夜の通知セットを送信 🌙 新追加
async function sendEveningNotificationSet(channel, userId) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    console.log(`🌙 夜の通知セット送信開始: ${userId}`);
    
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
                    const sheetsUtils = require('./utils/sheets');
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
}

// ===== インタラクション処理（修正版・defer問題解決） =====
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
            
            // ⭐ defer処理を調整（ルーティン以外のみ）
            try {
                if (!interaction.deferred && !interaction.replied) {
                    // ルーティンボタンの場合はroutineHandlerに委譲（deferしない）
                    if (customId.startsWith('routine_')) {
                        // routineHandlerでdeferするのでここでは何もしない
                    } else if (customId.includes('quick_done') || customId.includes('snooze')) {
                        await interaction.deferUpdate();
                    } else {
                        await interaction.deferReply({ flags: 64 }); // ephemeral の代わりに flags を使用
                    }
                }
            } catch (deferError) {
                console.error('defer実行エラー:', deferError);
                return; // deferに失敗したら処理を中断
            }
            
            try {
                // ルーティン関連のボタン処理を最初にチェック
                if (customId.startsWith('routine_') || 
                    ['routine_next', 'routine_skip', 'routine_pause', 'routine_stop'].includes(customId)) {
                    
                    console.log('🔄 ルーティンボタンを検出:', customId);
                    
                    if (routineHandler) {
                        console.log('✅ ルーティンハンドラーに処理を委譲');
                        
                        try {
                            // routineHandlerで完全に処理（bot.jsではdeferしない）
                            await routineHandler.handleButtonInteraction(interaction);
                            console.log('✅ ルーティンボタン処理完了');
                            return;
                        } catch (routineError) {
                            console.error('❌ ルーティンボタン処理エラー:', routineError);
                            
                            // エラーが発生した場合の応答
                            try {
                                if (!interaction.replied && !interaction.deferred) {
                                    await interaction.reply({
                                        content: '❌ ルーティン操作中にエラーが発生しました。',
                                        flags: 64
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
                                flags: 64
                            });
                        } catch (replyError) {
                            console.error('エラーメッセージ送信失敗:', replyError);
                        }
                        return;
                    }
                }

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

                // 🌅 起床通知のスキップボタン処理 - 新追加
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
                                    flags: 64
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
                            content: 'ボタン処理中にエラーが発生しました。',
                            components: []
                        });
                    } else if (!interaction.replied) {
                        await interaction.reply({ 
                            content: 'ボタン処理中にエラーが発生しました。', 
                            flags: 64
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
                        flags: 64
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
                        flags: 64
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
                flags: 64
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
                // 🌅 朝の通知セットのテスト送信 - 新追加
                const channel = interaction.channel;
                const userId = interaction.user.id;
                
                await sendMorningNotificationSet(channel, userId);
                
                await interaction.reply({ 
                    content: '🌅 朝の通知セットをテスト送信しました。', 
                    ephemeral: true 
                });
                break;

            case 'evening':
                // 🌙 夜の通知セットのテスト送信 - 新追加
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

// その他の関数は既存のものをそのまま使用...
// (handleDiaryGoalFrequency, handleDiaryGoalMood, handleDiaryGoalReview, 
//  handleDiaryGoalFrequencySubmit, handleDiaryGoalMoodSubmit, handleDiaryGoalReviewSubmit,
//  handleDiaryGoalProgressButton, handleDiaryReviewSave, handleDiaryReviewShare など)

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
