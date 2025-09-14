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

// プレースホルダー関数（後で実装）
async function handleDietCalendar(interaction) {
    await interaction.reply({ 
        content: 'カレンダー表示機能は実装中です。夜の通知からダイエット記録をつけてお待ちください。', 
        ephemeral: true 
    });
}

async function handleDietStats(interaction) {
    await interaction.reply({ 
        content: '統計機能は実装中です。夜の通知からダイエット記録をつけてお待ちください。', 
        ephemeral: true 
    });
}

async function handleDietGoal(interaction) {
    await interaction.reply({ 
        content: '目標設定機能は実装中です。夜の通知からダイエット記録をつけてお待ちください。', 
        ephemeral: true 
    });
}

async function handleDietProgress(interaction) {
    await interaction.reply({ 
        content: '進捗表示機能は実装中です。夜の通知からダイエット記録をつけてお待ちください。', 
        ephemeral: true 
    });
}

async function handleDietReport(interaction) {
    await interaction.reply({ 
        content: 'レポート機能は実装中です。夜の通知からダイエット記録をつけてお待ちください。', 
        ephemeral: true 
    });
}

module.exports = {
    createCommand,
    handleCommand,
    getDietRecordsInRange
};
