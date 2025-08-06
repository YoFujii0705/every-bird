// commands/diary.js - 完全版（目標設定・統計・振り返り機能付き）

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const calculations = require('../utils/calculations');
const config = require('../config.json');

function createCommand() {
    return new SlashCommandBuilder()
        .setName('diary')
        .setDescription('日記機能')
        .addSubcommand(subcommand =>
            subcommand
                .setName('write')
                .setDescription('今日の日記を書く')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('過去の日記を見る')
                .addStringOption(option =>
                    option.setName('date')
                        .setDescription('日付 (YYYY-MM-DD形式、省略で今日)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('goal')
                .setDescription('日記の目標を設定・確認')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('実行するアクション')
                        .setRequired(true)
                        .addChoices(
                            { name: '目標設定', value: 'set' },
                            { name: '目標確認', value: 'view' },
                            { name: '進捗表示', value: 'progress' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('日記の統計を表示')
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('統計期間')
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
                .setName('review')
                .setDescription('振り返り機能')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('振り返りの種類')
                        .setRequired(true)
                        .addChoices(
                            { name: '週次振り返り', value: 'weekly' },
                            { name: '月次振り返り', value: 'monthly' },
                            { name: 'カスタム期間', value: 'custom' }
                        )
                )
                .addStringOption(option =>
                    option.setName('start_date')
                        .setDescription('開始日（カスタム期間用、YYYY-MM-DD形式）')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('end_date')
                        .setDescription('終了日（カスタム期間用、YYYY-MM-DD形式）')
                        .setRequired(false)
                )
        );
}

async function handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'write':
            await handleDiaryWrite(interaction);
            break;
        case 'view':
            await handleDiaryView(interaction);
            break;
        case 'goal':
            await handleDiaryGoal(interaction);
            break;
        case 'stats':
            await handleDiaryStats(interaction);
            break;
        case 'review':
            await handleDiaryReview(interaction);
            break;
        default:
            await interaction.reply({ content: 'この機能は開発中です。', ephemeral: true });
    }
}

// 日記作成処理（既存）
async function handleDiaryWrite(interaction) {
    const today = moment().format('YYYY-MM-DD');
    
    // 今日の日記が既に存在するかチェック
    const existingEntry = await sheetsUtils.getDiaryEntry(interaction.user.id, today);
    
    const embed = new EmbedBuilder()
        .setTitle('📝 今日の日記を書きましょう')
        .setDescription(`日付: ${today}${existingEntry ? '\n⚠️ 今日の日記は既に書かれています。上書きしますか？' : ''}`)
        .addFields(
            { name: '💡 気分の入力方法', value: '😊 😐 😔 などの絵文字を直接入力してください', inline: false },
            { name: '使用可能な気分絵文字', value: '😊 (最高) 🙂 (良い) 😐 (普通) 😔 (悪い) 😞 (最悪)', inline: false }
        )
        .setColor(0x00AE86);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('write_diary')
                .setLabel('日記を書く')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

    await interaction.reply({ embeds: [embed], components: [row] });
}

// 日記閲覧処理（既存）
async function handleDiaryView(interaction) {
    const date = interaction.options.getString('date') || moment().format('YYYY-MM-DD');
    const entry = await sheetsUtils.getDiaryEntry(interaction.user.id, date);
    
    if (!entry) {
        await interaction.reply({ content: `${date} の日記は見つかりませんでした。`, ephemeral: true });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`📖 ${date} の日記`)
        .setDescription(entry.content)
        .addFields(
            { name: '気分', value: `${entry.mood} ${config.mood_emojis[entry.mood] || ''}`, inline: true }
        )
        .setColor(0x00AE86)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// 🎯 日記目標設定機能（新規）
async function handleDiaryGoal(interaction) {
    const action = interaction.options.getString('action');
    const userId = interaction.user.id;
    
    switch (action) {
        case 'set':
            await showDiaryGoalSetup(interaction);
            break;
        case 'view':
            await showDiaryGoalView(interaction);
            break;
        case 'progress':
            await showDiaryGoalProgress(interaction);
            break;
    }
}

// 日記目標設定UI
async function showDiaryGoalSetup(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎯 日記の目標設定')
        .setDescription('どのような目標を設定しますか？')
        .addFields(
            { name: '📝 記録頻度目標', value: '週や月の記録回数を設定', inline: true },
            { name: '😊 気分改善目標', value: 'ポジティブな気分の割合向上', inline: true },
            { name: '📅 振り返り目標', value: '定期的な振り返り実行', inline: true }
        )
        .setColor(0x9B59B6);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('diary_goal_frequency')
                .setLabel('記録頻度目標')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId('diary_goal_mood')
                .setLabel('気分改善目標')
                .setStyle(ButtonStyle.Success)
                .setEmoji('😊'),
            new ButtonBuilder()
                .setCustomId('diary_goal_review')
                .setLabel('振り返り目標')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📅')
        );

    await interaction.reply({ embeds: [embed], components: [row] });
}

// 日記目標確認
async function showDiaryGoalView(interaction) {
    const userId = interaction.user.id;
    
    try {
        const goals = await sheetsUtils.getDiaryGoals(userId);
        
        if (!goals || goals.length === 0) {
            await interaction.reply({ 
                content: '設定された日記目標がありません。`/diary goal set` で目標を設定してください。', 
                ephemeral: true 
            });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 現在の日記目標')
            .setColor(0x9B59B6)
            .setTimestamp();
        
        goals.forEach(goal => {
            const goalData = JSON.parse(goal.content);
            let goalText = '';
            
            switch (goalData.type) {
                case 'frequency':
                    goalText = `${goalData.period}に${goalData.target}回記録`;
                    break;
                case 'mood':
                    goalText = `ポジティブな気分の割合: ${goalData.target}%以上`;
                    break;
                case 'review':
                    goalText = `${goalData.frequency}に振り返り実行`;
                    break;
            }
            
            embed.addFields({
                name: `${getGoalTypeEmoji(goalData.type)} ${getGoalTypeName(goalData.type)}`,
                value: goalText,
                inline: false
            });
        });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('diary_goal_progress_button')
                    .setLabel('進捗を確認')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📊')
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
        
    } catch (error) {
        console.error('日記目標確認エラー:', error);
        await interaction.reply({ 
            content: '目標の確認中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 日記目標進捗表示
async function showDiaryGoalProgress(interaction) {
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
        
        const embed = new EmbedBuilder()
            .setTitle('📊 日記目標の進捗')
            .setColor(0x9B59B6)
            .setTimestamp();
        
        for (const goal of goals) {
            const goalData = JSON.parse(goal.content);
            const progress = await calculateGoalProgress(userId, goalData);
            
            embed.addFields({
                name: `${getGoalTypeEmoji(goalData.type)} ${getGoalTypeName(goalData.type)}`,
                value: formatGoalProgress(goalData, progress),
                inline: false
            });
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

// 📊 日記統計機能（新規）
async function handleDiaryStats(interaction) {
    const period = interaction.options.getString('period') || '30days';
    const userId = interaction.user.id;
    
    try {
        let { startDate, endDate, periodName } = getPeriodDates(period);
        
        // 期間内の日記エントリーを取得
        const entries = await sheetsUtils.getDiaryEntriesInRange(userId, startDate, endDate);
        
        if (entries.length === 0) {
            await interaction.reply({ 
                content: `${periodName}の日記記録がありません。`, 
                ephemeral: true 
            });
            return;
        }
        
        // 統計計算
        const stats = calculateDiaryStats(entries, startDate, endDate);
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 日記統計（${periodName}）`)
            .setDescription(`${startDate} ～ ${endDate}`)
            .addFields(
                { 
                    name: '📝 記録統計', 
                    value: `記録日数: ${stats.totalEntries}日\n記録率: ${stats.recordingRate}%\n平均文字数: ${stats.averageLength}文字\n最長記録: ${stats.longestEntry}文字`, 
                    inline: true 
                },
                { 
                    name: '😊 気分統計', 
                    value: `平均気分: ${stats.averageMood}\nポジティブ率: ${stats.positiveRate}%\n最も多い気分: ${stats.mostCommonMood}`, 
                    inline: true 
                },
                { 
                    name: '📈 傾向分析', 
                    value: `連続記録: ${stats.currentStreak}日\n最長連続: ${stats.bestStreak}日\n今月の目標達成: ${stats.goalAchievement}`, 
                    inline: false 
                }
            )
            .setColor(getDiaryStatsColor(stats.recordingRate))
            .setTimestamp();
        
        // 気分の変化グラフ
        if (entries.length >= 7) {
            const moodTrend = generateMoodTrend(entries);
            embed.addFields({ name: '📈 気分の変化', value: moodTrend, inline: false });
        }
        
        // 記録パターン分析
        const patterns = analyzeDiaryPatterns(entries);
        if (patterns) {
            embed.addFields({ name: '🔍 記録パターン', value: patterns, inline: false });
        }
        
        // 改善提案
        const suggestions = generateDiarySuggestions(stats);
        if (suggestions) {
            embed.addFields({ name: '💡 改善提案', value: suggestions, inline: false });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('日記統計エラー:', error);
        await interaction.reply({ 
            content: '統計の取得中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 📅 日記振り返り機能（新規）
async function handleDiaryReview(interaction) {
    const type = interaction.options.getString('type');
    const startDate = interaction.options.getString('start_date');
    const endDate = interaction.options.getString('end_date');
    const userId = interaction.user.id;
    
    try {
        let reviewPeriod;
        
        switch (type) {
            case 'weekly':
                reviewPeriod = getWeeklyReviewPeriod();
                break;
            case 'monthly':
                reviewPeriod = getMonthlyReviewPeriod();
                break;
            case 'custom':
                if (!startDate || !endDate) {
                    await interaction.reply({ 
                        content: 'カスタム期間には開始日と終了日の両方を指定してください。', 
                        ephemeral: true 
                    });
                    return;
                }
                reviewPeriod = { 
                    start: startDate, 
                    end: endDate, 
                    name: `${startDate} ～ ${endDate}` 
                };
                break;
        }
        
        // 振り返り実行
        await executeReview(interaction, reviewPeriod);
        
    } catch (error) {
        console.error('日記振り返りエラー:', error);
        await interaction.reply({ 
            content: '振り返り中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// ===== 振り返り実行 =====
async function executeReview(interaction, period) {
    const userId = interaction.user.id;
    
    // 期間内の日記を取得
    const entries = await sheetsUtils.getDiaryEntriesInRange(userId, period.start, period.end);
    
    if (entries.length === 0) {
        await interaction.reply({ 
            content: `${period.name}の日記記録がありません。`, 
            ephemeral: true 
        });
        return;
    }
    
    // 振り返り分析
    const analysis = performReviewAnalysis(entries, period);
    
    const embed = new EmbedBuilder()
        .setTitle(`📅 ${period.name}の振り返り`)
        .setDescription(analysis.summary)
        .addFields(
            { 
                name: '📊 期間サマリー', 
                value: analysis.periodSummary, 
                inline: false 
            },
            { 
                name: '💭 気分の振り返り', 
                value: analysis.moodReflection, 
                inline: false 
            },
            { 
                name: '🌟 ハイライト', 
                value: analysis.highlights, 
                inline: false 
            },
            { 
                name: '🎯 次期への提案', 
                value: analysis.suggestions, 
                inline: false 
            }
        )
        .setColor(0x9B59B6)
        .setTimestamp();
    
    // 振り返り記録を保存
    await saveDiaryReview(userId, period, analysis);
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('diary_review_save')
                .setLabel('振り返りを保存')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💾'),
            new ButtonBuilder()
                .setCustomId('diary_review_share')
                .setLabel('詳細を表示')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋')
        );
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// ===== ヘルパー関数群 =====

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

function calculateDiaryStats(entries, startDate, endDate) {
    const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
    const totalEntries = entries.length;
    const recordingRate = ((totalEntries / totalDays) * 100).toFixed(1);
    
    // 文字数統計
    const contentLengths = entries.map(e => e.content ? e.content.length : 0);
    const averageLength = contentLengths.length > 0 ? 
        Math.round(contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length) : 0;
    const longestEntry = Math.max(...contentLengths, 0);
    
    // 気分統計（calculations.jsを使用せず直接実装）
    const moods = entries.filter(e => e.mood).map(e => e.mood);
    const averageMood = calculateAverageMoodLocal(entries); // ローカル関数を使用
    
    // ポジティブ率（😊、🙂を良い気分として計算）
    const positiveMoods = moods.filter(mood => ['😊', '🙂'].includes(mood));
    const positiveRate = moods.length > 0 ? ((positiveMoods.length / moods.length) * 100).toFixed(1) : 0;
    
    // 最も多い気分
    const moodCounts = {};
    moods.forEach(mood => moodCounts[mood] = (moodCounts[mood] || 0) + 1);
    const mostCommonMoodEmoji = Object.keys(moodCounts).reduce((a, b) => 
        moodCounts[a] > moodCounts[b] ? a : b, '😐');
    const mostCommonMood = mostCommonMoodEmoji + ' ' + (config.mood_emojis[mostCommonMoodEmoji] || '');
    
    // ストリーク計算
    const currentStreak = calculateDiaryStreak(entries, endDate);
    const bestStreak = calculateBestDiaryStreak(entries);
    
    return {
        totalEntries,
        recordingRate,
        averageLength,
        longestEntry,
        averageMood,
        positiveRate,
        mostCommonMood,
        currentStreak,
        bestStreak,
        goalAchievement: '目標設定中' // TODO: 実際の目標達成率を計算
    };
}

// ローカルの気分平均計算関数
function calculateAverageMoodLocal(entries) {
    const moodValues = { '😊': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    const validEntries = entries.filter(entry => entry.mood && moodValues[entry.mood]);
    
    if (validEntries.length === 0) return '未記録';
    
    const sum = validEntries.reduce((acc, entry) => acc + moodValues[entry.mood], 0);
    const avg = sum / validEntries.length;
    
    if (avg >= 4.5) return '😊 とても良い';
    if (avg >= 3.5) return '🙂 良い';
    if (avg >= 2.5) return '😐 普通';
    if (avg >= 1.5) return '😔 悪い';
    return '😞 とても悪い';
}

// 気分トレンド分析関数
function analyzeMoodTrend(entries) {
    if (entries.length < 3) return '気分の傾向を分析するにはより多くの記録が必要です';
    
    const moodValues = { '😊': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    const sortedEntries = entries.sort((a, b) => moment(a.date).diff(moment(b.date)));
    
    const firstHalf = sortedEntries.slice(0, Math.floor(sortedEntries.length / 2));
    const secondHalf = sortedEntries.slice(Math.floor(sortedEntries.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, e) => sum + (moodValues[e.mood] || 3), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + (moodValues[e.mood] || 3), 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    
    if (difference > 0.5) return '📈 期間後半にかけて気分が向上傾向にあります';
    if (difference < -0.5) return '📉 期間後半で気分が下降気味です。休息や楽しみを取り入れましょう';
    return '➡️ 期間を通して安定した気分を保てています';
}

// ハイライト抽出関数
function extractHighlights(entries) {
    if (entries.length === 0) return '記録がありません';
    
    // 最もポジティブだった日
    const positiveEntries = entries.filter(e => ['😊', '🙂'].includes(e.mood));
    const bestDay = positiveEntries.length > 0 ? 
        `😊 ${moment(positiveEntries[0].date).format('MM/DD')}: 良い気分の日` : null;
    
    // 最も長い記録
    const longestEntry = entries.reduce((longest, entry) => 
        (entry.content?.length || 0) > (longest.content?.length || 0) ? entry : longest
    );
    const longestDay = longestEntry.content ? 
        `📝 ${moment(longestEntry.date).format('MM/DD')}: 最も詳しく記録した日` : null;
    
    const highlights = [bestDay, longestDay].filter(Boolean);
    return highlights.length > 0 ? highlights.join('\n') : '特筆すべき記録を継続中';
}

// 成長提案関数
function generateGrowthSuggestions(entries, stats) {
    const suggestions = [];
    
    // 記録頻度に基づく提案
    if (stats.recordingRate >= 80) {
        suggestions.push('🌟 素晴らしい継続力です！この調子で記録を続けましょう');
    } else if (stats.recordingRate >= 50) {
        suggestions.push('👍 良いペースです。もう少し頻度を上げると更なる気づきが得られるかもしれません');
    } else {
        suggestions.push('📝 記録頻度を上げることで、より深い自己理解につながります');
    }
    
    // 気分に基づく提案
    if (stats.positiveRate >= 70) {
        suggestions.push('😊 ポジティブな日々を過ごせています。この要因を分析してみましょう');
    } else if (stats.positiveRate < 40) {
        suggestions.push('💙 辛い時期かもしれません。小さな楽しみや感謝を見つけてみませんか');
    }
    
    // 記録内容に基づく提案
    if (stats.averageLength < 50) {
        suggestions.push('✍️ より詳細な記録で、感情の変化や要因を探ってみましょう');
    }
    
    return suggestions.join('\n');
}

// 週次・月次期間取得関数
function getWeeklyReviewPeriod() {
    const today = moment();
    const weekStart = today.clone().startOf('isoWeek');
    const weekEnd = today.clone();
    
    return {
        start: weekStart.format('YYYY-MM-DD'),
        end: weekEnd.format('YYYY-MM-DD'),
        name: `今週（${weekStart.format('MM/DD')} ～ ${weekEnd.format('MM/DD')}）`
    };
}

function getMonthlyReviewPeriod() {
    const today = moment();
    const monthStart = today.clone().startOf('month');
    const monthEnd = today.clone();
    
    return {
        start: monthStart.format('YYYY-MM-DD'),
        end: monthEnd.format('YYYY-MM-DD'),
        name: `今月（${monthStart.format('MM/DD')} ～ ${monthEnd.format('MM/DD')}）`
    };
}

// 振り返り保存関数
async function saveDiaryReview(userId, period, analysis) {
    try {
        const reviewData = {
            type: 'review',
            period: period,
            analysis: analysis,
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        await sheetsUtils.saveDiaryGoal(userId, 'review_record', JSON.stringify(reviewData));
        console.log('振り返り記録を保存しました:', userId);
    } catch (error) {
        console.error('振り返り保存エラー:', error);
    }
}

function calculateDiaryStreak(entries, endDate) {
    if (entries.length === 0) return 0;
    
    const sortedEntries = entries.sort((a, b) => moment(b.date).diff(moment(a.date)));
    const today = moment(endDate);
    let streak = 0;
    
    for (let i = 0; i < sortedEntries.length; i++) {
        const entryDate = moment(sortedEntries[i].date);
        const expectedDate = today.clone().subtract(i, 'days');
        
        if (entryDate.isSame(expectedDate, 'day')) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

function calculateBestDiaryStreak(entries) {
    if (entries.length === 0) return 0;
    
    const sortedEntries = entries.sort((a, b) => moment(a.date).diff(moment(b.date)));
    let bestStreak = 0;
    let currentStreak = 1;
    
    for (let i = 1; i < sortedEntries.length; i++) {
        const prevDate = moment(sortedEntries[i - 1].date);
        const currDate = moment(sortedEntries[i].date);
        
        if (currDate.diff(prevDate, 'days') === 1) {
            currentStreak++;
        } else {
            bestStreak = Math.max(bestStreak, currentStreak);
            currentStreak = 1;
        }
    }
    
    return Math.max(bestStreak, currentStreak);
}

function generateMoodTrend(entries) {
    const recent7Days = entries.slice(-7);
    const moodValues = { '😊': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    
    let trend = '```\n';
    recent7Days.forEach(entry => {
        const mood = entry.mood || '😐';
        const value = moodValues[mood] || 3;
        const bar = '█'.repeat(value) + '░'.repeat(5 - value);
        trend += `${moment(entry.date).format('MM/DD')} ${mood} ${bar}\n`;
    });
    trend += '```';
    
    return trend;
}

function analyzeDiaryPatterns(entries) {
    // 曜日別の記録パターン分析
    const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
    
    entries.forEach(entry => {
        const weekday = moment(entry.date).day();
        weekdayCount[weekday]++;
    });
    
    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const maxCount = Math.max(...weekdayCount);
    const bestDay = weekdayNames[weekdayCount.indexOf(maxCount)];
    
    if (maxCount >= 2) {
        return `${bestDay}曜日の記録が多い傾向があります`;
    }
    
    return null;
}

function generateDiarySuggestions(stats) {
    const suggestions = [];
    
    if (stats.recordingRate < 50) {
        suggestions.push('📝 記録頻度を上げるため、決まった時間に書く習慣をつけましょう');
    }
    
    if (stats.positiveRate < 40) {
        suggestions.push('😊 ポジティブな出来事にも目を向けて記録してみましょう');
    }
    
    if (stats.averageLength < 50) {
        suggestions.push('✍️ もう少し詳しく感情や体験を記録してみませんか');
    }
    
    if (stats.currentStreak === 0) {
        suggestions.push('🔥 今日から新しいストリークを始めましょう！');
    }
    
    return suggestions.length > 0 ? suggestions.join('\n') : '継続して素晴らしいペースです！';
}

function getDiaryStatsColor(recordingRate) {
    if (recordingRate >= 80) return 0x00FF00;
    if (recordingRate >= 60) return 0xFFD700;
    if (recordingRate >= 40) return 0xFFA500;
    return 0xFF6B6B;
}

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

async function calculateGoalProgress(userId, goalData) {
    // TODO: 具体的な目標進捗計算ロジックを実装
    return {
        current: 0,
        target: goalData.target,
        percentage: 0
    };
}

function formatGoalProgress(goalData, progress) {
    const percentage = Math.min(100, (progress.current / progress.target) * 100).toFixed(1);
    const progressBar = generateProgressBar(percentage);
    
    return `目標: ${progress.target}\n現在: ${progress.current}\n進捗: ${progressBar} ${percentage}%`;
}

function generateProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function getWeeklyReviewPeriod() {
    const today = moment();
    const weekStart = today.clone().startOf('isoWeek');
    const weekEnd = today.clone();
    
    return {
        start: weekStart.format('YYYY-MM-DD'),
        end: weekEnd.format('YYYY-MM-DD'),
        name: `今週（${weekStart.format('MM/DD')} ～ ${weekEnd.format('MM/DD')}）`
    };
}

function getMonthlyReviewPeriod() {
    const today = moment();
    const monthStart = today.clone().startOf('month');
    const monthEnd = today.clone();
    
    return {
        start: monthStart.format('YYYY-MM-DD'),
        end: monthEnd.format('YYYY-MM-DD'),
        name: `今月（${monthStart.format('MM/DD')} ～ ${monthEnd.format('MM/DD')}）`
    };
}

// performReviewAnalysis関数の修正版
function performReviewAnalysis(entries, period) {
    const stats = calculateDiaryStats(entries, period.start, period.end);
    
    // 特筆すべき出来事の抽出
    const highlights = extractHighlights(entries);
    
    // 気分の変化傾向
    const moodTrend = analyzeMoodTrend(entries);
    
    // 成長や気づきの提案
    const growthSuggestions = generateGrowthSuggestions(entries, stats);
    
    return {
        summary: `${period.name}は${entries.length}日間日記を記録しました。`,
        periodSummary: `記録率: ${stats.recordingRate}%\n平均気分: ${stats.averageMood}\nポジティブ率: ${stats.positiveRate}%\n連続記録: ${stats.currentStreak}日`,
        moodReflection: moodTrend,
        highlights: highlights,
        suggestions: growthSuggestions
    };
}

function extractHighlights(entries) {
    if (entries.length === 0) return '記録がありません';
    
    // 最もポジティブだった日
    const positiveEntries = entries.filter(e => ['😊', '🙂'].includes(e.mood));
    const bestDay = positiveEntries.length > 0 ? 
        `😊 ${moment(positiveEntries[0].date).format('MM/DD')}: 良い気分の日` : null;
    
    // 最も長い記録
    const longestEntry = entries.reduce((longest, entry) => 
        (entry.content?.length || 0) > (longest.content?.length || 0) ? entry : longest
    );
    const longestDay = longestEntry.content ? 
        `📝 ${moment(longestEntry.date).format('MM/DD')}: 最も詳しく記録した日` : null;
    
    const highlights = [bestDay, longestDay].filter(Boolean);
    return highlights.length > 0 ? highlights.join('\n') : '特筆すべき記録を継続中';
}

function analyzeMoodTrend(entries) {
    if (entries.length < 3) return '気分の傾向を分析するにはより多くの記録が必要です';
    
    const moodValues = { '😊': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    const sortedEntries = entries.sort((a, b) => moment(a.date).diff(moment(b.date)));
    
    const firstHalf = sortedEntries.slice(0, Math.floor(sortedEntries.length / 2));
    const secondHalf = sortedEntries.slice(Math.floor(sortedEntries.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, e) => sum + (moodValues[e.mood] || 3), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + (moodValues[e.mood] || 3), 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    
    if (difference > 0.5) return '📈 期間後半にかけて気分が向上傾向にあります';
    if (difference < -0.5) return '📉 期間後半で気分が下降気味です。休息や楽しみを取り入れましょう';
    return '➡️ 期間を通して安定した気分を保てています';
}

function generateGrowthSuggestions(entries, stats) {
    const suggestions = [];
    
    // 記録頻度に基づく提案
    if (stats.recordingRate >= 80) {
        suggestions.push('🌟 素晴らしい継続力です！この調子で記録を続けましょう');
    } else if (stats.recordingRate >= 50) {
        suggestions.push('👍 良いペースです。もう少し頻度を上げると更なる気づきが得られるかもしれません');
    } else {
        suggestions.push('📝 記録頻度を上げることで、より深い自己理解につながります');
    }
    
    // 気分に基づく提案
    if (stats.positiveRate >= 70) {
        suggestions.push('😊 ポジティブな日々を過ごせています。この要因を分析してみましょう');
    } else if (stats.positiveRate < 40) {
        suggestions.push('💙 辛い時期かもしれません。小さな楽しみや感謝を見つけてみませんか');
    }
    
    // 記録内容に基づく提案
    if (stats.averageLength < 50) {
        suggestions.push('✍️ より詳細な記録で、感情の変化や要因を探ってみましょう');
    }
    
    return suggestions.join('\n');
}

async function saveDiaryReview(userId, period, analysis) {
    try {
        const reviewData = {
            type: 'review',
            period: period,
            analysis: analysis,
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        await sheetsUtils.saveDiaryGoal(userId, 'review_record', JSON.stringify(reviewData));
        console.log('振り返り記録を保存しました:', userId);
    } catch (error) {
        console.error('振り返り保存エラー:', error);
    }
}

module.exports = {
    createCommand,
    handleCommand,
    handleDiaryWrite,
    handleDiaryView,
    handleDiaryGoal,
    handleDiaryStats,
    handleDiaryReview,
    showDiaryGoalProgress
};
