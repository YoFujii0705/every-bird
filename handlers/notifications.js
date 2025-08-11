// handlers/notifications.js - 修正版（シンタックスエラー修正）

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const calculations = require('../utils/calculations');
const config = require('../config.json');

class NotificationManager {
    constructor(client) {
        this.client = client;
        this.scheduledJobs = new Map();
        this.isInitialized = false;
    }

    // 通知システムの初期化
    initialize() {
        if (this.isInitialized) return;
        
        console.log('🔔 通知システムを初期化中...');
        
        // 定期通知のスケジュール設定
        this.scheduleNotifications();
        
        this.isInitialized = true;
        console.log('✅ 通知システムが開始されました');
    }

// 定期通知のスケジュール設定
    scheduleNotifications() {
        // 1. 毎日7:30 - 体重記録リマインダー
        //const weightReminderJob = cron.schedule('30 7 * * *', () => {
       //     this.sendWeightReminder();
      //  }, {
      //      scheduled: true,
      //      timezone: 'Asia/Tokyo'
      //  });
      //  this.scheduledJobs.set('weight_reminder', weightReminderJob);

        // 2. 毎日21:00 - 日記リマインダー
      //  const diaryReminderJob = cron.schedule('0 21 * * *', () => {
      //      this.sendDiaryReminder();
      //  }, {
      //      scheduled: true,
      //      timezone: 'Asia/Tokyo'
      //  });
      //  this.scheduledJobs.set('diary_reminder', diaryReminderJob);

        // 3. 毎朝9:00 - 習慣サマリー（現在は無効化）
        // const habitSummaryJob = cron.schedule('0 9 * * *', () => {
        //     this.sendHabitSummary();
        // }, {
        //     scheduled: true,
        //     timezone: 'Asia/Tokyo'
        // });
        // this.scheduledJobs.set('habit_summary', habitSummaryJob);

        // 4. 毎週月曜日8:00 - 週次レポート
        const weeklyReportJob = cron.schedule('0 8 * * 1', () => {
            this.sendPersonalizedWeeklyReport();
        }, {
            scheduled: true,
            timezone: 'Asia/Tokyo'
        });
        this.scheduledJobs.set('weekly_report', weeklyReportJob);

        // 5. 毎朝7:00 - Who Am I リマインダー 🌟 ここに移動
       // const whoAmIReminderJob = cron.schedule('0 7 * * *', () => {
      //      this.sendWhoAmIReminder();
      //  }, {
      //      scheduled: true,
     //       timezone: 'Asia/Tokyo'
     //   });
     //   this.scheduledJobs.set('whoami_reminder', whoAmIReminderJob);

        console.log('📅 定期通知スケジュールを設定しました');
    }

    // 体重記録リマインダー（毎日7:30）
    async sendWeightReminder() {
        console.log('🔔 体重リマインダー開始');
        
        const channelId = process.env.REMINDER_CHANNEL_ID;
        if (!channelId) {
            console.log('❌ REMINDER_CHANNEL_ID が設定されていません');
            return;
        }
        console.log('✅ チャンネルID:', channelId);

        try {
            const channel = await this.client.channels.fetch(channelId);
            console.log('✅ チャンネル取得成功:', channel.name);
            
            const today = moment().format('YYYY-MM-DD');
            console.log('📅 今日の日付:', today);

            // テスト用：特定のユーザーを強制的にアクティブユーザーとして扱う
            const testUserId = 406748284942548992; // ← あなたのDiscord UserIDに置き換え
            console.log('🧪 テストユーザーID:', testUserId);
            
            const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
            console.log('📅 昨日の日付:', yesterday);
            
            let recentWeightEntries = await this.getRecentWeightUsers(yesterday, 7);
            console.log('📊 検出されたアクティブユーザー:', recentWeightEntries.length, recentWeightEntries);
            
            // テスト用：アクティブユーザーがいない場合は強制的に追加
            if (recentWeightEntries.length === 0) {
                console.log('🧪 テスト用：強制的にアクティブユーザーを追加');
                recentWeightEntries = [{
                    userId: testUserId,
                    lastRecordDate: yesterday
                }];
            }

            if (recentWeightEntries.length === 0) {
                console.log('⚠️ アクティブユーザーが0人のため全体メッセージを送信');
                // 全体向けメッセージ（通常は表示されない）
                const embed = new EmbedBuilder()
                    .setTitle('⚖️ おはよう！今日の体重を記録しましょう')
                    .setDescription('健康的な習慣作りは毎日の小さな積み重ねから始まります')
                    .addFields(
                        { name: '📊 記録のメリット', value: '• 体重変化の傾向を把握\n• 目標達成の進捗確認\n• 健康的なライフスタイルの維持', inline: false }
                    )
                    .setColor(0x00AE86)
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('quick_weight_record')
                            .setLabel('体重を記録')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('⚖️')
                    );

                await channel.send({ embeds: [embed], components: [row] });
                console.log('✅ 全体メッセージ送信完了');
                return;
            }

            console.log(`👥 ${recentWeightEntries.length}人のアクティブユーザーにパーソナライズリマインダーを送信開始`);
            
            // アクティブユーザー向けのパーソナライズされたリマインダー
            for (const userEntry of recentWeightEntries) {
                console.log(`📤 ${userEntry.userId} にリマインダー送信中...`);
                await this.sendPersonalizedWeightReminder(channel, userEntry.userId, today);
                console.log(`✅ ${userEntry.userId} にリマインダー送信完了`);
            }

            console.log('🎉 体重リマインダー処理完了');

        } catch (error) {
            console.error('❌ 体重記録リマインダーエラー:', error);
        }
    }

    // パーソナライズされた体重リマインダー（デバッグ版）
    async sendPersonalizedWeightReminder(channel, userId, today) {
        console.log(`🔍 パーソナライズリマインダー開始 - ユーザー: ${userId}, 日付: ${today}`);
        
        try {
            // 今日既に記録済みかチェック
            console.log('📋 今日の記録をチェック中...');
            const todayEntry = await sheetsUtils.getWeightEntry(userId, today);
            if (todayEntry) {
                console.log('⏭️ 既に今日の記録があるためスキップ:', todayEntry);
                return; // 既に記録済みの場合はスキップ
            }
            console.log('✅ 今日の記録なし、リマインダー送信継続');

            // 最近の体重データを取得
            console.log('📊 最近の体重データを取得中...');
            const recentEntries = await sheetsUtils.getWeightEntriesInRange(
                userId, 
                moment().subtract(7, 'days').format('YYYY-MM-DD'), 
                moment().subtract(1, 'day').format('YYYY-MM-DD')
            );
            console.log('📊 最近のエントリー数:', recentEntries.length);

            // 🧪 テスト用：データがなくても強制的にリマインダーを表示
            if (recentEntries.length === 0) {
                console.log('🧪 テスト用：データがないが強制的にリマインダーを表示');
            }

            // 目標情報を取得
            console.log('🎯 目標情報を取得中...');
            const goal = await sheetsUtils.getWeightGoal(userId);
            console.log('🎯 目標情報:', goal);

            let description = '今日も体重を記録して、健康管理を続けましょう！';
            
            // 最近のトレンドを分析（データがある場合のみ）
            if (recentEntries.length >= 3) {
                const recent3Days = recentEntries.slice(-3);
                const weights = recent3Days.map(e => parseFloat(e.weight));
                const trend = weights[weights.length - 1] - weights[0];

                if (Math.abs(trend) >= 0.5) {
                    const direction = trend > 0 ? '増加' : '減少';
                    description += `\n\n📈 最近3日間で${Math.abs(trend).toFixed(1)}kgの${direction}傾向です`;
                }
            } else {
                // データがない場合のメッセージ
                description += '\n\n🌟 体重記録を始めて、健康管理の第一歩を踏み出しましょう！';
            }

            const embed = new EmbedBuilder()
                .setTitle('⚖️ おはよう！体重記録の時間です')
                .setDescription(description)
                .setColor(0x00AE86)
                .setTimestamp();

            // 目標との比較（データがある場合のみ）
            if (goal && goal.target && recentEntries.length > 0) {
                const lastWeight = parseFloat(recentEntries[recentEntries.length - 1].weight);
                const remaining = goal.target - lastWeight;
                const direction = remaining > 0 ? '増量' : '減量';
                
                embed.addFields({
                    name: '🎯 目標進捗',
                    value: `目標まで: ${Math.abs(remaining).toFixed(1)}kg ${direction}`,
                    inline: true
                });
            } else if (recentEntries.length === 0) {
                // データがない場合の励ましメッセージ
                embed.addFields({
                    name: '🚀 スタート', 
                    value: '今日から始めましょう！', 
                    inline: true
                });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`weight_record_${userId}`)
                        .setLabel('体重を記録')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('⚖️')
                );

            console.log('📤 Discord メッセージ送信中...');
            await channel.send({ 
                content: `<@${userId}>`, 
                embeds: [embed], 
                components: [row] 
            });
            console.log('✅ Discord メッセージ送信完了');

        } catch (error) {
            console.error('❌ パーソナライズ体重リマインダーエラー:', error);
        }
    }

    // 日記リマインダー（毎日21:00）
    async sendDiaryReminder() {
        const channelId = process.env.REMINDER_CHANNEL_ID;
        if (!channelId) return;

        try {
            const channel = await this.client.channels.fetch(channelId);
            const today = moment().format('YYYY-MM-DD');

            // 今日日記を書いていないアクティブユーザーを取得
            const activeDiaryUsers = await this.getActiveDiaryUsers(today);

            const embed = new EmbedBuilder()
                .setTitle('📝 今日の振り返りタイム')
                .setDescription('一日お疲れさまでした。今日の出来事を振り返って日記を書きませんか？')
                .addFields(
                    { name: '✨ 日記のメリット', value: '• 一日の振り返りでストレス解消\n• 感情の整理と自己理解\n• 成長の記録として', inline: false },
                    { name: '💭 書くヒント', value: '• 今日良かったこと\n• 新しく学んだこと\n• 明日への意気込み', inline: false }
                )
                .setColor(0x9B59B6)
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('write_diary')
                        .setLabel('日記を書く')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

            await channel.send({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('日記リマインダーエラー:', error);
        }
    }

    // 習慣サマリー（毎朝9:00）- 現在は無効化
    async sendHabitSummary() {
        const channelId = process.env.REMINDER_CHANNEL_ID;
        if (!channelId) return;

        try {
            const channel = await this.client.channels.fetch(channelId);
            const today = moment().format('YYYY-MM-DD');

            // アクティブな習慣ユーザーを取得
            const activeHabitUsers = await this.getActiveHabitUsers();

            if (activeHabitUsers.length === 0) {
                // 新規ユーザー向けメッセージ
                const embed = new EmbedBuilder()
                    .setTitle('🌅 おはよう！新しい一日の始まりです')
                    .setDescription('素晴らしい一日にするために、小さな習慣から始めませんか？')
                    .addFields(
                        { name: '💡 習慣づくりのコツ', value: '• 小さく始める\n• 毎日同じ時間に実行\n• 達成を記録して可視化', inline: false }
                    )
                    .setColor(0xF39C12)
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('add_habit')
                            .setLabel('習慣を追加')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('➕')
                    );

                await channel.send({ embeds: [embed], components: [row] });
                return;
            }

            // 習慣サマリーを生成（現在はコメントアウト）
             let summaryText = '';
             let totalPendingHabits = 0;

             for (const userId of activeHabitUsers) {
                 const userHabits = await sheetsUtils.getUserHabits(userId);
                 const todayLogs = await sheetsUtils.getHabitLogsForDate(userId, today);
                
                 const pending = userHabits.filter(habit => 
                     !todayLogs.some(log => log.habitId === habit.id)
                 );
                
                 totalPendingHabits += pending.length;
             }

             const embed = new EmbedBuilder()
                 .setTitle('🏃‍♂️ 今日の習慣チェック')
                 .setDescription(`おはようございます！今日も習慣を続けて素晴らしい一日にしましょう`)
                 .addFields(
                     { name: '📊 今日の状況', value: `アクティブユーザー: ${activeHabitUsers.length}人\n未完了習慣: ${totalPendingHabits}個`, inline: false }
                 )
                 .setColor(0x3498DB)
                 .setTimestamp();

             const row = new ActionRowBuilder()
                 .addComponents(
                     new ButtonBuilder()
                         .setCustomId('quick_done')
                         .setLabel('習慣を完了')
                         .setStyle(ButtonStyle.Primary)
                         .setEmoji('✅'),
                     new ButtonBuilder()
                         .setCustomId('habit_list')
                         .setLabel('習慣一覧')
                         .setStyle(ButtonStyle.Secondary)
                         .setEmoji('📋')
               );

             await channel.send({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('習慣サマリーエラー:', error);
        }
    }

// Who Am I リマインダー（毎朝7:00）
async sendWhoAmIReminder() {
    console.log('🌟 Who Am I リマインダー開始');
    
    const channelId = process.env.REMINDER_CHANNEL_ID;
    if (!channelId) {
        console.log('❌ REMINDER_CHANNEL_ID が設定されていません');
        return;
    }

    try {
        const channel = await this.client.channels.fetch(channelId);
        console.log('✅ チャンネル取得成功:', channel.name);
        
        // Who Am I対象ユーザーを取得
        const targetUserId = process.env.WHOAMI_TARGET_USER_ID || '406748284942548992'; // デフォルトまたは設定されたユーザーID
        
        // ユーザーのWho Am Iデータが設定されているかチェック
        const whoamiData = await sheetsUtils.getWhoAmIData(targetUserId);
        
        if (!whoamiData || !whoamiData.identity) {
            console.log('⚠️ Who Am I データが設定されていないため通知をスキップ');
            
            // データが未設定の場合の通知
            const setupEmbed = new EmbedBuilder()
                .setTitle('🌅 おはよう！Who Am I を設定しましょう')
                .setDescription('新しい一日の始まりです。\nまずは自分について設定してみませんか？')
                .addFields(
                    { name: '🌟 Who Am I とは？', value: '• 自分は何者なのか\n• 何を目指しているのか\n• 今やるべきことは何か', inline: false },
                    { name: '💡 設定方法', value: '`/whoami edit` コマンドで各項目を設定できます', inline: false }
                )
                .setColor(0xF39C12)
                .setTimestamp();

            const setupRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('whoami_setup_start')
                        .setLabel('Who Am I を設定する')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('⚙️')
                );

            await channel.send({
                content: `<@${targetUserId}>`,
                embeds: [setupEmbed],
                components: [setupRow]
            });
            
            return;
        }
        
        // Who Am I セッション開始の通知
        const whoamiCommands = require('../commands/whoami');
        await whoamiCommands.sendMorningWhoAmI(this.client, targetUserId, channelId);
        
        console.log('✅ Who Am I リマインダー送信完了');

    } catch (error) {
        console.error('❌ Who Am I リマインダーエラー:', error);
    }
}

// 週次レポート（毎週月曜日8:00）
async sendWeeklyReport() {
    const channelId = process.env.REMINDER_CHANNEL_ID;
    if (!channelId) return;

    try {
        const channel = await this.client.channels.fetch(channelId);
        
        // 先週の期間を計算
        const lastWeekEnd = moment().subtract(1, 'day').endOf('isoWeek');
        const lastWeekStart = lastWeekEnd.clone().startOf('isoWeek');

        // アクティブユーザーを取得（体重記録ベース）
        const recentWeightUsers = await this.getRecentWeightUsers(
            lastWeekStart.format('YYYY-MM-DD'), 
            7
        );

        if (recentWeightUsers.length === 0) {
            // アクティブユーザーがいない場合は全体向けメッセージ
            const embed = new EmbedBuilder()
                .setTitle('📈 週次レポート')
                .setDescription(`${lastWeekStart.format('MM/DD')} - ${lastWeekEnd.format('MM/DD')} の振り返り\n\n新しい週が始まりました！今週の目標を立てて充実した1週間にしましょう。`)
                .setColor(0xE74C3C)
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('set_weekly_goals')
                        .setLabel('今週の目標設定')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎯')
                );

            await channel.send({ embeds: [embed], components: [row] });
            return;
        }

        // アクティブユーザーごとに週次統計を生成して送信
        for (const userEntry of recentWeightUsers) {
            await this.sendPersonalizedWeeklyReport(channel, userEntry.userId, lastWeekStart, lastWeekEnd);
        }

    } catch (error) {
        console.error('週次レポートエラー:', error);
    }
}

// notifications.js の sendPersonalizedWeeklyReport を拡張
// パーソナライズされた週次レポート（目標表示付き拡張版）
// パーソナライズされた週次レポート（目標表示付き拡張版）
    async sendPersonalizedWeeklyReport(channel, userId, weekStart, weekEnd) {
        try {
            const startDate = weekStart.format('YYYY-MM-DD');
            const endDate = weekEnd.format('YYYY-MM-DD');

            // 既存の週次統計データを取得
            const [weightEntries, diaryEntries, routineExecutions, weeklyGoals] = await Promise.all([
                sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate),
                sheetsUtils.getDiaryEntriesInRange(userId, startDate, endDate),
                sheetsUtils.getRoutineExecutionsInRange(userId, startDate, endDate),
                this.getWeeklyGoals(userId, startDate) // 🎯 クラス内メソッドとして呼び出し
            ]);

            // 体重変化を計算
            let weightChange = '変化なし';
            if (weightEntries.length >= 2) {
                const firstWeight = parseFloat(weightEntries[0].weight);
                const lastWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
                const change = lastWeight - firstWeight;
                
                if (change > 0) {
                    weightChange = `+${change.toFixed(1)}kg`;
                } else if (change < 0) {
                    weightChange = `${change.toFixed(1)}kg`;
                }
            } else if (weightEntries.length === 1) {
                weightChange = '1回のみ記録';
            }

            // 気分の平均を計算
            const averageMood = calculations.calculateAverageMood(diaryEntries);

            // ルーティン実行統計を計算
            const routineStats = this.calculateRoutineStats(routineExecutions);

            // 🎯 目標達成状況を評価
            const goalStatus = this.evaluateWeeklyGoalAchievement(weeklyGoals, {
                weightEntries,
                diaryEntries,
                routineExecutions
            });

            const embed = new EmbedBuilder()
                .setTitle('📊 週次統計')
                .setDescription(`${weekStart.format('MM/DD')} - ${weekEnd.format('MM/DD')}の振り返り`)
                .addFields(
                    { name: '⚖️ 体重記録', value: `${weightEntries.length}/7日`, inline: true },
                    { name: '📝 日記', value: `${diaryEntries.length}/7日`, inline: true },
                    { name: '🔄 ルーティン', value: `${routineStats.totalExecutions}回実行`, inline: true },
                    { name: '📈 体重変化', value: weightChange, inline: true },
                    { name: '😊 平均気分', value: averageMood, inline: true },
                    { name: '✅ ルーティン完了率', value: `${routineStats.completionRate}%`, inline: true }
                )
                .setColor(0xE74C3C)
                .setTimestamp();

            // 🎯 週次目標の表示（新機能）
            if (weeklyGoals && weeklyGoals.length > 0) {
                const goalsText = weeklyGoals.map(goal => {
                    const status = goalStatus[goal.id] || '未評価';
                    const statusEmoji = this.getGoalStatusEmoji(status);
                    const cleanContent = goal.content.replace(/^\[.*?\]\s*/, ''); // 日付部分を除去
                    return `${statusEmoji} ${cleanContent} (${status})`;
                }).join('\n');

                embed.addFields({
                    name: '🎯 今週の目標と達成状況',
                    value: goalsText,
                    inline: false
                });
            }

            // ルーティン詳細を追加（既存）
            if (routineStats.routineDetails.length > 0) {
                const routineDetailText = routineStats.routineDetails.map(detail => 
                    `• ${detail.name}: ${detail.executions}回 (完了:${detail.completed}回)`
                ).join('\n');
                
                embed.addFields({
                    name: '🔄 ルーティン詳細',
                    value: routineDetailText,
                    inline: false
                });
            }

            // 評価メッセージを更新（目標達成も考慮）
            let evaluation = '';
            const totalActiveDays = Math.max(weightEntries.length, diaryEntries.length, routineStats.activeDays);
            const goalAchievementRate = this.calculateGoalAchievementRate(goalStatus);
            
            if (totalActiveDays >= 6 && goalAchievementRate >= 80) {
                evaluation = '🌟 素晴らしい週でした！目標もバッチリです！';
            } else if (totalActiveDays >= 4 && goalAchievementRate >= 60) {
                evaluation = '👍 良いペースです！目標達成に向けて順調ですね！';
            } else if (totalActiveDays >= 2 || goalAchievementRate >= 40) {
                evaluation = '📝 記録を続けましょう！目標を意識して頑張りましょう！';
            } else {
                evaluation = '🚀 今週から再スタートしましょう！新しい目標を立ててみませんか？';
            }

            embed.addFields({ name: '🎯 総合評価', value: evaluation, inline: false });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('set_weekly_goals')
                        .setLabel('今週の目標設定')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎯'),
                    new ButtonBuilder()
                        .setCustomId('view_weekly_stats')
                        .setLabel('詳細統計')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📊')
                );

            await channel.send({ 
                content: `<@${userId}>`,
                embeds: [embed], 
                components: [row] 
            });

        } catch (error) {
            console.error('パーソナライズ週次レポートエラー:', error);
        }
    }

    async getWeeklyGoals(userId, weekStartDate) {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const range = 'goals_data!A:E';
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            const weeklyGoals = [];
            
            // ヘッダー行をスキップして週次目標をフィルタリング
            rows.slice(1).forEach(row => {
                const goalId = row[0];
                const goalUserId = row[1];
                const goalType = row[2];
                const goalContent = row[3];
                const createdAt = row[4];
                
                // 該当ユーザーの週次目標で、今週のものを取得
                if (goalUserId === userId && goalType === 'weekly' && goalContent) {
                    // 目標内容から週の期間を抽出して一致するかチェック
                    const weekPattern = new RegExp(`\\[${weekStartDate.replace(/-/g, '-')}[〜～]`);
                    if (weekPattern.test(goalContent)) {
                        weeklyGoals.push({
                            id: goalId,
                            content: goalContent,
                            createdAt: createdAt
                        });
                    }
                }
            });
            
            console.log(`📋 週次目標取得: ${weeklyGoals.length}件 (${userId}, ${weekStartDate})`);
            return weeklyGoals;
            
        } catch (error) {
            console.error('週次目標取得エラー:', error);
            return [];
        }
    }

    // 🎯 目標達成状況評価メソッド（クラス内）
    evaluateWeeklyGoalAchievement(goals, activityData) {
        const goalStatus = {};
        
        goals.forEach(goal => {
            const content = goal.content.toLowerCase();
            let status = '未評価';
            
            // 簡単なキーワードマッチングで達成状況を判定
            if (content.includes('日記') || content.includes('diary')) {
                if (content.includes('毎日') && activityData.diaryEntries.length >= 7) {
                    status = '達成';
                } else if (activityData.diaryEntries.length >= 5) {
                    status = '概ね達成';
                } else if (activityData.diaryEntries.length >= 3) {
                    status = '部分達成';
                } else {
                    status = '未達成';
                }
            } else if (content.includes('体重') || content.includes('weight')) {
                if (content.includes('毎日') && activityData.weightEntries.length >= 7) {
                    status = '達成';
                } else if (activityData.weightEntries.length >= 5) {
                    status = '概ね達成';
                } else if (activityData.weightEntries.length >= 3) {
                    status = '部分達成';
                } else {
                    status = '未達成';
                }
            } else if (content.includes('ルーティン') || content.includes('routine')) {
                if (activityData.routineExecutions.length >= 10) {
                    status = '達成';
                } else if (activityData.routineExecutions.length >= 7) {
                    status = '概ね達成';
                } else if (activityData.routineExecutions.length >= 3) {
                    status = '部分達成';
                } else {
                    status = '未達成';
                }
            } else {
                // その他の目標は記録活動全体で判定
                const totalActivity = activityData.weightEntries.length + 
                                    activityData.diaryEntries.length + 
                                    Math.min(activityData.routineExecutions.length, 7);
                if (totalActivity >= 15) {
                    status = '達成';
                } else if (totalActivity >= 10) {
                    status = '概ね達成';
                } else if (totalActivity >= 5) {
                    status = '部分達成';
                } else {
                    status = '未達成';
                }
            }
            
            goalStatus[goal.id] = status;
        });
        
        return goalStatus;
    }

    // 🎯 目標達成状況の絵文字取得メソッド（クラス内）
    getGoalStatusEmoji(status) {
        switch (status) {
            case '達成': return '🎉';
            case '概ね達成': return '✅';
            case '部分達成': return '🔸';
            case '未達成': return '❌';
            default: return '❓';
        }
    }

    // 🎯 目標達成率計算メソッド（クラス内）
    calculateGoalAchievementRate(goalStatus) {
        const statuses = Object.values(goalStatus);
        if (statuses.length === 0) return 0;
        
        const achievementPoints = statuses.reduce((total, status) => {
            switch (status) {
                case '達成': return total + 100;
                case '概ね達成': return total + 80;
                case '部分達成': return total + 50;
                case '未達成': return total + 0;
                default: return total + 0;
            }
        }, 0);
        
        return Math.round(achievementPoints / statuses.length);
    }
// ルーティン統計計算関数を追加
calculateRoutineStats(routineExecutions) {
    if (!routineExecutions || routineExecutions.length === 0) {
        return {
            totalExecutions: 0,
            completedExecutions: 0,
            completionRate: 0,
            activeDays: 0,
            routineDetails: []
        };
    }

    // 実行データを分析
    const routineMap = new Map();
    const executionDates = new Set();
    let completedCount = 0;

    routineExecutions.forEach(execution => {
        const routineId = execution.routineId || execution.routine_id;
        const routineName = execution.routineName || execution.routine_name || `ルーティン${routineId}`;
        const status = execution.status;
        const date = execution.executionDate || execution.execution_date;

        // 日付を記録
        if (date) {
            executionDates.add(date);
        }

        // 完了カウント
        if (status === 'completed') {
            completedCount++;
        }

        // ルーティン別統計
        if (!routineMap.has(routineId)) {
            routineMap.set(routineId, {
                name: routineName,
                executions: 0,
                completed: 0
            });
        }

        const routineData = routineMap.get(routineId);
        routineData.executions++;
        if (status === 'completed') {
            routineData.completed++;
        }
    });

    // 完了率計算
    const completionRate = routineExecutions.length > 0 ? 
        Math.round((completedCount / routineExecutions.length) * 100) : 0;

    // ルーティン詳細配列作成
    const routineDetails = Array.from(routineMap.values())
        .sort((a, b) => b.executions - a.executions) // 実行回数で降順ソート
        .slice(0, 5); // 上位5件まで表示

    return {
        totalExecutions: routineExecutions.length,
        completedExecutions: completedCount,
        completionRate: completionRate,
        activeDays: executionDates.size,
        routineDetails: routineDetails
    };
}

    // ===== ヘルパーメソッド（クラス内に移動） =====

    // 最近の体重記録ユーザーを取得（修正版）
    async getRecentWeightUsers(startDate, days) {
        try {
            const endDate = moment(startDate).add(days - 1, 'days').format('YYYY-MM-DD');
            
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const sheetName = config.google_sheets.weight_sheet_name || '体重データ';
            const range = `${sheetName}!A:E`;
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            const recentUsers = [];
            const userSet = new Set();
            
            // ヘッダー行をスキップして期間内に記録したユーザーを抽出
            rows.slice(1).forEach(row => { // slice(1)でヘッダー行をスキップ
                const entryDate = row[0];
                const userId = row[1];
                
                if (userId && entryDate && 
                    entryDate !== '日付' && // ヘッダー行を除外
                    moment(entryDate, 'YYYY-MM-DD', true).isValid() && // 有効な日付のみ
                    moment(entryDate).isBetween(startDate, endDate, 'day', '[]')) {
                    if (!userSet.has(userId)) {
                        userSet.add(userId);
                        recentUsers.push({
                            userId,
                            lastRecordDate: entryDate
                        });
                    }
                }
            });
            
            console.log(`🔍 最近の体重記録ユーザー: ${recentUsers.length}人`);
            return recentUsers;
            
        } catch (error) {
            console.error('最近の体重ユーザー取得エラー:', error);
            return [];
        }
    }

    // アクティブな日記ユーザーを取得（修正版）
    async getActiveDiaryUsers(today) {
        try {
            // 過去7日以内に日記を書いたことがあるユーザーを取得
            const startDate = moment(today).subtract(7, 'days').format('YYYY-MM-DD');
            
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const sheetName = config.google_sheets.diary_sheet_name || '日記データ';
            const range = `${sheetName}!A:E`;
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            const activeUsers = new Set();
            const todayWriters = new Set();
            
            // ヘッダー行をスキップ
            rows.slice(1).forEach(row => {
                const entryDate = row[0];
                const userId = row[1];
                
                if (userId && entryDate && 
                    entryDate !== '日付' && // ヘッダー行を除外
                    moment(entryDate, 'YYYY-MM-DD', true).isValid()) { // 有効な日付のみ
                    // 今日既に日記を書いているかチェック
                    if (entryDate === today) {
                        todayWriters.add(userId);
                    }
                    
                    // 過去7日以内に活動があるかチェック
                    if (moment(entryDate).isBetween(startDate, today, 'day', '[]')) {
                        activeUsers.add(userId);
                    }
                }
            });
            
            // 今日まだ書いていないアクティブユーザーを返す
            const result = Array.from(activeUsers).filter(userId => !todayWriters.has(userId));
            
            console.log(`📝 アクティブ日記ユーザー: ${result.length}人 (今日未記録)`);
            return result;
            
        } catch (error) {
            console.error('アクティブ日記ユーザー取得エラー:', error);
            return [];
        }
    }

    // アクティブな習慣ユーザーを取得（修正版）
    async getActiveHabitUsers() {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const sheetName = config.google_sheets.habits_sheet_name || '習慣データ';
            const range = `${sheetName}!A:G`;
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const sheets = google.sheets({ version: 'v4', auth });
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            const activeUsers = new Set();
            
            // ヘッダー行をスキップしてアクティブな習慣を持つユーザーを抽出
            rows.slice(1).forEach(row => {
                const userId = row[1];
                const status = row[6];
                
                if (userId && status === 'active') {
                    activeUsers.add(userId);
                }
            });
            
            const result = Array.from(activeUsers);
            console.log(`🏃‍♂️ アクティブ習慣ユーザー: ${result.length}人`);
            return result;
            
        } catch (error) {
            console.error('アクティブ習慣ユーザー取得エラー:', error);
            return [];
        }
    }

    // 今日の習慣ログを取得（通知用）
    async getHabitLogsForDate(userId, date) {
        try {
            return await sheetsUtils.getHabitLogsInRange(userId, date, date);
        } catch (error) {
            console.error('今日の習慣ログ取得エラー:', error);
            return [];
        }
    }

    // 通知システムの停止
    stop() {
        console.log('🔔 通知システムを停止中...');
        
        this.scheduledJobs.forEach((job, name) => {
            job.destroy();
            console.log(`⏹️ ${name} 通知を停止しました`);
        });
        
        this.scheduledJobs.clear();
        this.isInitialized = false;
        
        console.log('✅ 通知システムが停止されました');
    }

    // 手動通知テスト用
    async testNotification(type) {
        switch (type) {
            case 'weight':
                await this.sendWeightReminder();
                break;
            case 'diary':
                await this.sendDiaryReminder();
                break;
            case 'habit':
                await this.sendHabitSummary();
                break;
            case 'weekly':
                await this.sendWeeklyReport();
                break;
            case 'whoami':
                await this.sendWhoAmIReminder();
                break;
            default:
                console.log('Unknown notification type:', type);
        }
    }
}

module.exports = NotificationManager;
