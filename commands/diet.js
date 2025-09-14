const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
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

// チェックリスト記録
async function handleDietChecklist(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 今日のダイエット記録')
        .setDescription('今日の取り組みを記録しましょう')
        .setColor('#4CAF50')
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('diet_checklist_modal')
                .setLabel('📝 記録を開始')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
}

// チェックリストモーダル表示
async function showChecklistModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('diet_checklist_submit')
        .setTitle('今日のダイエット記録');

    // 基本的な Yes/No 項目
    const basicItems = new TextInputBuilder()
        .setCustomId('basic_items')
        .setLabel('達成項目（該当するものに○）')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('例: 過食なし○ 良い睡眠○ 水分2L○ 朝食時間○ 昼食時間○ 夕食時間○')
        .setRequired(false)
        .setMaxLength(200);

    // ミロの回数
    const miloCount = new TextInputBuilder()
        .setCustomId('milo_count')
        .setLabel('ミロで過食衝動を乗り切った回数（数字のみ）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 3')
        .setRequired(false)
        .setMaxLength(2);

    // エアロバイクの時間
    const exerciseMinutes = new TextInputBuilder()
        .setCustomId('exercise_minutes')
        .setLabel('エアロバイクの時間（分、数字のみ）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 30')
        .setRequired(false)
        .setMaxLength(3);

    // 間食の内容
    const snacks = new TextInputBuilder()
        .setCustomId('snacks')
        .setLabel('間食をした場合の食品名')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: クッキー2枚、りんご1個')
        .setRequired(false)
        .setMaxLength(100);

    // ストレス度と今日のひとこと
    const notes = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('ストレス度（1-5）と今日のひとこと')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('ストレス度: 3\n今日のひとこと: 運動できて気分が良かった')
        .setRequired(false)
        .setMaxLength(300);

    const row1 = new ActionRowBuilder().addComponents(basicItems);
    const row2 = new ActionRowBuilder().addComponents(miloCount);
    const row3 = new ActionRowBuilder().addComponents(exerciseMinutes);
    const row4 = new ActionRowBuilder().addComponents(snacks);
    const row5 = new ActionRowBuilder().addComponents(notes);

    modal.addComponents(row1, row2, row3, row4, row5);
    
    await interaction.showModal(modal);
}

// チェックリスト送信処理
async function handleChecklistSubmit(interaction) {
    const basicItems = interaction.fields.getTextInputValue('basic_items') || '';
    const miloCount = parseInt(interaction.fields.getTextInputValue('milo_count')) || 0;
    const exerciseMinutes = parseInt(interaction.fields.getTextInputValue('exercise_minutes')) || 0;
    const snacks = interaction.fields.getTextInputValue('snacks') || '';
    const notes = interaction.fields.getTextInputValue('notes') || '';
    
    try {
        const userId = interaction.user.id;
        const today = moment().format('YYYY-MM-DD');
        
        // 基本項目の解析（○が含まれているかチェック）
        const checkItems = {
            no_overeating: basicItems.includes('過食なし') && basicItems.includes('○'),
            good_sleep: basicItems.includes('良い睡眠') && basicItems.includes('○'),
            water_2l: basicItems.includes('水分2L') && basicItems.includes('○'),
            breakfast_time: basicItems.includes('朝食時間') && basicItems.includes('○'),
            lunch_time: basicItems.includes('昼食時間') && basicItems.includes('○'),
            dinner_time: basicItems.includes('夕食時間') && basicItems.includes('○')
        };
        
        // ストレス度の抽出
        const stressMatch = notes.match(/ストレス度[：:]\s*([1-5])/);
        const stressLevel = stressMatch ? parseInt(stressMatch[1]) : null;
        
        // 今日のひとことの抽出
        const noteLines = notes.split('\n').filter(line => 
            !line.includes('ストレス度') && line.trim().length > 0
        );
        const dailyNote = noteLines.length > 0 ? noteLines.join('\n') : '';
        
        // Google Sheetsに保存
        await saveDietRecord(userId, today, {
            ...checkItems,
            milo_count: miloCount,
            exercise_minutes: exerciseMinutes,
            snacks_list: snacks,
            stress_level: stressLevel,
            daily_note: dailyNote
        });
        
        // 結果表示
        const embed = new EmbedBuilder()
            .setTitle('✅ ダイエット記録を保存しました')
            .setDescription('今日の記録')
            .setColor('#4CAF50')
            .setTimestamp();
        
        // 達成項目の表示
        const achievements = [];
        if (checkItems.no_overeating) achievements.push('過食なし');
        if (checkItems.good_sleep) achievements.push('良い睡眠');
        if (checkItems.water_2l) achievements.push('水分2L以上');
        if (checkItems.breakfast_time) achievements.push('朝食時間OK');
        if (checkItems.lunch_time) achievements.push('昼食時間OK');
        if (checkItems.dinner_time) achievements.push('夕食時間OK');
        
        if (achievements.length > 0) {
            embed.addFields({
                name: '🎯 達成項目',
                value: achievements.join(', '),
                inline: false
            });
        }
        
        // 数値項目の表示
        const metrics = [];
        if (miloCount > 0) metrics.push(`ミロ: ${miloCount}回`);
        if (exerciseMinutes > 0) metrics.push(`エアロバイク: ${exerciseMinutes}分`);
        
        if (metrics.length > 0) {
            embed.addFields({
                name: '📊 実施記録',
                value: metrics.join(', '),
                inline: false
            });
        }
        
        if (snacks) {
            embed.addFields({
                name: '🍪 間食',
                value: snacks,
                inline: false
            });
        }
        
        if (stressLevel) {
            const stressEmoji = ['😫', '😰', '😐', '🙂', '😊'][stressLevel - 1] || '😐';
            embed.addFields({
                name: '😌 ストレス度',
                value: `${stressLevel}/5 ${stressEmoji}`,
                inline: true
            });
        }
        
        if (dailyNote) {
            embed.addFields({
                name: '💭 今日のひとこと',
                value: dailyNote,
                inline: false
            });
        }
        
        // 励ましメッセージ
        const encouragement = generateEncouragement(achievements.length, miloCount, exerciseMinutes);
        if (encouragement) {
            embed.addFields({
                name: '💪 応援メッセージ',
                value: encouragement,
                inline: false
            });
        }
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット記録保存エラー:', error);
        await interaction.reply({
            content: 'ダイエット記録の保存中にエラーが発生しました。',
            ephemeral: true
        });
    }
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
        moment().format('YYYY-MM-DD HH:mm:ss') // N: created_at
    ];
    
    await sheetsUtils.saveToSheet('diet_records', rowData);
}

// 励ましメッセージ生成
function generateEncouragement(achievementCount, miloCount, exerciseMinutes) {
    const messages = [];
    
    if (achievementCount >= 5) {
        messages.push('素晴らしい一日でした！多くの目標を達成できています。');
    } else if (achievementCount >= 3) {
        messages.push('良いペースで継続できています。この調子で頑張りましょう。');
    } else if (achievementCount >= 1) {
        messages.push('今日も記録をつけることができました。小さな一歩も大切です。');
    }
    
    if (miloCount > 0) {
        messages.push(`過食衝動を${miloCount}回乗り切れたのは大きな成果です。`);
    }
    
    if (exerciseMinutes >= 30) {
        messages.push('30分以上の運動、素晴らしいです！');
    } else if (exerciseMinutes > 0) {
        messages.push('運動を実施できました。継続が力になります。');
    }
    
    return messages.length > 0 ? messages.join(' ') : null;
}

// 過去の記録表示
async function handleDietView(interaction) {
    const days = interaction.options.getInteger('days') || 7;
    const userId = interaction.user.id;
    
    try {
        const startDate = moment().subtract(days - 1, 'days').format('YYYY-MM-DD');
        const endDate = moment().format('YYYY-MM-DD');
        
        const records = await getDietRecordsInRange(userId, startDate, endDate);
        
        if (records.length === 0) {
            await interaction.reply({
                content: `過去${days}日間のダイエット記録がありません。`,
                ephemeral: true
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
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('ダイエット記録表示エラー:', error);
        await interaction.reply({
            content: 'ダイエット記録の取得中にエラーが発生しました。',
            ephemeral: true
        });
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

// ボタンインタラクション処理
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    
    if (customId === 'diet_checklist_modal') {
        await showChecklistModal(interaction);
    }
}

// モーダル送信処理
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;
    
    if (customId === 'diet_checklist_submit') {
        await handleChecklistSubmit(interaction);
    }
}

// プレースホルダー関数（後で実装）
async function handleDietCalendar(interaction) {
    await interaction.reply({ content: 'カレンダー表示機能は実装中です。', ephemeral: true });
}

async function handleDietStats(interaction) {
    await interaction.reply({ content: '統計機能は実装中です。', ephemeral: true });
}

async function handleDietGoal(interaction) {
    await interaction.reply({ content: '目標設定機能は実装中です。', ephemeral: true });
}

async function handleDietProgress(interaction) {
    await interaction.reply({ content: '進捗表示機能は実装中です。', ephemeral: true });
}

async function handleDietReport(interaction) {
    await interaction.reply({ content: 'レポート機能は実装中です。', ephemeral: true });
}

module.exports = {
    createCommand,
    handleCommand,
    handleButtonInteraction,
    handleModalSubmit,
    showChecklistModal,
    handleChecklistSubmit,
    saveDietRecord,
    getDietRecordsInRange
};
