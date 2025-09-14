const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');

// ダイエットコマンド定義
function createCommand() {
    return new SlashCommandBuilder()
        .setName('diet')
        .setDescription('ダイエット記録・管理機能')
        .addSubcommand(subcommand =>
            subcommand
                .setName('checklist')
                .setDescription('今日のダイエットチェックリストを記録')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('過去のダイエット記録を表示')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('表示する日数（デフォルト: 7日）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(30)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('calendar')
                .setDescription('カレンダー形式で記録を表示')
                .addIntegerOption(option =>
                    option.setName('month')
                        .setDescription('月（1-12、デフォルト: 今月）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('年（デフォルト: 今年）')
                        .setRequired(false)
                        .setMinValue(2020)
                        .setMaxValue(2030)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('統計情報を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('goal')
                .setDescription('月次減量目標を設定')
                .addNumberOption(option =>
                    option.setName('target_loss')
                        .setDescription('目標減量（kg/月）')
                        .setRequired(true)
                        .setMinValue(0.5)
                        .setMaxValue(5.0)
                )
                .addIntegerOption(option =>
                    option.setName('months')
                        .setDescription('期間（月数）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('progress')
                .setDescription('目標進捗を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('report')
                .setDescription('週次・月次レポートを生成')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('レポートの種類')
                        .setRequired(true)
                        .addChoices(
                            { name: '週次レポート', value: 'weekly' },
                            { name: '月次レポート', value: 'monthly' }
                        )
                )
        );
}

// メインのコマンドハンドラー
async function handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'checklist':
            await handleDietChecklist(interaction);
            break;
        case 'view':
            await handleDietView(interaction);
            break;
        case 'calendar':
            await handleDietCalendar(interaction);
            break;
        case 'stats':
            await handleDietStats(interaction);
            break;
        case 'goal':
            await handleDietGoal(interaction);
            break;
        case 'progress':
            await handleDietProgress(interaction);
            break;
        case 'report':
            await handleDietReport(interaction);
            break;
        default:
            await interaction.reply({ content: 'この機能は開発中です。', ephemeral: true });
    }
}

// チェックリスト記録（簡素化版、メイン機能は夜の通知から）
async function handleDietChecklist(interaction) {
    try {
        console.log('ダイエットチェックリスト処理開始');
        
        const embed = new EmbedBuilder()
            .setTitle('📋 ダイエット記録機能について')
            .setDescription('ダイエット記録は夜の通知から利用できます。')
            .addFields(
                { name: '利用方法', value: '「おやすみ」と送信すると夜の通知でダイエット記録ボタンが表示されます', inline: false },
                { name: '記録項目', value: '• 過食の有無\n• 睡眠の質\n• 運動実施状況\n• 食事時間\n• ストレス度', inline: false }
            )
            .setColor('#4CAF50')
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
        console.log('ダイエットチェックリスト処理完了');
        
    } catch (error) {
        console.error('ダイエットチェックリスト処理エラー:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'エラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 過去の記録表示
async function handleDietView(interaction) {
    const days = interaction.options.getInteger('days') || 7;
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const startDate = moment().subtract(days - 1, 'days').format('YYYY-MM-DD');
        const endDate = moment().format('YYYY-MM-DD');
        
        const records = await getDietRecordsInRange(userId, startDate, endDate);
        
        if (records.length === 0) {
            await interaction.editReply({
                content: `過去${days}日間のダイエット記録がありません。`,
            });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`📋 ダイエット記録（過去${days}日間）`)
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 最新5件を表示
        const recentRecords = records.slice(-5).reverse();
        
        for (const record of recentRecords) {
            const achievements = [];
            if (record.no_overeating) achievements.push('過食なし');
            if (record.good_sleep) achievements.push('良い睡眠');
            if (record.water_2l) achievements.push('水分OK');
            if (record.breakfast_time) achievements.push('朝食時間OK');
            if (record.lunch_time) achievements.push('昼食時間OK');
            if (record.dinner_time) achievements.push('夕食時間OK');
            
            const metrics = [];
            if (record.milo_count > 0) metrics.push(`ミロ: ${record.milo_count}回`);
            if (record.exercise_minutes > 0) metrics.push(`運動: ${record.exercise_minutes}分`);
            
            let fieldValue = '';
            if (achievements.length > 0) {
                fieldValue += `達成: ${achievements.join(', ')}\n`;
            }
            if (metrics.length > 0) {
                fieldValue += `実施: ${metrics.join(', ')}\n`;
            }
            if (record.daily_note) {
                fieldValue += `メモ: ${record.daily_note}`;
            }
            
            if (!fieldValue) fieldValue = '記録なし';
            
            embed.addFields({
                name: moment(record.date).format('MM/DD (ddd)'),
                value: fieldValue,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット記録表示エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: 'ダイエット記録の取得中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: 'ダイエット記録の取得中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// カレンダー表示機能
async function handleDietCalendar(interaction) {
    const month = interaction.options.getInteger('month') || moment().month() + 1;
    const year = interaction.options.getInteger('year') || moment().year();
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // 月の範囲を計算
        const startDate = moment(`${year}-${month.toString().padStart(2, '0')}-01`);
        const endDate = startDate.clone().endOf('month');
        
        const records = await getDietRecordsInRange(
            userId, 
            startDate.format('YYYY-MM-DD'), 
            endDate.format('YYYY-MM-DD')
        );
        
        // カレンダー文字列を生成
        const calendar = generateDietCalendar(startDate, records);
        
        const embed = new EmbedBuilder()
            .setTitle(`📅 ダイエットカレンダー ${year}年${month}月`)
            .setDescription('```' + calendar + '```')
            .addFields(
                { name: '🟢 凡例', value: '✅ 目標達成　⭕ 部分達成　❌ 未達成　⬜ 記録なし', inline: false }
            )
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 月間統計を追加
        if (records.length > 0) {
            const monthStats = calculateMonthlyStats(records);
            embed.addFields({
                name: '📊 月間統計',
                value: `記録日数: ${records.length}日\n過食なし: ${monthStats.noOvereating}日 (${monthStats.noOvereatingRate}%)\n運動実施: ${monthStats.exercised}日\n良い睡眠: ${monthStats.goodSleep}日`,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエットカレンダー表示エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: 'カレンダーの表示中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: 'カレンダーの表示中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 統計表示機能
async function handleDietStats(interaction) {
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // 過去30日のデータを取得
        const startDate = moment().subtract(29, 'days').format('YYYY-MM-DD');
        const endDate = moment().format('YYYY-MM-DD');
        
        const records = await getDietRecordsInRange(userId, startDate, endDate);
        
        if (records.length === 0) {
            await interaction.editReply({
                content: '過去30日間のダイエット記録がありません。',
            });
            return;
        }
        
        // 統計計算
        const stats = calculateDietStats(records);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 ダイエット統計（過去30日間）')
            .addFields(
                { name: '📅 記録日数', value: `${records.length}/30日 (${((records.length/30)*100).toFixed(1)}%)`, inline: true },
                { name: '🚫 過食なし', value: `${stats.noOvereating}日 (${stats.noOvereatingRate}%)`, inline: true },
                { name: '😴 良い睡眠', value: `${stats.goodSleep}日 (${stats.goodSleepRate}%)`, inline: true },
                { name: '💧 水分2L+', value: `${stats.water2L}日 (${stats.water2LRate}%)`, inline: true },
                { name: '🚴 運動実施', value: `${stats.exercised}日 (平均${stats.avgExercise}分)`, inline: true },
                { name: '🥤 ミロ使用', value: `総計${stats.totalMilo}回 (平均${stats.avgMilo}回/日)`, inline: true }
            )
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 食事時間の統計
        const mealStats = `朝食: ${stats.breakfastOK}日　昼食: ${stats.lunchOK}日　夕食: ${stats.dinnerOK}日`;
        embed.addFields({ name: '🍽️ 食事時間達成', value: mealStats, inline: false });
        
        // ストレス度の分析
        if (stats.avgStress > 0) {
            const stressEmoji = ['😊', '🙂', '😐', '😰', '😫'][Math.round(stats.avgStress) - 1] || '😐';
            embed.addFields({ 
                name: '😌 平均ストレス度', 
                value: `${stats.avgStress.toFixed(1)}/5 ${stressEmoji}`, 
                inline: true 
            });
        }
        
        // 改善傾向の分析
        const trend = analyzeTrend(records);
        if (trend) {
            embed.addFields({ name: '📈 傾向分析', value: trend, inline: false });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット統計表示エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: '統計の表示中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: '統計の表示中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 目標設定機能
async function handleDietGoal(interaction) {
    const targetLoss = interaction.options.getNumber('target_loss');
    const months = interaction.options.getInteger('months') || 3;
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // 現在の体重を取得（weight.jsのデータを活用）
        const currentWeightEntry = await sheetsUtils.getLatestWeightEntry(userId);
        if (!currentWeightEntry) {
            await interaction.editReply({
                content: '目標設定には現在の体重データが必要です。まず `/weight record` で体重を記録してください。',
            });
            return;
        }
        
        const currentWeight = parseFloat(currentWeightEntry.weight);
        const targetWeight = currentWeight - targetLoss;
        const startDate = moment().format('YYYY-MM-DD');
        const endDate = moment().add(months, 'months').format('YYYY-MM-DD');
        
        // 健康的な減量ペースかチェック
        const weeklyRate = (targetLoss / (months * 4.33));  // 月平均4.33週
        let healthWarning = '';
        
        if (weeklyRate > 1.0) {
            healthWarning = '⚠️ 週1kg以上の減量は健康に負担がかかる可能性があります。';
        } else if (targetWeight < 50) {
            healthWarning = '⚠️ 目標体重が低すぎる可能性があります。医師にご相談ください。';
        }
        
        // 目標をシートに保存
        await saveDietGoal(userId, {
            target_loss: targetLoss,
            target_weight: targetWeight,
            current_weight: currentWeight,
            start_date: startDate,
            end_date: endDate,
            months: months
        });
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 減量目標を設定しました')
            .addFields(
                { name: '現在の体重', value: `${currentWeight}kg`, inline: true },
                { name: '目標減量', value: `${targetLoss}kg`, inline: true },
                { name: '目標体重', value: `${targetWeight}kg`, inline: true },
                { name: '期間', value: `${months}ヶ月`, inline: true },
                { name: '週間ペース', value: `${weeklyRate.toFixed(2)}kg/週`, inline: true },
                { name: '期限', value: endDate, inline: true }
            )
            .setColor(healthWarning ? '#FFA500' : '#4CAF50')
            .setTimestamp();
        
        if (healthWarning) {
            embed.addFields({ name: '健康に関する注意', value: healthWarning, inline: false });
        }
        
        embed.addFields({
            name: '💡 成功のコツ',
            value: '• 行動習慣の継続を重視しましょう\n• 体重の日々の変動は気にせず、週単位で見ましょう\n• 過食防止と適度な運動を両立させましょう',
            inline: false
        });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット目標設定エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: '目標設定中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: '目標設定中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 進捗表示機能
async function handleDietProgress(interaction) {
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // 現在の目標を取得
        const currentGoal = await getCurrentDietGoal(userId);
        if (!currentGoal) {
            await interaction.editReply({
                content: '設定された目標がありません。`/diet goal` で目標を設定してください。',
            });
            return;
        }
        
        // 現在の体重を取得
        const currentWeightEntry = await sheetsUtils.getLatestWeightEntry(userId);
        const currentWeight = currentWeightEntry ? parseFloat(currentWeightEntry.weight) : null;
        
        // 進捗計算
        const progress = calculateProgress(currentGoal, currentWeight);
        
        const embed = new EmbedBuilder()
            .setTitle('📈 減量目標進捗')
            .addFields(
                { name: '🎯 目標', value: `${currentGoal.target_loss}kg減量 (${currentGoal.months}ヶ月間)`, inline: false },
                { name: '開始体重', value: `${currentGoal.current_weight}kg`, inline: true },
                { name: '目標体重', value: `${currentGoal.target_weight}kg`, inline: true },
                { name: '現在体重', value: currentWeight ? `${currentWeight}kg` : '未記録', inline: true }
            )
            .setColor(progress.onTrack ? '#4CAF50' : '#FFA500')
            .setTimestamp();
        
        if (currentWeight) {
            const actualLoss = currentGoal.current_weight - currentWeight;
            const progressPercent = Math.min(100, Math.round((actualLoss / currentGoal.target_loss) * 100));
            
            embed.addFields(
                { name: '📉 実際の減量', value: `${actualLoss.toFixed(1)}kg`, inline: true },
                { name: '📊 達成率', value: `${progressPercent}%`, inline: true },
                { name: '⏰ 残り期間', value: `${progress.daysRemaining}日`, inline: true }
            );
            
            // 予測
            if (progress.prediction) {
                embed.addFields({
                    name: '🔮 予測',
                    value: progress.prediction,
                    inline: false
                });
            }
        }
        
        // 行動目標の分析（過去7日間）
        const recentRecords = await getDietRecordsInRange(
            userId, 
            moment().subtract(6, 'days').format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD')
        );
        
        if (recentRecords.length > 0) {
            const behaviorStats = calculateDietStats(recentRecords);
            embed.addFields({
                name: '🎯 今週の行動目標',
                value: `過食なし: ${behaviorStats.noOvereating}/${recentRecords.length}日\n運動実施: ${behaviorStats.exercised}日\n良い睡眠: ${behaviorStats.goodSleep}日`,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット進捗表示エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: '進捗表示中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: '進捗表示中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 週次・月次レポート機能
async function handleDietReport(interaction) {
    const reportType = interaction.options.getString('type');
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        let startDate, endDate, title;
        
        if (reportType === 'weekly') {
            startDate = moment().startOf('isoWeek').format('YYYY-MM-DD');
            endDate = moment().endOf('isoWeek').format('YYYY-MM-DD');
            title = '📊 今週のダイエットレポート';
        } else {
            startDate = moment().startOf('month').format('YYYY-MM-DD');
            endDate = moment().endOf('month').format('YYYY-MM-DD');
            title = '📊 今月のダイエットレポート';
        }
        
        // ダイエット記録と体重データを取得
        const dietRecords = await getDietRecordsInRange(userId, startDate, endDate);
        const weightEntries = await sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate);
        const currentGoal = await getCurrentDietGoal(userId);
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`期間: ${moment(startDate).format('MM/DD')} - ${moment(endDate).format('MM/DD')}`)
            .setColor('#4CAF50')
            .setTimestamp();
        
        // ダイエット行動統計
        if (dietRecords.length > 0) {
            const stats = calculateDietStats(dietRecords);
            embed.addFields({
                name: '🎯 行動目標達成状況',
                value: `記録日数: ${dietRecords.length}日\n過食なし: ${stats.noOvereating}日 (${stats.noOvereatingRate}%)\n運動実施: ${stats.exercised}日\n良い睡眠: ${stats.goodSleep}日 (${stats.goodSleepRate}%)\n水分摂取: ${stats.water2L}日 (${stats.water2LRate}%)`,
                inline: false
            });
        }
        
        // 体重変化
        if (weightEntries.length > 0) {
            const firstWeight = parseFloat(weightEntries[0].weight);
            const lastWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
            const weightChange = lastWeight - firstWeight;
            const changeText = weightChange >= 0 ? `+${weightChange.toFixed(1)}kg` : `${weightChange.toFixed(1)}kg`;
            
            embed.addFields({
                name: '⚖️ 体重変化',
                value: `${changeText}\n記録回数: ${weightEntries.length}回`,
                inline: true
            });
        }
        
        // 目標との比較
        if (currentGoal && weightEntries.length > 0) {
            const currentWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
            const totalLoss = currentGoal.current_weight - currentWeight;
            const goalProgress = Math.round((totalLoss / currentGoal.target_loss) * 100);
            
            embed.addFields({
                name: '🎯 目標進捗',
                value: `総減量: ${totalLoss.toFixed(1)}kg\n達成率: ${goalProgress}%`,
                inline: true
            });
        }
        
        // 健康的なフィードバック
        const feedback = generateHealthyFeedback(dietRecords, weightEntries, reportType);
        if (feedback) {
            embed.addFields({
                name: '💪 応援メッセージ',
                value: feedback,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエットレポート生成エラー:', error);
        
        if (interaction.deferred) {
            await interaction.editReply({
                content: 'レポート生成中にエラーが発生しました。',
            });
        } else {
            await interaction.reply({
                content: 'レポート生成中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 期間内のダイエット記録を取得
async function getDietRecordsInRange(userId, startDate, endDate) {
    try {
        const data = await sheetsUtils.getSheetData('diet_records', 'A:N');
        
        if (!data || data.length <= 1) return [];
        
        const records = [];
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 3) continue;
            
            const recordDate = row[0];
            const recordUserId = row[1];
            
            if (recordUserId !== userId) continue;
            if (!recordDate) continue;
            
            const date = moment(recordDate);
            if (!date.isValid()) continue;
            
            if (date.isBetween(startDate, endDate, 'day', '[]')) {
                records.push({
                    date: recordDate,
                    user_id: recordUserId,
                    no_overeating: row[2] === 'TRUE' || row[2] === true,
                    good_sleep: row[3] === 'TRUE' || row[3] === true,
                    milo_count: parseInt(row[4]) || 0,
                    exercise_minutes: parseInt(row[5]) || 0,
                    water_2l: row[6] === 'TRUE' || row[6] === true,
                    breakfast_time: row[7] === 'TRUE' || row[7] === true,
                    lunch_time: row[8] === 'TRUE' || row[8] === true,
                    dinner_time: row[9] === 'TRUE' || row[9] === true,
                    snacks_list: row[10] || '',
                    stress_level: parseInt(row[11]) || null,
                    daily_note: row[12] || '',
                    created_at: row[13] || ''
                });
            }
        }
        
        return records.sort((a, b) => moment(a.date).diff(moment(b.date)));
        
    } catch (error) {
        console.error('ダイエット記録取得エラー:', error);
        return [];
    }
}

// カレンダー生成関数
function generateDietCalendar(startDate, records) {
    const year = startDate.year();
    const month = startDate.month();
    const daysInMonth = startDate.daysInMonth();
    const firstDayOfWeek = startDate.day(); // 0=日曜日
    
    // 記録を日付でマップ化
    const recordMap = {};
    records.forEach(record => {
        const day = moment(record.date).date();
        recordMap[day] = record;
    });
    
    let calendar = `      ${startDate.format('YYYY年MM月')}\n`;
    calendar += '   日 月 火 水 木 金 土\n';
    
    let line = '   ';
    
    // 最初の週の空白
    for (let i = 0; i < firstDayOfWeek; i++) {
        line += '   ';
    }
    
    // 各日の表示
    for (let day = 1; day <= daysInMonth; day++) {
        const record = recordMap[day];
        let symbol;
        
        if (!record) {
            symbol = '⬜';
        } else {
            // 達成度を計算
            const achievements = [
                record.no_overeating,
                record.good_sleep,
                record.water_2l,
                record.breakfast_time,
                record.lunch_time,
                record.dinner_time
            ].filter(Boolean).length;
            
            if (achievements >= 5) symbol = '✅';
            else if (achievements >= 3) symbol = '⭕';
            else symbol = '❌';
        }
        
        line += symbol + ' ';
        
        // 土曜日の場合は改行
        if ((firstDayOfWeek + day - 1) % 7 === 6) {
            calendar += line + '\n';
            line = '   ';
        }
    }
    
    // 最後の行が未完成の場合
    if (line.trim()) {
        calendar += line + '\n';
    }
    
    return calendar;
}

// 月間統計計算
function calculateMonthlyStats(records) {
    const noOvereating = records.filter(r => r.no_overeating).length;
    const goodSleep = records.filter(r => r.good_sleep).length;
    const exercised = records.filter(r => r.exercise_minutes > 0).length;
    
    return {
        noOvereating,
        noOvereatingRate: Math.round((noOvereating / records.length) * 100),
        goodSleep,
        exercised
    };
}

// 詳細統計計算
function calculateDietStats(records) {
    const total = records.length;
    const noOvereating = records.filter(r => r.no_overeating).length;
    const goodSleep = records.filter(r => r.good_sleep).length;
    const water2L = records.filter(r => r.water_2l).length;
    const exercised = records.filter(r => r.exercise_minutes > 0).length;
    const breakfastOK = records.filter(r => r.breakfast_time).length;
    const lunchOK = records.filter(r => r.lunch_time).length;
    const dinnerOK = records.filter(r => r.dinner_time).length;
    
    const totalMilo = records.reduce((sum, r) => sum + (r.milo_count || 0), 0);
    const totalExercise = records.reduce((sum, r) => sum + (r.exercise_minutes || 0), 0);
    const stressRecords = records.filter(r => r.stress_level && r.stress_level > 0);
    const totalStress = stressRecords.reduce((sum, r) => sum + r.stress_level, 0);
    
    return {
        noOvereating,
        noOvereatingRate: Math.round((noOvereating / total) * 100),
        goodSleep,
        goodSleepRate: Math.round((goodSleep / total) * 100),
        water2L,
        water2LRate: Math.round((water2L / total) * 100),
        exercised,
        breakfastOK,
        lunchOK,
        dinnerOK,
        totalMilo,
        avgMilo: (totalMilo / total).toFixed(1),
        avgExercise: exercised > 0 ? Math.round(totalExercise / exercised) : 0,
        avgStress: stressRecords.length > 0 ? totalStress / stressRecords.length : 0
    };
}

// 傾向分析
function analyzeTrend(records) {
    if (records.length < 14) return null;
    
    const recent = records.slice(-7);
    const previous = records.slice(-14, -7);
    
    const recentSuccess = recent.filter(r => r.no_overeating).length;
    const previousSuccess = previous.filter(r => r.no_overeating).length;
    
    if (recentSuccess > previousSuccess + 1) {
        return '📈 過食コントロールが改善傾向にあります！';
    } else if (recentSuccess < previousSuccess - 1) {
        return '📉 少し調子が落ち気味です。無理をせず、続けることを重視しましょう。';
    } else {
        return '➡️ 安定して継続できています。';
    }
}

// ダイエット目標をシートに保存
async function saveDietGoal(userId, goalData) {
    const goalId = `goal_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const rowData = [
        goalId,                           // A: goal_id
        userId,                           // B: user_id
        goalData.start_date,              // C: start_date
        goalData.end_date,                // D: end_date
        goalData.target_loss,             // E: target_loss_kg
        goalData.target_weight,           // F: target_weight
        goalData.current_weight,          // G: start_weight
        goalData.months,                  // H: duration_months
        true,                             // I: is_active
        moment().format('YYYY-MM-DD HH:mm:ss') // J: created_at
    ];
    
    await sheetsUtils.saveToSheet('diet_goals', rowData);
}

// 現在のダイエット目標を取得
async function getCurrentDietGoal(userId) {
    try {
        const data = await sheetsUtils.getSheetData('diet_goals', 'A:J');
        
        if (!data || data.length <= 1) return null;
        
        for (let i = data.length - 1; i >= 1; i--) {
            const row = data[i];
            if (!row || row.length < 9) continue;
            
            const goalUserId = row[1];
            const isActive = row[8];
            
            if (goalUserId === userId && (isActive === 'TRUE' || isActive === true)) {
                return {
                    goal_id: row[0],
                    user_id: row[1],
                    start_date: row[2],
                    end_date: row[3],
                    target_loss: parseFloat(row[4]),
                    target_weight: parseFloat(row[5]),
                    current_weight: parseFloat(row[6]),
                    months: parseInt(row[7]),
                    is_active: isActive,
                    created_at: row[9]
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('ダイエット目標取得エラー:', error);
        return null;
    }
}

// 進捗計算
function calculateProgress(goal, currentWeight) {
    const startDate = moment(goal.start_date);
    const endDate = moment(goal.end_date);
    const now = moment();
    const totalDays = endDate.diff(startDate, 'days');
    const elapsedDays = now.diff(startDate, 'days');
    const daysRemaining = endDate.diff(now, 'days');
    const expectedProgress = (elapsedDays / totalDays) * goal.target_loss;
    
    let result = {
        daysRemaining: Math.max(0, daysRemaining),
        totalDays,
        elapsedDays: Math.max(0, elapsedDays)
    };
    
    if (currentWeight) {
        const actualLoss = goal.current_weight - currentWeight;
        result.actualLoss = actualLoss;
        result.expectedLoss = expectedProgress;
        result.onTrack = actualLoss >= expectedProgress * 0.8; // 80%以上で「順調」
        
        // 予測計算
        if (elapsedDays > 7) {
            const currentRate = actualLoss / elapsedDays;
            const predictedFinalLoss = currentRate * totalDays;
            
            if (predictedFinalLoss >= goal.target_loss * 0.9) {
                result.prediction = '目標達成の可能性が高いです！';
            } else if (predictedFinalLoss >= goal.target_loss * 0.7) {
                result.prediction = '現在のペースでは目標にやや届かない可能性があります。';
            } else {
                result.prediction = '健康的なペースで進んでいますが、目標の見直しを検討してください。';
            }
        }
    }
    
    return result;
}

// 健康的なフィードバック生成
function generateHealthyFeedback(dietRecords, weightEntries, reportType) {
    const messages = [];
    
    if (dietRecords.length === 0) {
        return '記録をつけることから始めましょう。小さな一歩が大きな変化につながります。';
    }
    
    const stats = calculateDietStats(dietRecords);
    const period = reportType === 'weekly' ? '今週' : '今月';
    
    // 記録継続への称賛
    messages.push(`${period}は${dietRecords.length}日記録をつけられました。継続が最も重要な成果です。`);
    
    // 行動習慣の評価
    if (stats.noOvereatingRate >= 70) {
        messages.push('過食コントロールが良好です。');
    } else if (stats.noOvereatingRate >= 40) {
        messages.push('過食コントロールで改善が見られます。');
    }
    
    if (stats.exercised > 0) {
        messages.push(`${stats.exercised}日運動を実施できました。体にも心にも良い影響があります。`);
    }
    
    // 体重変化について（健康的な視点）
    if (weightEntries && weightEntries.length >= 2) {
        const weightChange = parseFloat(weightEntries[weightEntries.length - 1].weight) - parseFloat(weightEntries[0].weight);
        if (weightChange <= -0.5) {
            messages.push('体重も健康的なペースで減少しています。');
        } else if (weightChange <= 0.5) {
            messages.push('体重は安定しています。行動習慣の変化が先に現れることが多いです。');
        }
    }
    
    return messages.join(' ');
}

// 週次レポート自動生成用の関数（通知システムで使用）
async function generateWeeklyReport(userId) {
    try {
        const startDate = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const endDate = moment().endOf('isoWeek').format('YYYY-MM-DD');
        
        const dietRecords = await getDietRecordsInRange(userId, startDate, endDate);
        const weightEntries = await sheetsUtils.getWeightEntriesInRange(userId, startDate, endDate);
        const currentGoal = await getCurrentDietGoal(userId);
        
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('📊 今週のダイエットレポート')
            .setDescription(`${moment(startDate).format('MM/DD')} - ${moment(endDate).format('MM/DD')}`)
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 基本統計
        if (dietRecords.length > 0) {
            const stats = calculateDietStats(dietRecords);
            embed.addFields({
                name: '🎯 今週の実績',
                value: `記録: ${dietRecords.length}/7日\n過食なし: ${stats.noOvereating}日\n運動: ${stats.exercised}日\n良い睡眠: ${stats.goodSleep}日`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '📝 記録状況',
                value: '今週はまだ記録がありません。夜の通知からダイエット記録をつけてみましょう。',
                inline: false
            });
        }
        
        // 体重変化
        if (weightEntries.length > 0) {
            const firstWeight = parseFloat(weightEntries[0].weight);
            const lastWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
            const change = lastWeight - firstWeight;
            const changeText = change >= 0 ? `+${change.toFixed(1)}kg` : `${change.toFixed(1)}kg`;
            
            embed.addFields({
                name: '⚖️ 体重変化',
                value: `${changeText} (${weightEntries.length}回記録)`,
                inline: true
            });
        }
        
        // 目標進捗
        if (currentGoal && weightEntries.length > 0) {
            const currentWeight = parseFloat(weightEntries[weightEntries.length - 1].weight);
            const totalLoss = currentGoal.current_weight - currentWeight;
            const progressPercent = Math.round((totalLoss / currentGoal.target_loss) * 100);
            
            embed.addFields({
                name: '🎯 目標進捗',
                value: `${totalLoss.toFixed(1)}kg減量 (${progressPercent}%)`,
                inline: true
            });
        }
        
        // 励ましメッセージ
        const feedback = generateHealthyFeedback(dietRecords, weightEntries, 'weekly');
        if (feedback) {
            embed.addFields({
                name: '💪 今週の振り返り',
                value: feedback,
                inline: false
            });
        }
        
        // 来週への提案
        let suggestion = '';
        if (dietRecords.length > 0) {
            const stats = calculateDietStats(dietRecords);
            if (stats.exercised < 3) {
                suggestion = '来週は運動を週3回以上目指してみましょう。';
            } else if (stats.noOvereatingRate < 80) {
                suggestion = '過食コントロールを重点的に取り組んでみましょう。';
            } else {
                suggestion = '現在の良い習慣を継続していきましょう！';
            }
        } else {
            suggestion = '来週はまず記録をつけることから始めましょう。';
        }
        
        if (suggestion) {
            embed.addFields({
                name: '🌟 来週の目標',
                value: suggestion,
                inline: false
            });
        }
        
        return embed;
        
    } catch (error) {
        console.error('週次レポート生成エラー:', error);
        return null;
    }
}

module.exports = {
    createCommand,
    handleCommand,
    getDietRecordsInRange,
    generateDietCalendar,
    calculateDietStats,
    analyzeTrend,
    generateWeeklyReport
};
