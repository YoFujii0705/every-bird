// commands/goals.js - Part 1（基本設定とデータ取得）

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const calculations = require('../utils/calculations');

// データキャッシュ機能
const dataCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5分

function getCacheKey(userId, type, params = '') {
    return `${userId}_${type}_${params}`;
}

function setCache(key, data) {
    dataCache.set(key, {
        data,
        timestamp: Date.now()
    });
}

function getCache(key) {
    const cached = dataCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }
    dataCache.delete(key);
    return null;
}

// バッチデータ取得関数（API呼び出し削減）
async function getAllUserData(userId) {
    const cacheKey = getCacheKey(userId, 'all_data');
    const cached = getCache(cacheKey);
    if (cached) {
        console.log('📋 キャッシュからデータを取得:', userId.substring(0, 4) + '...');
        return cached;
    }
    
    try {
        console.log('🔄 Google Sheetsからデータを取得中...', userId.substring(0, 4) + '...');
        
        const today = moment().format('YYYY-MM-DD');
        const lastWeek = moment().subtract(7, 'days').format('YYYY-MM-DD');
        const lastMonth = moment().subtract(30, 'days').format('YYYY-MM-DD');
        const last90Days = moment().subtract(90, 'days').format('YYYY-MM-DD');
        
        // 並行取得で効率化
        const [
            weightGoal,
            diaryGoals,
            userProfile,
            habits,
            // 範囲データを一度に取得
            recentWeightEntries,
            recentDiaryEntries,
            recentHabitLogs,
            // 今日のデータ
            todayWeightEntry,
            todayDiaryEntry,
            todayHabitLogs
        ] = await Promise.all([
            sheetsUtils.getWeightGoal(userId).catch(() => null),
            sheetsUtils.getDiaryGoals(userId).catch(() => []),
            sheetsUtils.getUserProfile(userId).catch(() => null),
            sheetsUtils.getUserHabits(userId).catch(() => []),
            // 範囲データ
            sheetsUtils.getWeightEntriesInRange(userId, last90Days, today).catch(() => []),
            sheetsUtils.getDiaryEntriesInRange(userId, last90Days, today).catch(() => []),
            sheetsUtils.getHabitLogsInRange(userId, last90Days, today).catch(() => []),
            // 今日のデータ
            sheetsUtils.getWeightEntry(userId, today).catch(() => null),
            sheetsUtils.getDiaryEntry(userId, today).catch(() => null),
            sheetsUtils.getHabitLogsInRange(userId, today, today).catch(() => [])
        ]);
        
        const allData = {
            weightGoal,
            diaryGoals,
            userProfile,
            habits,
            // 範囲別にデータを分割
            weightEntries: {
                all: recentWeightEntries,
                today: todayWeightEntry,
                week: recentWeightEntries.filter(e => moment(e.date).isAfter(lastWeek)),
                month: recentWeightEntries.filter(e => moment(e.date).isAfter(lastMonth))
            },
            diaryEntries: {
                all: recentDiaryEntries,
                today: todayDiaryEntry,
                week: recentDiaryEntries.filter(e => moment(e.date).isAfter(lastWeek)),
                month: recentDiaryEntries.filter(e => moment(e.date).isAfter(lastMonth))
            },
            habitLogs: {
                all: recentHabitLogs,
                today: todayHabitLogs,
                week: recentHabitLogs.filter(e => moment(e.date).isAfter(lastWeek)),
                month: recentHabitLogs.filter(e => moment(e.date).isAfter(lastMonth))
            }
        };
        
        setCache(cacheKey, allData);
        console.log('✅ データ取得完了:', userId.substring(0, 4) + '...');
        return allData;
        
    } catch (error) {
        console.error('バッチデータ取得エラー:', error);
        return {
            weightGoal: null,
            diaryGoals: [],
            userProfile: null,
            habits: [],
            weightEntries: { all: [], today: null, week: [], month: [] },
            diaryEntries: { all: [], today: null, week: [], month: [] },
            habitLogs: { all: [], today: [], week: [], month: [] }
        };
    }
}

function createCommand() {
    return new SlashCommandBuilder()
        .setName('goals')
        .setDescription('統合目標管理システム')
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('全目標の統合ダッシュボード表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('achievements')
                .setDescription('達成バッジ・実績表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('calendar')
                .setDescription('目標達成カレンダー表示')
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('年（省略時は今年）')
                        .setRequired(false)
                        .setMinValue(2020)
                        .setMaxValue(new Date().getFullYear() + 10)
                )
                .addIntegerOption(option =>
                    option.setName('month')
                        .setDescription('月（省略時は今月）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('summary')
                .setDescription('目標達成サマリー')
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('集計期間')
                        .setRequired(false)
                        .addChoices(
                            { name: '今週', value: 'week' },
                            { name: '今月', value: 'month' },
                            { name: '過去30日', value: '30days' },
                            { name: '過去90日', value: '90days' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('新しい目標を設定')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('目標カテゴリ')
                        .setRequired(true)
                        .addChoices(
                            { name: '体重管理', value: 'weight' },
                            { name: '日記習慣', value: 'diary' },
                            { name: '習慣管理', value: 'habit' },
                            { name: '総合目標', value: 'overall' }
                        )
                )
        );
}

async function handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'dashboard':
                await handleGoalsDashboard(interaction);
                break;
            case 'achievements':
                await handleGoalsAchievements(interaction);
                break;
            case 'calendar':
                await handleGoalsCalendar(interaction);
                break;
            case 'summary':
                await handleGoalsSummary(interaction);
                break;
            case 'set':
                await handleGoalsSet(interaction);
                break;
            default:
                await interaction.reply({ content: 'この機能は開発中です。', ephemeral: true });
        }
    } catch (error) {
        console.error('Goals command error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ コマンド処理中にエラーが発生しました。', 
                ephemeral: true 
            });
        }
    }
}

// commands/goals.js - Part 2（ダッシュボード機能）

// 🌟 統合ダッシュボード（効率化版）
async function handleGoalsDashboard(interaction) {
    const userId = interaction.user.id;
    
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }
        
        // バッチでデータを取得
        const allData = await getAllUserData(userId);
        
        // ダッシュボード埋め込みを作成
        const dashboardEmbed = await createOptimizedDashboardEmbed(userId, allData);
        
        // アクションボタンを作成
        const actionRow = createDashboardButtons();
        
        const response = { embeds: [dashboardEmbed], components: [actionRow] };
        
        if (interaction.deferred) {
            await interaction.editReply(response);
        } else {
            await interaction.reply(response);
        }
        
    } catch (error) {
        console.error('ダッシュボード表示エラー:', error);
        const errorMessage = '❌ ダッシュボードの表示中にエラーが発生しました。しばらく後にお試しください。';
        
        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else if (!interaction.replied) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

// 最適化されたダッシュボード埋め込み作成
async function createOptimizedDashboardEmbed(userId, allData) {
    const userName = allData.userProfile?.name || 'あなた';
    const today = moment().format('YYYY-MM-DD');
    
    const embed = new EmbedBuilder()
        .setTitle(`🎯 ${userName}の統合目標ダッシュボード`)
        .setDescription(`${moment().format('YYYY年MM月DD日')} の目標達成状況`)
        .setColor(0x4A90E2)
        .setTimestamp();
    
    // 🏆 今日の達成サマリー（キャッシュされたデータを使用）
    const todaySummary = calculateTodaySummaryFromCache(allData);
    embed.addFields({
        name: '🏆 今日の総合スコア',
        value: `${todaySummary.summary}\n\n**総合スコア**: ${todaySummary.totalScore}/100 ${getScoreEmoji(todaySummary.totalScore)}\n${generateProgressBar(todaySummary.totalScore)}`,
        inline: false
    });
    
    // ⚖️ 体重目標（キャッシュされたデータを使用）
    const weightStatus = getOptimizedWeightGoalStatus(allData);
    embed.addFields({
        name: '⚖️ 体重目標',
        value: weightStatus,
        inline: true
    });
    
    // 📝 日記目標（キャッシュされたデータを使用）
    const diaryStatus = getOptimizedDiaryGoalStatus(allData);
    embed.addFields({
        name: '📝 日記目標',
        value: diaryStatus,
        inline: true
    });
    
    // 🏃‍♂️ 習慣目標（キャッシュされたデータを使用）
    const habitStatus = getOptimizedHabitGoalStatus(allData);
    embed.addFields({
        name: '🏃‍♂️ 習慣目標',
        value: habitStatus,
        inline: true
    });
    
    // 📈 週間トレンド（キャッシュされたデータを使用）
    const weeklyTrend = calculateOptimizedWeeklyTrend(allData);
    embed.addFields({
        name: '📈 今週のトレンド',
        value: weeklyTrend,
        inline: false
    });
    
    return embed;
}

// キャッシュデータから今日のサマリーを計算
function calculateTodaySummaryFromCache(allData) {
    try {
        let score = 0;
        let details = [];
        
        // 体重記録 (25点)
        if (allData.weightEntries.today) {
            score += 25;
            details.push('✅ 体重記録完了 (+25pt)');
        } else {
            details.push('⭕ 体重記録未完了 (0pt)');
        }
        
        // 日記記録 (25点)
        if (allData.diaryEntries.today) {
            score += 25;
            details.push('✅ 日記記録完了 (+25pt)');
            
            // ボーナス: ポジティブな気分
            if (['😊', '🙂'].includes(allData.diaryEntries.today.mood)) {
                score += 5;
                details.push('🌟 ポジティブな気分 (+5pt)');
            }
        } else {
            details.push('⭕ 日記記録未完了 (0pt)');
        }
        
        // 習慣実行 (50点)
        const totalHabits = allData.habits.length;
        const todayHabitCount = allData.habitLogs.today.length;
        
        if (totalHabits > 0) {
            const habitScore = Math.round((todayHabitCount / totalHabits) * 50);
            score += habitScore;
            details.push(`🏃‍♂️ 習慣実行 ${todayHabitCount}/${totalHabits} (+${habitScore}pt)`);
            
            // ボーナス: 全習慣完了
            if (todayHabitCount === totalHabits && totalHabits > 0) {
                score += 10;
                details.push('🎉 全習慣完了ボーナス (+10pt)');
            }
        } else {
            details.push('⚠️ 習慣が登録されていません');
        }
        
        return {
            summary: details.join('\n'),
            totalScore: Math.min(100, score)
        };
    } catch (error) {
        console.error('今日のサマリー計算エラー:', error);
        return {
            summary: '📊 データ処理中...',
            totalScore: 0
        };
    }
}

// 最適化された体重目標ステータス
function getOptimizedWeightGoalStatus(allData) {
    try {
        if (!allData.weightGoal) {
            const weekEntries = allData.weightEntries.week.length;
            return `目標未設定\n今週の記録: ${weekEntries}/7日\n\`/weight goal\` で設定可能`;
        }
        
        const latestWeight = allData.weightEntries.all[allData.weightEntries.all.length - 1];
        
        if (!latestWeight) {
            return '体重データなし\n`/weight record` で記録開始';
        }
        
        const currentWeight = parseFloat(latestWeight.weight);
        const targetWeight = parseFloat(allData.weightGoal.target);
        const remaining = targetWeight - currentWeight;
        
        let status = `🎯 目標: ${targetWeight}kg\n📊 現在: ${currentWeight}kg\n`;
        
        // 目標達成判定
        if (Math.abs(remaining) <= 0.5) {
            status += `🎉 **目標達成！** (±0.5kg以内)\n`;
        } else {
            const direction = remaining > 0 ? '増量' : '減量';
            status += `🔥 残り: ${Math.abs(remaining).toFixed(1)}kg ${direction}\n`;
            
            // 進捗計算
            const progress = Math.max(0, Math.min(100, (1 - Math.abs(remaining) / 10) * 100));
            status += `${generateProgressBar(Math.abs(progress))}`;
        }
        
        // 今週の記録状況
        const weekEntries = allData.weightEntries.week.length;
        status += `\n📅 今週の記録: ${weekEntries}/7日`;
        
        return status;
    } catch (error) {
        console.error('体重目標ステータスエラー:', error);
        return '❌ データ取得エラー';
    }
}

// 最適化された日記目標ステータス
function getOptimizedDiaryGoalStatus(allData) {
    try {
        if (!allData.diaryGoals || allData.diaryGoals.length === 0) {
            const weekEntries = allData.diaryEntries.week.length;
            return `目標未設定\n今週の記録: ${weekEntries}/7日\n\`/diary goal set\` で設定`;
        }
        
        // 最初の目標のみ表示（シンプル化）
        const goal = allData.diaryGoals[0];
        try {
            const goalData = JSON.parse(goal.content);
            const weekEntries = allData.diaryEntries.week.length;
            const monthEntries = allData.diaryEntries.month.length;
            
            let current = 0;
            let target = goalData.target || 7;
            let period = goalData.period || 'weekly';
            
            if (period === 'weekly') {
                current = weekEntries;
            } else {
                current = monthEntries;
                target = goalData.target || 20;
            }
            
            const progressPercent = Math.min(100, Math.round((current / target) * 100));
            const emoji = getGoalTypeEmoji(goalData.type);
            const goalName = getGoalTypeName(goalData.type);
            
            return `${emoji} ${goalName}\n${current}/${target} (${progressPercent}%)\n${generateProgressBar(progressPercent)}`;
        } catch (parseError) {
            console.error('日記目標解析エラー:', parseError);
            return '目標データエラー';
        }
    } catch (error) {
        console.error('日記目標ステータスエラー:', error);
        return '❌ データ取得エラー';
    }
}

// 最適化された習慣目標ステータス
function getOptimizedHabitGoalStatus(allData) {
    try {
        const totalHabits = allData.habits.length;
        
        if (totalHabits === 0) {
            return '習慣未登録\n`/habit add` で追加可能';
        }
        
        const completedToday = allData.habitLogs.today.length;
        const todayRate = Math.round((completedToday / totalHabits) * 100);
        
        // 今週の統計（7日間での期待値計算）
        const weekLogs = allData.habitLogs.week.length;
        const weekDays = 7; // 簡易化
        const weekExpected = totalHabits * weekDays;
        const weekRate = Math.round((weekLogs / weekExpected) * 100);
        
        let status = `📊 今日: ${completedToday}/${totalHabits} (${todayRate}%)\n`;
        status += `📈 今週: ${weekRate}%\n`;
        status += `${generateProgressBar(todayRate)}`;
        
        // 習慣別詳細（上位3つ、シンプル化）
        if (allData.habits.length > 0) {
            const topHabits = allData.habits.slice(0, 2); // 最大2つに制限
            const habitDetails = topHabits.map(habit => {
                const isCompleted = allData.habitLogs.today.some(log => log.habitId === habit.id);
                const status = isCompleted ? '✅' : '⭕';
                const difficulty = getDifficultyEmoji(habit.difficulty);
                return `${status} ${difficulty} ${habit.name}`;
            });
            
            if (habitDetails.length > 0) {
                status += '\n\n' + habitDetails.join('\n');
            }
        }
        
        return status;
    } catch (error) {
        console.error('習慣目標ステータスエラー:', error);
        return '❌ データ取得エラー';
    }
}

// 最適化された週間トレンド
function calculateOptimizedWeeklyTrend(allData) {
    try {
        const thisWeekWeight = allData.weightEntries.week.length;
        const thisWeekDiary = allData.diaryEntries.week.length;
        const thisWeekHabit = allData.habitLogs.week.length;
        
        const totalHabits = allData.habits.length;
        const habitScore = totalHabits > 0 ? Math.round((thisWeekHabit / (totalHabits * 7)) * 100) : 0;
        
        let trendText = '';
        
        // 記録状況の評価
        if (thisWeekWeight >= 5 && thisWeekDiary >= 5 && habitScore >= 60) {
            trendText = '📈 **素晴らしい週です！** 全カテゴリで高い記録率を保っています';
        } else if (thisWeekWeight >= 3 || thisWeekDiary >= 3 || habitScore >= 40) {
            trendText = '📊 **安定した成長** 継続的な記録ができています';
        } else {
            trendText = '💪 **改善の余地あり** 少しずつでも記録を増やしていきましょう';
        }
        
        // 具体的な数値
        trendText += `\n📊 今週: 体重${thisWeekWeight}回, 日記${thisWeekDiary}回, 習慣${habitScore}%`;
        
        return trendText;
    } catch (error) {
        console.error('週間トレンド計算エラー:', error);
        return '📊 今週も継続的な記録を心がけましょう';
    }
}

// commands/goals.js - Part 3（実績システム）

// 🏆 達成バッジ・実績表示（大幅効率化版）
async function handleGoalsAchievements(interaction) {
    const userId = interaction.user.id;
    
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }
        
        // キャッシュされたデータを使用
        const allData = await getAllUserData(userId);
        const achievements = calculateAchievementsFromCache(allData);
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 達成バッジ・実績')
            .setDescription('あなたの目標達成履歴と獲得バッジ')
            .setColor(0xFFD700)
            .setTimestamp();
        
        // 総合ランク（最初に表示）
        const totalBadges = achievements.weight.length + achievements.diary.length + achievements.habit.length + achievements.special.length;
        const rank = getRankFromBadges(totalBadges);
        
        embed.addFields({
            name: '👑 総合ランク',
            value: `${rank.emoji} **${rank.name}**\n獲得バッジ数: ${totalBadges}個`,
            inline: false
        });
        
        // カテゴリ別バッジ表示（簡略化）
        if (achievements.weight.length > 0) {
            embed.addFields({
                name: '⚖️ 体重管理バッジ',
                value: achievements.weight.slice(0, 3).join(' '), // 最大3つ
                inline: true
            });
        }
        
        if (achievements.diary.length > 0) {
            embed.addFields({
                name: '📝 日記バッジ',
                value: achievements.diary.slice(0, 3).join(' '), // 最大3つ
                inline: true
            });
        }
        
        if (achievements.habit.length > 0) {
            embed.addFields({
                name: '🏃‍♂️ 習慣バッジ',
                value: achievements.habit.slice(0, 3).join(' '), // 最大3つ
                inline: true
            });
        }
        
        if (achievements.special.length > 0) {
            embed.addFields({
                name: '🌟 特別バッジ',
                value: achievements.special.join(' '),
                inline: false
            });
        }
        
        // 簡易統計
        const weekData = allData.weightEntries.week.length + allData.diaryEntries.week.length + allData.habitLogs.week.length;
        embed.addFields({
            name: '📊 今週の活動',
            value: `📈 総記録数: ${weekData}回\n🎯 継続日数: ${Math.min(7, weekData)}日`,
            inline: false
        });
        
        // 実績表示用ボタン
        const achievementButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('goals_refresh')
                    .setLabel('更新')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('goals_dashboard')
                    .setLabel('ダッシュボード')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎯')
            );
        
        const response = { embeds: [embed], components: [achievementButtons] };
        
        if (interaction.deferred) {
            await interaction.editReply(response);
        } else {
            await interaction.reply(response);
        }
        
    } catch (error) {
        console.error('実績表示エラー:', error);
        const errorMessage = '❌ 実績の表示中にエラーが発生しました。しばらく後にお試しください。';
        
        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else if (!interaction.replied) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

// キャッシュデータから実績を計算（大幅簡略化）
function calculateAchievementsFromCache(allData) {
    const achievements = {
        weight: [],
        diary: [],
        habit: [],
        special: []
    };
    
    try {
        // 体重バッジ（簡易版）
        const totalWeightEntries = allData.weightEntries.all.length;
        if (totalWeightEntries >= 1) achievements.weight.push('🥉');
        if (totalWeightEntries >= 7) achievements.weight.push('🥈');
        if (totalWeightEntries >= 30) achievements.weight.push('🥇');
        if (totalWeightEntries >= 100) achievements.weight.push('💎');
        
        // 連続記録チェック（簡易版）
        const recentWeightStreak = calculateSimpleStreak(allData.weightEntries.all);
        if (recentWeightStreak >= 7) achievements.weight.push('🔥');
        
        // 日記バッジ（簡易版）
        const totalDiaryEntries = allData.diaryEntries.all.length;
        if (totalDiaryEntries >= 1) achievements.diary.push('🥉');
        if (totalDiaryEntries >= 7) achievements.diary.push('🥈');
        if (totalDiaryEntries >= 30) achievements.diary.push('🥇');
        if (totalDiaryEntries >= 100) achievements.diary.push('💎');
        
        // ポジティブ気分バッジ（簡易版）
        const positiveDiaries = allData.diaryEntries.all.filter(e => ['😊', '🙂'].includes(e.mood));
        const positiveRatio = totalDiaryEntries > 0 ? (positiveDiaries.length / totalDiaryEntries) : 0;
        
        if (positiveRatio >= 0.8 && totalDiaryEntries >= 10) {
            achievements.diary.push('😊');
        }
        
        // 習慣バッジ（簡易版）
        const totalHabitLogs = allData.habitLogs.all.length;
        if (totalHabitLogs >= 1) achievements.habit.push('🥉');
        if (totalHabitLogs >= 10) achievements.habit.push('🥈');
        if (totalHabitLogs >= 50) achievements.habit.push('🥇');
        if (totalHabitLogs >= 200) achievements.habit.push('💎');
        
        // 今日の完璧スコア
        const todayScore = calculateTodaySummaryFromCache(allData).totalScore;
        if (todayScore === 100) {
            achievements.special.push('💯');
        }
        
        // 総合バッジ
        const totalBadges = achievements.weight.length + achievements.diary.length + achievements.habit.length;
        if (totalBadges >= 10) achievements.special.push('👑');
        
    } catch (error) {
        console.error('実績計算エラー:', error);
    }
    
    return achievements;
}

// 簡易ストリーク計算
function calculateSimpleStreak(entries) {
    if (!entries || entries.length === 0) return 0;
    
    // 最新のエントリーから連続日数を数える
    const sortedEntries = entries.sort((a, b) => moment(b.date).diff(moment(a.date)));
    let streak = 0;
    let currentDate = moment();
    
    for (let i = 0; i < Math.min(30, sortedEntries.length); i++) {
        const entryDate = moment(sortedEntries[i].date);
        const expectedDate = currentDate.clone().subtract(i, 'days');
        
        if (entryDate.isSame(expectedDate, 'day')) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// commands/goals.js - Part 4（カレンダーとサマリー）
// 📅 目標達成カレンダー表示（デバッグ強化版）
async function handleGoalsCalendar(interaction) {
    console.log('🔍 handleGoalsCalendar開始');
    
    const year = interaction.options?.getInteger('year') || moment().year();
    const month = interaction.options?.getInteger('month') || (moment().month() + 1);
    const userId = interaction.user.id;
    
    console.log(`📅 カレンダー表示: ${year}年${month}月, ユーザー: ${userId.substring(0, 4)}...`);
    
    try {
        if (!interaction.deferred && !interaction.replied) {
            console.log('🔄 handleGoalsCalendar内でdeferReply実行');
            await interaction.deferReply();
        }
        
        console.log('📊 データ取得開始...');
        // キャッシュされたデータを使用してカレンダー生成
        const allData = await getAllUserData(userId);
        console.log('📊 データ取得完了, カレンダー生成開始...');
        
        const calendarData = generateOptimizedGoalsCalendar(allData, year, month);
        console.log('📅 カレンダー生成完了');
        
        const embed = new EmbedBuilder()
            .setTitle(`📅 ${year}年${month}月 目標達成カレンダー`)
            .setDescription(calendarData.description)
            .addFields(
                { name: '📊 月間統計', value: calendarData.monthlyStats, inline: false },
                { name: '🗓️ カレンダー', value: calendarData.calendar, inline: false }
            )
            .setColor(getCalendarColor(calendarData.achievementRate))
            .setTimestamp();
        
        // 凡例と詳細情報
        embed.addFields(
            {
                name: '📖 凡例',
                value: '✅ 活動あり\n📝 日記のみ\n⭕ 記録なし',
                inline: true
            },
            {
                name: '🏆 月間ハイライト',
                value: calendarData.highlights,
                inline: true
            }
        );
        
        // ナビゲーションボタン
        const navRow = createCalendarNavigation(year, month);
        
        const response = { embeds: [embed], components: [navRow] };
        
        console.log('💬 レスポンス送信中...');
        if (interaction.deferred) {
            await interaction.editReply(response);
            console.log('✅ editReply完了');
        } else {
            await interaction.reply(response);
            console.log('✅ reply完了');
        }
        
    } catch (error) {
        console.error('❌ カレンダー表示エラー:', error);
        console.error('エラースタックトレース:', error.stack);
        
        const errorMessage = '❌ カレンダーの表示中にエラーが発生しました。しばらく後にお試しください。';
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else if (!interaction.replied) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('エラーレスポンス送信失敗:', replyError);
        }
    }
}

// また、generateOptimizedGoalsCalendar関数にもログを追加
function generateOptimizedGoalsCalendar(allData, year, month) {
    console.log(`🔍 カレンダーデータ生成開始: ${year}年${month}月`);
    
    try {
        const startDate = moment({ year, month: month - 1, day: 1 });
        const endDate = startDate.clone().endOf('month');
        const daysInMonth = endDate.date();
        
        console.log(`📊 期間: ${startDate.format('YYYY-MM-DD')} 〜 ${endDate.format('YYYY-MM-DD')}`);
        
        // 該当月のデータをフィルタリング
        const monthStart = startDate.format('YYYY-MM-DD');
        const monthEnd = endDate.format('YYYY-MM-DD');
        
        const monthWeightEntries = allData.weightEntries.all.filter(e => 
            moment(e.date).isBetween(monthStart, monthEnd, 'day', '[]')
        );
        const monthDiaryEntries = allData.diaryEntries.all.filter(e => 
            moment(e.date).isBetween(monthStart, monthEnd, 'day', '[]')
        );
        const monthHabitLogs = allData.habitLogs.all.filter(e => 
            moment(e.date).isBetween(monthStart, monthEnd, 'day', '[]')
        );
        
        console.log(`📈 月間データ: 体重${monthWeightEntries.length}, 日記${monthDiaryEntries.length}, 習慣${monthHabitLogs.length}`);
        
        // 簡易カレンダー生成
        let calendar = '```\n月 火 水 木 金 土 日\n';
        
        // 月の最初の日の曜日を取得（月曜日=0基準）
        const firstDayWeekday = (startDate.day() + 6) % 7;
        
        // 最初の週の空白を追加
        for (let i = 0; i < firstDayWeekday; i++) {
            calendar += '   ';
        }
        
        // 各日付を処理
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = moment({ year, month: month - 1, day });
            const dateStr = currentDate.format('YYYY-MM-DD');
            
            // その日の活動をチェック
            const hasWeight = monthWeightEntries.some(e => e.date === dateStr);
            const hasDiary = monthDiaryEntries.some(e => e.date === dateStr);
            const hasHabit = monthHabitLogs.some(e => e.date === dateStr);
            
            let daySymbol;
            if (hasWeight && hasDiary && hasHabit) {
                daySymbol = '✅'; // 全活動
            } else if (hasWeight || hasDiary || hasHabit) {
                daySymbol = '📝'; // 一部活動
            } else {
                daySymbol = '⭕'; // 活動なし
            }
            
            calendar += daySymbol;
            
            // 週末（日曜日）で改行
            if ((firstDayWeekday + day - 1) % 7 === 6) {
                calendar += '\n';
            } else {
                calendar += ' ';
            }
        }
        
        calendar += '\n```';
        
        // 統計情報
        const totalDays = daysInMonth;
        const activeDays = new Set([
            ...monthWeightEntries.map(e => e.date),
            ...monthDiaryEntries.map(e => e.date),
            ...monthHabitLogs.map(e => e.date)
        ]).size;
        
        const achievementRate = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;
        
        // ハイライト
        const highlights = [];
        if (monthWeightEntries.length >= Math.floor(totalDays * 0.7)) {
            highlights.push(`⚖️ 体重記録優秀`);
        }
        if (monthDiaryEntries.length >= Math.floor(totalDays * 0.7)) {
            highlights.push(`📝 日記継続優秀`);
        }
        if (activeDays >= Math.floor(totalDays * 0.6)) {
            highlights.push(`🏃‍♂️ 習慣実行優秀`);
        }
        
        const result = {
            description: `${month}月の目標達成状況`,
            monthlyStats: `📊 活動日数: ${activeDays}/${totalDays}日\n📈 達成率: ${achievementRate}%`,
            calendar: calendar,
            achievementRate: achievementRate,
            highlights: highlights.length > 0 ? highlights.join('\n') : '今月も頑張りましょう！'
        };
        
        console.log('✅ カレンダーデータ生成完了');
        return result;
        
    } catch (error) {
        console.error('❌ カレンダー生成エラー:', error);
        return {
            description: `${month}月の目標達成状況`,
            monthlyStats: '📊 データ処理中にエラーが発生しました',
            calendar: '```\nカレンダーを生成できませんでした\n```',
            achievementRate: 0,
            highlights: 'データなし'
        };
    }
}

// 📊 目標達成サマリー（効率化版）
async function handleGoalsSummary(interaction) {
    const period = interaction.options.getString('period') || '30days';
    const userId = interaction.user.id;
    
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }
        
        const { startDate, endDate, periodName } = getPeriodDates(period);
        const allData = await getAllUserData(userId);
        const summaryData = calculateOptimizedGoalsSummary(allData, startDate, endDate);
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 目標達成サマリー（${periodName}）`)
            .setDescription(`${startDate} ～ ${endDate}\n\n**総合評価**: ${summaryData.overallGrade} ${getGradeEmoji(summaryData.overallGrade)}`)
            .setColor(getGradeColor(summaryData.overallGrade))
            .setTimestamp();
        
        // 総合達成率
        embed.addFields({
            name: '🎯 総合達成率',
            value: `${summaryData.overallRate}%\n${generateProgressBar(summaryData.overallRate)}`,
            inline: false
        });
        
        // カテゴリ別サマリー
        embed.addFields(
            { 
                name: '⚖️ 体重管理', 
                value: `📊 記録率: ${summaryData.weight.recordingRate}%\n📈 記録数: ${summaryData.weight.records}回`, 
                inline: true 
            },
            { 
                name: '📝 日記', 
                value: `📊 記録率: ${summaryData.diary.recordingRate}%\n📈 記録数: ${summaryData.diary.records}回`, 
                inline: true 
            },
            { 
                name: '🏃‍♂️ 習慣', 
                value: `📊 実行率: ${summaryData.habit.executionRate}%\n📈 実行数: ${summaryData.habit.logs}回`, 
                inline: true 
            }
        );
        
        // 改善提案（簡略化）
        embed.addFields({
            name: '💡 改善提案',
            value: summaryData.improvements,
            inline: false
        });
        
        const response = { embeds: [embed] };
        
        if (interaction.deferred) {
            await interaction.editReply(response);
        } else {
            await interaction.reply(response);
        }
        
    } catch (error) {
        console.error('サマリー表示エラー:', error);
        const errorMessage = '❌ サマリーの表示中にエラーが発生しました。';
        
        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else if (!interaction.replied) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

// 最適化されたサマリー計算
function calculateOptimizedGoalsSummary(allData, startDate, endDate) {
    try {
        const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
        
        // 期間内のデータをフィルタリング
        const periodWeightEntries = allData.weightEntries.all.filter(e => 
            moment(e.date).isBetween(startDate, endDate, 'day', '[]')
        );
        const periodDiaryEntries = allData.diaryEntries.all.filter(e => 
            moment(e.date).isBetween(startDate, endDate, 'day', '[]')
        );
        const periodHabitLogs = allData.habitLogs.all.filter(e => 
            moment(e.date).isBetween(startDate, endDate, 'day', '[]')
        );
        
        // 記録率計算
        const weightRecordingRate = Math.round((periodWeightEntries.length / totalDays) * 100);
        const diaryRecordingRate = Math.round((periodDiaryEntries.length / totalDays) * 100);
        
        // 習慣実行率（簡易計算）
        const totalHabits = allData.habits.length;
        const expectedHabitLogs = totalHabits * totalDays;
        const habitExecutionRate = expectedHabitLogs > 0 ? Math.round((periodHabitLogs.length / expectedHabitLogs) * 100) : 0;
        
        // 総合達成率
        const overallRate = Math.round((weightRecordingRate + diaryRecordingRate + habitExecutionRate) / 3);
        
        // グレード計算
        const overallGrade = calculateGrade(overallRate);
        
        // 改善提案（簡略化）
        const improvements = generateSimpleImprovementSuggestions({
            weightRecordingRate,
            diaryRecordingRate,
            habitExecutionRate
        });
        
        return {
            overallRate,
            overallGrade,
            weight: {
                recordingRate: weightRecordingRate,
                records: periodWeightEntries.length
            },
            diary: {
                recordingRate: diaryRecordingRate,
                records: periodDiaryEntries.length
            },
            habit: {
                executionRate: habitExecutionRate,
                logs: periodHabitLogs.length
            },
            improvements
        };
    } catch (error) {
        console.error('サマリー計算エラー:', error);
        return {
            overallRate: 0,
            overallGrade: 'D',
            weight: { recordingRate: 0, records: 0 },
            diary: { recordingRate: 0, records: 0 },
            habit: { executionRate: 0, logs: 0 },
            improvements: '再度お試しください。'
        };
    }
}

// 簡易改善提案生成
function generateSimpleImprovementSuggestions(rates) {
    const suggestions = [];
    
    if (rates.weightRecordingRate < 50) {
        suggestions.push('⚖️ 体重記録の習慣化を目指しましょう');
    }
    
    if (rates.diaryRecordingRate < 50) {
        suggestions.push('📝 日記を毎日の振り返りに取り入れましょう');
    }
    
    if (rates.habitExecutionRate < 50) {
        suggestions.push('🏃‍♂️ 習慣の数を見直して確実に実行しましょう');
    }
    
    // 優秀な場合の提案
    if (rates.weightRecordingRate >= 80 && rates.diaryRecordingRate >= 80 && rates.habitExecutionRate >= 80) {
        suggestions.push('🌟 素晴らしい継続力です！新しい目標に挑戦してみましょう');
    }
    
    return suggestions.length > 0 ? suggestions.slice(0, 2).join('\n') : '現在の取り組みを継続してください';
}

// 🎯 新しい目標設定（簡略化）
async function handleGoalsSet(interaction) {
    const category = interaction.options.getString('category');
    
    const embed = new EmbedBuilder()
        .setTitle('🎯 新しい目標を設定')
        .setDescription(`${getCategoryName(category)}の目標設定は各カテゴリのコマンドをご利用ください。`)
        .setColor(0x9B59B6)
        .addFields(
            { name: '⚖️ 体重目標', value: '`/weight goal` コマンドで設定', inline: true },
            { name: '📝 日記目標', value: '`/diary goal set` コマンドで設定', inline: true },
            { name: '🏃‍♂️ 習慣目標', value: '`/habit add` コマンドで習慣追加', inline: true }
        );
    
    await interaction.reply({ embeds: [embed] });
}

// commands/goals.js - Part 5（ヘルパー関数とエクスポート）

// ===== ヘルパー関数群（効率化版） =====

function createDashboardButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('goals_refresh')
                .setLabel('更新')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('goals_achievements')
                .setLabel('実績')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🏆'),
            new ButtonBuilder()
                .setCustomId('goals_calendar')
                .setLabel('カレンダー')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📅')
        );
}

function getScoreEmoji(score) {
    if (score >= 90) return '🏆';
    if (score >= 75) return '🥇';
    if (score >= 60) return '🥈';
    if (score >= 45) return '🥉';
    if (score >= 30) return '💪';
    return '🌱';
}

function generateProgressBar(percentage, length = 10) {
    const filled = Math.floor((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(percentage)}%`;
}

function getDifficultyEmoji(difficulty) {
    const emojis = {
        'easy': '🟢',
        'normal': '🟡',
        'hard': '🔴'
    };
    return emojis[difficulty] || '⚪';
}

function getRankFromBadges(badgeCount) {
    if (badgeCount >= 15) return { emoji: '👑', name: 'レジェンド' };
    if (badgeCount >= 12) return { emoji: '💎', name: 'ダイヤモンド' };
    if (badgeCount >= 9) return { emoji: '🏆', name: 'ゴールド' };
    if (badgeCount >= 6) return { emoji: '🥇', name: 'シルバー' };
    if (badgeCount >= 3) return { emoji: '🥈', name: 'ブロンズ' };
    return { emoji: '🌱', name: 'ビギナー' };
}

function getCalendarColor(achievementRate) {
    if (achievementRate >= 80) return 0x00FF00; // 緑
    if (achievementRate >= 60) return 0xFFD700; // 金
    if (achievementRate >= 40) return 0xFFA500; // オレンジ
    if (achievementRate >= 20) return 0xFF6B6B; // 赤
    return 0x95A5A6; // グレー
}

function createCalendarNavigation(year, month) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`goals_calendar_${prevYear}_${prevMonth}`)
                .setLabel('◀ 前月')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`goals_calendar_today`)
                .setLabel('今月')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`goals_calendar_${nextYear}_${nextMonth}`)
                .setLabel('次月 ▶')
                .setStyle(ButtonStyle.Secondary)
        );
}

function calculateGrade(overallRate) {
    if (overallRate >= 90) return 'S';
    if (overallRate >= 80) return 'A';
    if (overallRate >= 70) return 'B';
    if (overallRate >= 60) return 'C';
    if (overallRate >= 50) return 'D';
    return 'E';
}

function getGradeEmoji(grade) {
    const emojis = {
        'S': '🌟',
        'A': '🏆',
        'B': '🥇',
        'C': '🥈',
        'D': '🥉',
        'E': '💪'
    };
    return emojis[grade] || '📊';
}

function getGradeColor(grade) {
    const colors = {
        'S': 0xFFD700, // 金色
        'A': 0x00FF00, // 緑
        'B': 0x32CD32, // 黄緑
        'C': 0xFFD700, // 黄
        'D': 0xFFA500, // オレンジ
        'E': 0xFF4444  // 赤
    };
    return colors[grade] || 0x95A5A6;
}

// 期間日付取得
function getPeriodDates(period) {
    const today = moment();
    let startDate, endDate, periodName;
    
    switch (period) {
        case 'week':
            startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
            endDate = today.format('YYYY-MM-DD');
            periodName = '今週';
            break;
        case 'month':
            startDate = today.clone().startOf('month').format('YYYY-MM-DD');
            endDate = today.format('YYYY-MM-DD');
            periodName = '今月';
            break;
        case '90days':
            startDate = today.clone().subtract(89, 'days').format('YYYY-MM-DD');
            endDate = today.format('YYYY-MM-DD');
            periodName = '過去90日';
            break;
        default: // 30days
            startDate = today.clone().subtract(29, 'days').format('YYYY-MM-DD');
            endDate = today.format('YYYY-MM-DD');
            periodName = '過去30日';
    }
    
    return { startDate, endDate, periodName };
}

// 目標タイプ用ヘルパー
function getGoalTypeEmoji(type) {
    const emojis = {
        'frequency': '📝',
        'mood': '😊',
        'review': '📅',
        'weight': '⚖️',
        'habit': '🏃‍♂️'
    };
    return emojis[type] || '🎯';
}

function getGoalTypeName(type) {
    const names = {
        'frequency': '記録頻度',
        'mood': '気分改善',
        'review': '振り返り',
        'weight': '体重管理',
        'habit': '習慣実行'
    };
    return names[type] || '目標';
}

function getCategoryName(category) {
    const names = {
        'weight': '体重管理',
        'diary': '日記習慣',
        'habit': '習慣管理',
        'overall': '総合目標'
    };
    return names[category] || '目標';
}

// キャッシュクリーンアップ（定期実行）
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of dataCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            dataCache.delete(key);
        }
    }
    
    if (dataCache.size > 100) { // 最大100エントリーに制限
        const oldestKeys = Array.from(dataCache.keys()).slice(0, 50);
        oldestKeys.forEach(key => dataCache.delete(key));
    }
}, CACHE_DURATION);

module.exports = {
    createCommand,
    handleCommand,
    handleGoalsDashboard,
    handleGoalsAchievements,
    handleGoalsCalendar,
    handleGoalsSummary,
    // ヘルパー関数をエクスポート（bot.jsで使用される場合）
    calculateTodaySummaryFromCache,
    generateOptimizedGoalsCalendar,
    getAllUserData
};
