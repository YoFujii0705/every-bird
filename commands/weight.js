const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const calculations = require('../utils/calculations');
const validation = require('../utils/validation');
const config = require('../config.json');

// Chart.js用のcanvasライブラリ（要インストール: npm install canvas chart.js）
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

// 日本語フォントの登録（システムにインストールされている日本語フォントを使用）
function registerJapaneseFont() {
    try {
        // Ubuntu/Debian系の場合
        const fontPaths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
            '/System/Library/Fonts/Arial Unicode MS.ttf', // macOS
            'C:\\Windows\\Fonts\\msgothic.ttc', // Windows
            'C:\\Windows\\Fonts\\meiryo.ttc' // Windows
        ];
        
        for (const fontPath of fontPaths) {
            try {
                if (require('fs').existsSync(fontPath)) {
                    registerFont(fontPath, { family: 'Japanese' });
                    console.log('✅ 日本語フォント登録成功:', fontPath);
                    return true;
                }
            } catch (error) {
                continue;
            }
        }
        
        console.log('⚠️ 日本語フォントが見つかりません。デフォルトフォントを使用します。');
        return false;
    } catch (error) {
        console.error('フォント登録エラー:', error);
        return false;
    }
}

// コマンド定義
function createCommand() {
    return new SlashCommandBuilder()
        .setName('weight')
        .setDescription('体重管理機能')
        .addSubcommand(subcommand =>
            subcommand
                .setName('record')
                .setDescription('今日の体重を記録')
                .addNumberOption(option =>
                    option.setName('weight')
                        .setDescription('体重（kg）')
                        .setRequired(true)
                        .setMinValue(20)
                        .setMaxValue(300)
                )
                .addStringOption(option =>
                    option.setName('memo')
                        .setDescription('メモ（体調など）')
                        .setRequired(false)
                        .setMaxLength(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('体重履歴を表示')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('表示する日数（デフォルト: 7日）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(90)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('graph')
                .setDescription('体重グラフを表示')
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('期間')
                        .setRequired(false)
                        .addChoices(
                            { name: '1週間', value: '7' },
                            { name: '2週間', value: '14' },
                            { name: '1ヶ月', value: '30' },
                            { name: '3ヶ月', value: '90' }
                        )
                )
                .addBooleanOption(option =>
                    option.setName('image')
                        .setDescription('画像グラフを生成（デフォルト: true）')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
             subcommand
                 .setName('profile')
                 .setDescription('身長・年齢を設定（健康ガイダンス用）')
                 .addNumberOption(option =>
                    option.setName('height')
                      .setDescription('身長（cm）')
                      .setRequired(true)
                      .setMinValue(100)
                      .setMaxValue(250)
        )
        .addIntegerOption(option =>
            option.setName('age')
                .setDescription('年齢')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(120)
        )
)
        .addSubcommand(subcommand =>
            subcommand
                .setName('goal')
                .setDescription('体重目標を設定')
                .addNumberOption(option =>
                    option.setName('target')
                        .setDescription('目標体重（kg）')
                        .setRequired(true)
                        .setMinValue(20)
                        .setMaxValue(300)
                )
                .addStringOption(option =>
                    option.setName('deadline')
                        .setDescription('目標期限（YYYY-MM-DD形式）')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('体重統計を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('predict')
                .setDescription('体重推移予測と目標達成予測')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('予測日数（デフォルト: 30日）')
                        .setRequired(false)
                        .setMinValue(7)
                        .setMaxValue(365)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('meal')
                .setDescription('食事を記録')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('食事の種類')
                        .setRequired(true)
                        .addChoices(
                            { name: '朝食', value: 'breakfast' },
                            { name: '昼食', value: 'lunch' },
                            { name: '夕食', value: 'dinner' },
                            { name: '間食', value: 'snack' }
                        )
                )
                .addStringOption(option =>
                    option.setName('content')
                        .setDescription('食事内容')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addStringOption(option =>
                    option.setName('memo')
                        .setDescription('メモ（量、感想など）')
                        .setRequired(false)
                        .setMaxLength(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('meal-view')
                .setDescription('食事記録を表示')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('表示する日数（デフォルト: 3日）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(14)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('report')
                .setDescription('週間/月間レポートを生成')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('レポートの種類')
                        .setRequired(true)
                        .addChoices(
                            { name: '週間レポート', value: 'weekly' },
                            { name: '月間レポート', value: 'monthly' }
                        )
                )
        );
}

// 体重記録処理（タイムアウト対策版）
async function handleWeightRecord(interaction) {
    const weight = interaction.options.getNumber('weight');
    const memo = interaction.options.getString('memo') || '';
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    try {
        // 最初に即座に defer してタイムアウトを防ぐ
        await interaction.deferReply();
        
        // 今日の体重が既に記録されているかチェック
        const existingEntry = await sheetsUtils.getWeightEntry(userId, today);
        
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
        
        // 初回からの変化を計算（非同期で、エラーが発生しても続行）
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
            .setTitle(`⚖️ 体重を記録しました ${existingEntry ? '(更新)' : ''}`)
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
        console.error('体重記録エラー:', error);
        
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

// 画像グラフ生成関数（日本語フォント対応版）
async function generateWeightImageGraph(entries, targetWeight = null, period = 30) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 日本語フォントを登録
    const fontRegistered = registerJapaneseFont();

    // Chart.jsの設定
    const labels = entries.map(entry => moment(entry.date).format('MM/DD'));
    const weights = entries.map(entry => parseFloat(entry.weight));
    
    // 目標体重のライン用データ
    const targetData = targetWeight ? 
        Array(entries.length).fill(targetWeight) : [];

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '体重',
                data: weights,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgb(75, 192, 192)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: false,
            plugins: {
                title: {
                    display: true,
                    text: `体重推移グラフ（過去${period}日間）`,
                    font: {
                        size: 18,
                        family: fontRegistered ? 'Japanese' : 'Arial'
                    }
                },
                legend: {
                    display: targetWeight ? true : false,
                    labels: {
                        font: {
                            family: fontRegistered ? 'Japanese' : 'Arial'
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: '体重 (kg)',
                        font: {
                            family: fontRegistered ? 'Japanese' : 'Arial'
                        }
                    },
                    ticks: {
                        font: {
                            family: fontRegistered ? 'Japanese' : 'Arial'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日付',
                        font: {
                            family: fontRegistered ? 'Japanese' : 'Arial'
                        }
                    },
                    ticks: {
                        font: {
                            family: fontRegistered ? 'Japanese' : 'Arial'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            elements: {
                point: {
                    hoverRadius: 8
                }
            }
        }
    };

    // 目標体重ラインを追加
    if (targetWeight) {
        chartConfig.data.datasets.push({
            label: '目標体重',
            data: targetData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
        });
    }

    const Chart = require('chart.js/auto');
    const chart = new Chart(ctx, chartConfig);
    chart.render();

    return canvas.toBuffer('image/png');
}

// 体重グラフ表示（改良版）
async function handleWeightGraph(interaction) {
    const period = parseInt(interaction.options.getString('period')) || 30;
    const useImage = interaction.options.getBoolean('image') ?? true;
    const userId = interaction.user.id;
    
    const startDate = moment().subtract(period - 1, 'days').format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');
    
    const entries = await sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate);
    
    if (entries.length < 2) {
        await interaction.reply({ content: 'グラフを表示するには2つ以上の体重記録が必要です。', flags: 64 });
        return;
    }

    // 目標体重を取得
    const goal = await sheetsUtils.getWeightGoal(userId);
    const targetWeight = goal && goal.target ? parseFloat(goal.target) : null;
    
    const weights = entries.map(e => parseFloat(e.weight));
    const maxWeight = Math.max(...weights);
    const minWeight = Math.min(...weights);
    const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 体重グラフ（過去${period}日間）`)
        .addFields(
            { name: '最高体重', value: `${maxWeight}kg`, inline: true },
            { name: '最低体重', value: `${minWeight}kg`, inline: true },
            { name: '平均体重', value: `${avgWeight.toFixed(1)}kg`, inline: true },
            { name: '記録日数', value: `${entries.length}日`, inline: true },
            { name: '変動幅', value: `${(maxWeight - minWeight).toFixed(1)}kg`, inline: true }
        )
        .setColor(0x00AE86)
        .setTimestamp();

    if (targetWeight) {
        embed.addFields({ name: '目標体重', value: `${targetWeight}kg`, inline: true });
    }

    try {
        if (useImage) {
            // 画像グラフを生成
            await interaction.deferReply();
            const graphBuffer = await generateWeightImageGraph(entries, targetWeight, period);
            const attachment = new AttachmentBuilder(graphBuffer, { name: 'weight-graph.png' });
            
            embed.setImage('attachment://weight-graph.png');
            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } else {
            // ASCIIグラフを使用
            const graph = calculations.generateWeightGraph(entries, targetWeight);
            embed.setDescription('```\n' + graph + '\n```');
            await interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('グラフ生成エラー:', error);
        // 画像生成に失敗した場合はASCIIグラフにフォールバック
        const graph = calculations.generateWeightGraph(entries, targetWeight);
        embed.setDescription('```\n' + graph + '\n```');
        await interaction.reply({ embeds: [embed] });
    }
}

// 体重予測機能
async function handleWeightPredict(interaction) {
    const predictDays = interaction.options.getInteger('days') || 30;
    const userId = interaction.user.id;
    
    // 過去30日間のデータを取得して予測に使用
    const analysisStart = moment().subtract(30, 'days').format('YYYY-MM-DD');
    const today = moment().format('YYYY-MM-DD');
    
    const entries = await sheetsUtils.getWeightEntriesInRange(userId, analysisStart, today);
    
    if (entries.length < 7) {
        await interaction.reply({ 
            content: '予測には最低7日分の体重記録が必要です。', 
            flags: 64 
        });
        return;
    }

    try {
        const prediction = await calculations.predictWeightTrend(entries, predictDays);
        const goal = await sheetsUtils.getWeightGoal(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('📈 体重推移予測')
            .setDescription(`現在のトレンドに基づく${predictDays}日後の予測`)
            .addFields(
                { name: '現在の体重', value: `${prediction.currentWeight}kg`, inline: true },
                { name: `${predictDays}日後予測`, value: `${prediction.predictedWeight}kg`, inline: true },
                { name: '予測変化量', value: `${prediction.predictedChange}kg`, inline: true },
                { name: '週間ペース', value: `${prediction.weeklyTrend}kg/週`, inline: true },
                { name: 'トレンド', value: prediction.trendDirection, inline: true },
                { name: '信頼度', value: prediction.confidence, inline: true }
            )
            .setColor(prediction.trendDirection.includes('↗️') ? 0xFF6B6B : 
                      prediction.trendDirection.includes('↘️') ? 0x4ECDC4 : 0xFFE66D);

        // 目標がある場合の達成予測
        if (goal && goal.target) {
            const targetWeight = parseFloat(goal.target);
            const goalPrediction = calculations.predictGoalAchievement(
                prediction.currentWeight, 
                targetWeight, 
                prediction.weeklyTrend
            );
            
            embed.addFields({
                name: '🎯 目標達成予測',
                value: goalPrediction.message,
                inline: false
            });

            if (goal.deadline) {
                const deadline = moment(goal.deadline);
                const daysToDeadline = deadline.diff(moment(), 'days');
                if (daysToDeadline > 0) {
                    embed.addFields({
                        name: '期限まで',
                        value: `${daysToDeadline}日`,
                        inline: true
                    });
                }
            }
        }

        // 推奨事項
        const recommendations = calculations.getWeightRecommendations(prediction);
        if (recommendations.length > 0) {
            embed.addFields({
                name: '💡 推奨事項',
                value: recommendations.join('\n'),
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('体重予測エラー:', error);
        await interaction.reply({ 
            content: '予測計算中にエラーが発生しました。', 
            flags: 64 
        });
    }
}

// 食事記録機能
async function handleMealRecord(interaction) {
    const mealType = interaction.options.getString('type');
    const content = interaction.options.getString('content');
    const memo = interaction.options.getString('memo') || '';
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    const mealTypeNames = {
        breakfast: '朝食',
        lunch: '昼食', 
        dinner: '夕食',
        snack: '間食'
    };

    try {
        await sheetsUtils.saveMealRecord(userId, today, mealType, content, memo);
        
        const embed = new EmbedBuilder()
            .setTitle(`🍽️ ${mealTypeNames[mealType]}を記録しました`)
            .addFields(
                { name: '日付', value: today, inline: true },
                { name: '食事内容', value: content, inline: false },
                { name: 'メモ', value: memo || 'なし', inline: false }
            )
            .setColor(0xFFA500)
            .setTimestamp();
        
        // 今日の食事記録をすべて取得して表示
        const todayMeals = await sheetsUtils.getMealRecordsForDate(userId, today);
        if (todayMeals.length > 1) {
            const mealSummary = todayMeals.map(meal => 
                `${mealTypeNames[meal.type]}: ${meal.content}`
            ).join('\n');
            
            embed.addFields({
                name: '今日の食事記録',
                value: mealSummary,
                inline: false
            });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('食事記録エラー:', error);
        await interaction.reply({ 
            content: '食事記録中にエラーが発生しました。', 
            flags: 64 
        });
    }
}

// 食事記録表示
async function handleMealView(interaction) {
    const days = interaction.options.getInteger('days') || 3;
    const userId = interaction.user.id;
    
    const startDate = moment().subtract(days - 1, 'days').format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');
    
    const mealRecords = await sheetsUtils.getMealRecordsInRange(userId, startDate, endDate);
    
    if (mealRecords.length === 0) {
        await interaction.reply({ 
            content: `過去${days}日間の食事記録がありません。`, 
            flags: 64 
        });
        return;
    }

    const mealTypeNames = {
        breakfast: '🌅 朝食',
        lunch: '☀️ 昼食',
        dinner: '🌙 夕食',
        snack: '🍪 間食'
    };

    const embed = new EmbedBuilder()
        .setTitle(`🍽️ 食事記録（過去${days}日間）`)
        .setColor(0xFFA500);

    // 日付ごとにグループ化
    const recordsByDate = mealRecords.reduce((acc, record) => {
        if (!acc[record.date]) acc[record.date] = [];
        acc[record.date].push(record);
        return acc;
    }, {});

    // 最新の日付から表示
    const sortedDates = Object.keys(recordsByDate).sort().reverse();
    
    for (const date of sortedDates.slice(0, 5)) { // 最新5日分
        const dayMeals = recordsByDate[date];
        const mealText = dayMeals.map(meal => 
            `${mealTypeNames[meal.type]}: ${meal.content}${meal.memo ? ` (${meal.memo})` : ''}`
        ).join('\n');
        
        embed.addFields({
            name: moment(date).format('MM/DD (ddd)'),
            value: mealText,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

// レポート生成機能
async function handleReport(interaction) {
    const reportType = interaction.options.getString('type');
    const userId = interaction.user.id;
    
    let startDate, endDate, title;
    
    if (reportType === 'weekly') {
        startDate = moment().startOf('isoWeek').format('YYYY-MM-DD');
        endDate = moment().endOf('isoWeek').format('YYYY-MM-DD');
        title = '📊 週間レポート';
    } else {
        startDate = moment().startOf('month').format('YYYY-MM-DD');
        endDate = moment().endOf('month').format('YYYY-MM-DD');
        title = '📊 月間レポート';
    }

    try {
        const weightEntries = await sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate);
        const mealRecords = await sheetsUtils.getMealRecordsInRange(userId, startDate, endDate);
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`期間: ${moment(startDate).format('MM/DD')} - ${moment(endDate).format('MM/DD')}`)
            .setColor(0x9B59B6)
            .setTimestamp();

        // 体重統計
        if (weightEntries.length > 0) {
            const weights = weightEntries.map(e => parseFloat(e.weight));
            const avgWeight = (weights.reduce((sum, w) => sum + w, 0) / weights.length).toFixed(1);
            const maxWeight = Math.max(...weights);
            const minWeight = Math.min(...weights);
            const change = weights.length > 1 ? 
                (weights[weights.length - 1] - weights[0]).toFixed(1) : '0.0';
            
            embed.addFields({
                name: '⚖️ 体重データ',
                value: `記録日数: ${weightEntries.length}日\n平均体重: ${avgWeight}kg\n期間変化: ${change >= 0 ? '+' : ''}${change}kg\n変動幅: ${(maxWeight - minWeight).toFixed(1)}kg`,
                inline: true
            });
        }

        // 食事統計
        if (mealRecords.length > 0) {
            const mealsByType = mealRecords.reduce((acc, meal) => {
                acc[meal.type] = (acc[meal.type] || 0) + 1;
                return acc;
            }, {});
            
            const mealStats = Object.entries(mealsByType).map(([type, count]) => {
                const names = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
                return `${names[type]}: ${count}回`;
            }).join('\n');
            
            embed.addFields({
                name: '🍽️ 食事データ',
                value: `総記録数: ${mealRecords.length}件\n${mealStats}`,
                inline: true
            });
        }

        // データがない場合
        if (weightEntries.length === 0 && mealRecords.length === 0) {
            embed.addFields({
                name: 'データなし',
                value: 'この期間には記録がありません。',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('レポート生成エラー:', error);
        await interaction.reply({ 
            content: 'レポート生成中にエラーが発生しました。', 
            flags: 64 
        });
    }
}

// メインのコマンドハンドラー
async function handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'record':
            await handleWeightRecord(interaction);
            break;
        case 'view':
            await handleWeightView(interaction);
            break;
        case 'graph':
            await handleWeightGraph(interaction);
            break;
        case 'goal':
            await handleWeightGoal(interaction);
            break;
        case 'stats':
            await handleWeightStats(interaction);
            break;
        case 'profile':
            await handleWeightProfile(interaction);
            break;
        case 'predict':
            await handleWeightPredict(interaction);
            break;
        case 'meal':
            await handleMealRecord(interaction);
            break;
        case 'meal-view':
            await handleMealView(interaction);
            break;
        case 'report':
            await handleReport(interaction);
            break;
        default:
            await interaction.reply({ content: 'この機能は開発中です。', flags: 64 });
    }
}

// 体重履歴表示
async function handleWeightView(interaction) {
    const days = interaction.options.getInteger('days') || 7;
    const userId = interaction.user.id;
    
    const startDate = moment().subtract(days - 1, 'days').format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');
    
    const entries = await sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate);
    
    if (entries.length === 0) {
        await interaction.reply({ content: `過去${days}日間の体重記録がありません。`, flags: 64 });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`⚖️ 体重履歴（過去${days}日間）`)
        .setColor(0x00AE86);
    
    // 最新5件を表示
    const recentEntries = entries.slice(-5).reverse();
    recentEntries.forEach(entry => {
        embed.addFields({
            name: entry.date,
            value: `${entry.weight}kg${entry.memo ? ` - ${entry.memo}` : ''}`,
            inline: false
        });
    });
    
    // 統計情報
    if (entries.length >= 2) {
        const firstWeight = parseFloat(entries[0].weight);
        const lastWeight = parseFloat(entries[entries.length - 1].weight);
        const change = lastWeight - firstWeight;
        const changeText = change >= 0 ? `+${change.toFixed(1)}kg` : `${change.toFixed(1)}kg`;
        
        embed.addFields({
            name: '期間内変化',
            value: changeText,
            inline: true
        });
        
        // 平均体重
        const avgWeight = entries.reduce((sum, entry) => sum + parseFloat(entry.weight), 0) / entries.length;
        embed.addFields({
            name: '平均体重',
            value: `${avgWeight.toFixed(1)}kg`,
            inline: true
        });
    }
    
    await interaction.reply({ embeds: [embed] });
}

// 体重目標設定
// commands/weight.js の handleWeightGoal を健康ガイダンス付きに改良

async function handleWeightGoal(interaction) {
    const target = interaction.options.getNumber('target');
    const deadline = interaction.options.getString('deadline');
    const userId = interaction.user.id;
    
    try {
        // 現在の体重を取得
        const currentEntry = await sheetsUtils.getLatestWeightEntry(userId);
        if (!currentEntry) {
            await interaction.reply({ 
                content: '目標設定には現在の体重データが必要です。まず `/weight record` で体重を記録してください。', 
                flags: 64 
            });
            return;
        }
        
        const currentWeight = parseFloat(currentEntry.weight);
        
        // ユーザープロフィール（身長）を取得
        const userProfile = await sheetsUtils.getUserProfile(userId);
        
        // 健康ガイダンスの実行
        let validationResult = null;
        if (userProfile && userProfile.height && deadline) {
            validationResult = calculations.validateWeightGoal(
                currentWeight, 
                target, 
                parseFloat(userProfile.height), 
                deadline
            );
        }
        
        // 目標保存
        await sheetsUtils.saveWeightGoal(userId, target, deadline);
        
        // レスポンス作成
        const difference = target - currentWeight;
        const direction = difference > 0 ? '増量' : '減量';
        const absChange = Math.abs(difference);
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 体重目標を設定しました')
            .setDescription(`**目標体重**: ${target}kg\n**現在の体重**: ${currentWeight}kg\n**目標まで**: ${absChange.toFixed(1)}kg ${direction}`)
            .setColor(validationResult && !validationResult.isValid ? 0xFFA500 : 0x00AE86);
        
        // 基本情報
        if (deadline) {
            const daysUntilDeadline = moment(deadline).diff(moment(), 'days');
            if (daysUntilDeadline > 0) {
                const weeklyRate = (absChange / daysUntilDeadline) * 7;
                embed.addFields(
                    { name: '期限', value: `${deadline} (あと${daysUntilDeadline}日)`, inline: true },
                    { name: '必要な週間ペース', value: `${weeklyRate.toFixed(2)}kg/週`, inline: true }
                );
            }
        }
        
        // 健康ガイダンス
        if (validationResult) {
            // BMI情報
            if (validationResult.bmi) {
                embed.addFields({
                    name: '📊 BMI情報',
                    value: `目標体重BMI: ${validationResult.bmi} (${validationResult.bmiCategory})`,
                    inline: false
                });
            }
            
            // 警告とアドバイス
            if (validationResult.warnings.length > 0 || validationResult.suggestions.length > 0) {
                let guidanceText = '';
                
                if (validationResult.warnings.length > 0) {
                    guidanceText += '⚠️ **注意事項**\n';
                    guidanceText += validationResult.warnings.map(w => `• ${w}`).join('\n') + '\n\n';
                }
                
                if (validationResult.suggestions.length > 0) {
                    guidanceText += '💡 **推奨事項**\n';
                    guidanceText += validationResult.suggestions.map(s => `• ${s}`).join('\n');
                }
                
                embed.addFields({
                    name: '🏥 健康ガイダンス',
                    value: guidanceText,
                    inline: false
                });
            } else if (validationResult.isValid) {
                embed.addFields({
                    name: '✅ 健康ガイダンス',
                    value: '目標は健康的な範囲内です！継続して頑張りましょう。',
                    inline: false
                });
            }
        }
        
        // 身長未設定の場合の案内
        if (!userProfile || !userProfile.height) {
            embed.addFields({
                name: '📏 身長設定',
                value: '身長を設定すると、より詳細な健康ガイダンスを受けられます。\n`/weight profile` で設定してください。',
                inline: false
            });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('体重目標設定エラー:', error);
        await interaction.reply({ content: '目標設定中にエラーが発生しました。', flags: 64 });
    }
}

// 新しいサブコマンド: プロフィール設定
async function handleWeightProfile(interaction) {
    const height = interaction.options.getNumber('height');
    const age = interaction.options.getInteger('age');
    const userId = interaction.user.id;
    
    try {
        await sheetsUtils.saveUserProfile(userId, height, age);
        
        // 現在の体重と健康情報を表示
        const currentEntry = await sheetsUtils.getLatestWeightEntry(userId);
        let healthInfo = '';
        
        if (currentEntry) {
            const currentWeight = parseFloat(currentEntry.weight);
            const bmi = calculations.calculateBMI(currentWeight, height);
            const healthyRange = calculations.getHealthyWeightRange(height);
            
            healthInfo = `
**現在のBMI**: ${bmi.toFixed(1)} (${calculations.getBMICategory(bmi)})
**健康的な体重範囲**: ${healthyRange.min}-${healthyRange.max}kg`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('👤 プロフィールを更新しました')
            .addFields(
                { name: '身長', value: `${height}cm`, inline: true },
                { name: '年齢', value: `${age}歳`, inline: true }
            )
            .setColor(0x00AE86);
        
        if (healthInfo) {
            embed.addFields({ name: '📊 健康情報', value: healthInfo, inline: false });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('プロフィール設定エラー:', error);
        await interaction.reply({ content: 'プロフィール設定中にエラーが発生しました。', flags: 64 });
    }
}

// 体重統計表示
async function handleWeightStats(interaction) {
    const userId = interaction.user.id;
    const last30Days = moment().subtract(30, 'days').format('YYYY-MM-DD');
    const today = moment().format('YYYY-MM-DD');
    
    const entries = await sheetsUtils.getWeightEntriesInRange(userId, last30Days, today);
    
    if (entries.length === 0) {
        await interaction.reply({ content: '過去30日間の体重記録がありません。', flags: 64 });
        return;
    }
    
    // 統計計算
    const weights = entries.map(e => parseFloat(e.weight));
    const avgWeight = (weights.reduce((sum, w) => sum + w, 0) / weights.length).toFixed(1);
    const maxWeight = Math.max(...weights);
    const minWeight = Math.min(...weights);
    const firstWeight = weights[0];
    const lastWeight = weights[weights.length - 1];
    const totalChange = (lastWeight - firstWeight).toFixed(1);
    
    // 体重変動の標準偏差
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - parseFloat(avgWeight), 2), 0) / weights.length;
    const stdDev = Math.sqrt(variance).toFixed(1);
    
    // 目標との比較
    const goal = await sheetsUtils.getWeightGoal(userId);
    let goalProgress = '';
    if (goal && goal.target) {
        const remaining = (parseFloat(goal.target) - lastWeight).toFixed(1);
        const direction = remaining > 0 ? '増量' : '減量';
        goalProgress = `目標まで: ${Math.abs(remaining)}kg ${direction}`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📊 体重統計（過去30日間）')
        .addFields(
            { name: '記録日数', value: `${entries.length}日`, inline: true },
            { name: '平均体重', value: `${avgWeight}kg`, inline: true },
            { name: '期間変化', value: `${totalChange >= 0 ? '+' : ''}${totalChange}kg`, inline: true },
            { name: '最高体重', value: `${maxWeight}kg`, inline: true },
            { name: '最低体重', value: `${minWeight}kg`, inline: true },
            { name: '変動幅', value: `${(maxWeight - minWeight).toFixed(1)}kg`, inline: true },
            { name: '現在体重', value: `${lastWeight}kg`, inline: true },
            { name: '体重変動', value: `標準偏差 ${stdDev}kg`, inline: true },
            { name: '記録頻度', value: `${((entries.length / 30) * 100).toFixed(1)}%`, inline: true }
        )
        .setColor(0x00AE86)
        .setTimestamp();
    
    if (goalProgress) {
        embed.addFields({ name: '🎯 目標進捗', value: goalProgress, inline: false });
    }
    
    // 傾向分析
    if (entries.length >= 7) {
        const recentWeek = weights.slice(-7);
        const previousWeek = weights.slice(-14, -7);
        
        if (previousWeek.length >= 3) {
            const recentAvg = recentWeek.reduce((sum, w) => sum + w, 0) / recentWeek.length;
            const previousAvg = previousWeek.reduce((sum, w) => sum + w, 0) / previousWeek.length;
            const weekTrend = recentAvg - previousAvg;
            
            let trendText = '';
            if (weekTrend > 0.3) trendText = '📈 増加傾向';
            else if (weekTrend < -0.3) trendText = '📉 減少傾向';
            else trendText = '➡️ 安定';
            
            embed.addFields({ name: '週間傾向', value: `${trendText} (${weekTrend >= 0 ? '+' : ''}${weekTrend.toFixed(1)}kg)`, inline: false });
        }
    }
    
    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    createCommand,
    handleCommand,
    generateWeightImageGraph,
    handleWeightRecord,
    handleWeightView,
    handleWeightGraph,
    handleWeightGoal,
    handleWeightStats
};
