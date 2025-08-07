const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const validation = require('../utils/validation');
const config = require('../config.json');

// インタラクション処理のメイン関数
async function handleInteraction(interaction) {
    try {
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
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
}

// ボタンインタラクション処理
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    
    if (customId === 'write_diary') {
        await showMoodSelector(interaction);
    } else if (customId.startsWith('mood_selected_')) {
        const mood = customId.replace('mood_selected_', '');
        await showDiaryModalWithMood(interaction, mood);
    } else if (customId === 'add_habit') {
        await showHabitAddModal(interaction);
    } else if (customId === 'quick_done') {
        await showQuickDoneMenu(interaction);
    } else if (customId === 'set_weekly_goals') {
        // 今週の目標設定（既存の実装があればそれを使用、なければ下記を追加）
        await handleWeeklyGoalSetting(interaction);
    } else if (customId.startsWith('weight_record_')) {
        // 体重記録ボタン（既存の実装があればそれを使用）
        const userId = customId.replace('weight_record_', '');
        await handleWeightRecord(interaction, userId);
    } 
    // 🌅 起床通知のスキップボタン処理 - 新追加
    else if (customId === 'whoami_skip') {
        await interaction.update({
            content: '⏭️ Who Am I をスキップしました。今日も良い一日を！',
            embeds: [],
            components: []
        });
    } else if (customId === 'weight_skip') {
        await interaction.update({
            content: '⏭️ 体重記録を後回しにしました。忘れずに記録してくださいね！',
            embeds: [],
            components: []
        });
    } else if (customId === 'routine_later') {
        await interaction.update({
            content: '⏭️ ルーティンを後で実行します。お疲れ様でした！',
            embeds: [],
            components: []
        });
    }
    // 注意: 'view_weekly_stats' の処理は削除（もう使用されない）
}

// セレクトメニューインタラクション処理
async function handleSelectMenuInteraction(interaction) {
    const customId = interaction.customId;
    
    if (customId === 'mood_selector') {
        const selectedMood = interaction.values[0];
        await showDiaryModalWithMood(interaction, selectedMood);
    } else if (customId === 'quick_done_habits') {
        await handleQuickDone(interaction);
    }
}

// モーダル送信処理
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;
    
    if (customId.startsWith('diary_modal_')) {
        const mood = customId.replace('diary_modal_', '');
        await saveDiaryEntry(interaction, mood);
    } else if (customId === 'habit_add_modal') {
        await saveNewHabit(interaction);
    } else if (customId === 'weekly_goals_modal') {
        await saveWeeklyGoal(interaction);
    } else if (customId === 'weight_record_modal') {
        await saveWeightRecord(interaction);
    }
}

// ===== 日記関連 =====

// 気分選択画面を表示
async function showMoodSelector(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('😊 今日の気分を選択してください')
        .setDescription('まず今日の気分を選んでから、日記を書きましょう')
        .setColor(0x00AE86);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('mood_selector')
        .setPlaceholder('今日の気分を選択...')
        .addOptions([
            {
                label: '最高',
                description: '今日は最高の気分！',
                value: '😊',
                emoji: '😊'
            },
            {
                label: '良い',
                description: '今日は良い気分',
                value: '🙂',
                emoji: '🙂'
            },
            {
                label: '普通',
                description: '今日は普通の気分',
                value: '😐',
                emoji: '😐'
            },
            {
                label: '悪い',
                description: '今日は少し気分が悪い',
                value: '😔',
                emoji: '😔'
            },
            {
                label: '最悪',
                description: '今日は最悪の気分...',
                value: '😞',
                emoji: '😞'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({ embeds: [embed], components: [row] });
}

// 気分が選択された状態で日記入力モーダル表示
async function showDiaryModalWithMood(interaction, selectedMood) {
    const modal = new ModalBuilder()
        .setCustomId(`diary_modal_${selectedMood}`)
        .setTitle(`今日の日記 - 気分: ${selectedMood}`);

    const diaryInput = new TextInputBuilder()
        .setCustomId('diary_content')
        .setLabel('今日の出来事・感想')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('今日あった出来事や感じたことを書いてください...')
        .setRequired(true)
        .setMaxLength(2000);

    const actionRow = new ActionRowBuilder().addComponents(diaryInput);
    modal.addComponents(actionRow);
    
    await interaction.showModal(modal);
}

// 日記エントリー保存
async function saveDiaryEntry(interaction, mood) {
    const content = interaction.fields.getTextInputValue('diary_content');
    
    // 気分絵文字の検証（config.jsonを使用する場合）
    const validMoods = ['😊', '🙂', '😐', '😔', '😞'];
    if (!validMoods.includes(mood)) {
        await interaction.reply({ 
            content: `❌ 無効な気分絵文字です。`, 
            flags: 64 
        });
        return;
    }
    
    const today = moment().format('YYYY-MM-DD');
    const userId = interaction.user.id;
    
    try {
        // 入力をサニタイズ（validation.jsが利用可能な場合）
        const sanitizedContent = validation ? validation.sanitizeInput(content) : content.trim();
        
        await sheetsUtils.saveDiaryToSheet(userId, today, sanitizedContent, mood);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ 日記を保存しました')
            .setDescription(`**日付**: ${today}\n**気分**: ${mood}`)
            .addFields(
                { name: '内容', value: sanitizedContent.length > 100 ? sanitizedContent.substring(0, 100) + '...' : sanitizedContent, inline: false }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('日記保存エラー:', error);
        await interaction.reply({ content: '日記の保存中にエラーが発生しました。', flags: 64 });
    }
}

// ===== 習慣関連 =====

// 習慣追加モーダル表示（カテゴリなし）
async function showHabitAddModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('habit_add_modal')
        .setTitle('新しい習慣を追加');

    const nameInput = new TextInputBuilder()
        .setCustomId('habit_name')
        .setLabel('習慣名')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: 朝の散歩、読書、筋トレ')
        .setRequired(true)
        .setMaxLength(50);

    const frequencyInput = new TextInputBuilder()
        .setCustomId('habit_frequency')
        .setLabel('頻度 (daily, weekly, custom)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('daily')
        .setRequired(true)
        .setMaxLength(10);

    const difficultyInput = new TextInputBuilder()
        .setCustomId('habit_difficulty')
        .setLabel('難易度 (easy, normal, hard)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('normal')
        .setRequired(true)
        .setMaxLength(10);

    const firstRow = new ActionRowBuilder().addComponents(nameInput);
    const secondRow = new ActionRowBuilder().addComponents(frequencyInput);
    const thirdRow = new ActionRowBuilder().addComponents(difficultyInput);

    modal.addComponents(firstRow, secondRow, thirdRow);
    
    await interaction.showModal(modal);
}

// 新しい習慣を保存（カテゴリなし）
async function saveNewHabit(interaction) {
    const name = interaction.fields.getTextInputValue('habit_name');
    const frequency = interaction.fields.getTextInputValue('habit_frequency');
    const difficulty = interaction.fields.getTextInputValue('habit_difficulty');
    
    // 基本的なバリデーション
    if (!['daily', 'weekly', 'custom'].includes(frequency)) {
        await interaction.reply({ 
            content: '❌ 頻度は daily, weekly, custom のいずれかを入力してください。', 
            flags: 64 
        });
        return;
    }
    
    if (!['easy', 'normal', 'hard'].includes(difficulty)) {
        await interaction.reply({ 
            content: '❌ 難易度は easy, normal, hard のいずれかを入力してください。', 
            flags: 64 
        });
        return;
    }
    
    // 既存習慣との重複チェック
    try {
        const existingHabits = await sheetsUtils.getUserHabits(interaction.user.id);
        const duplicateHabit = existingHabits.find(habit => habit.name.toLowerCase() === name.toLowerCase());
        
        if (duplicateHabit) {
            await interaction.reply({ 
                content: '❌ 同じ名前の習慣が既に存在します。', 
                flags: 64 
            });
            return;
        }
    } catch (error) {
        console.error('習慣重複チェックエラー:', error);
    }
    
    try {
        // 入力をサニタイズ
        const sanitizedName = validation ? validation.sanitizeInput(name) : name.trim();
        
        const habitId = await sheetsUtils.saveHabitToSheet(
            interaction.user.id, 
            sanitizedName, 
            frequency, 
            difficulty
        );
        
        const embed = new EmbedBuilder()
            .setTitle('✅ 新しい習慣を追加しました')
            .addFields(
                { name: '習慣名', value: sanitizedName, inline: true },
                { name: '頻度', value: frequency, inline: true },
                { name: '難易度', value: `${getDifficultyEmoji(difficulty)} ${difficulty}`, inline: true }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('習慣保存エラー:', error);
        await interaction.reply({ content: '習慣の保存中にエラーが発生しました。', flags: 64 });
    }
}

// 難易度絵文字を取得
function getDifficultyEmoji(difficulty) {
    const emojis = {
        'easy': '🟢',
        'normal': '🟡',
        'hard': '🔴'
    };
    return emojis[difficulty] || '❓';
}

// クイック完了メニュー表示
async function showQuickDoneMenu(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    const today = moment().format('YYYY-MM-DD');
    const todayLogs = await sheetsUtils.getHabitLogsForDate(userId, today);
    
    // 未完了の習慣のみ表示
    const pendingHabits = habits.filter(habit => 
        !todayLogs.some(log => log.habitId === habit.id)
    );
    
    if (pendingHabits.length === 0) {
        await interaction.update({ 
            content: '🎉 今日の習慣は全て完了しています！', 
            embeds: [], 
            components: [] 
        });
        return;
    }
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('quick_done_habits')
        .setPlaceholder('完了した習慣を選択...')
        .addOptions(
            pendingHabits.slice(0, 25).map(habit => ({
                label: habit.name,
                description: `頻度: ${habit.frequency} | 難易度: ${getDifficultyEmoji(habit.difficulty)} ${habit.difficulty}`,
                value: habit.id
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({ 
        content: '完了した習慣を選択してください:', 
        embeds: [], 
        components: [row] 
    });
}

// クイック完了処理
async function handleQuickDone(interaction) {
    const habitId = interaction.values[0];
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    const habit = await sheetsUtils.getHabitById(habitId);
    if (!habit) {
        await interaction.update({ content: '習慣が見つかりません。', components: [] });
        return;
    }
    
    try {
        // 習慣ログを保存
        await sheetsUtils.saveHabitLog(userId, habitId, today);
        
        // ストリーク更新（可能な場合）
        let streakInfo = '';
        try {
            const newStreak = await sheetsUtils.updateHabitStreak(userId, habitId);
            streakInfo = `${newStreak}日連続達成中！ 🎉`;
        } catch (streakError) {
            console.error('ストリーク更新エラー:', streakError);
            streakInfo = '実行完了！';
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`✅ ${habit.name} 完了！`)
            .setDescription(streakInfo)
            .addFields(
                { name: '実行日', value: today, inline: true },
                { name: '習慣継続', value: '素晴らしいです！', inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
    } catch (error) {
        console.error('習慣完了処理エラー:', error);
        await interaction.update({ 
            content: '❌ 習慣の完了処理中にエラーが発生しました。', 
            components: [] 
        });
    }
}

// 週次目標設定の処理（新規追加）
async function handleWeeklyGoalSetting(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('weekly_goals_modal')
        .setTitle('今週の目標設定');

    const goalInput = new TextInputBuilder()
        .setCustomId('weekly_goal')
        .setLabel('今週の目標')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('今週達成したい目標を書いてください...')
        .setRequired(true)
        .setMaxLength(500);

    const actionRow = new ActionRowBuilder().addComponents(goalInput);
    modal.addComponents(actionRow);
    
    await interaction.showModal(modal);
}

// 体重記録処理（新規追加、既存があれば不要）
async function handleWeightRecord(interaction, userId) {
    // ユーザーIDチェック
    if (userId !== interaction.user.id) {
        await interaction.reply({ 
            content: 'このボタンはあなた用ではありません。', 
            flags: 64 
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('weight_record_modal')
        .setTitle('体重記録');

    const weightInput = new TextInputBuilder()
        .setCustomId('weight_value')
        .setLabel('体重 (kg)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('70.5')
        .setRequired(true)
        .setMaxLength(6);

    const memoInput = new TextInputBuilder()
        .setCustomId('weight_memo')
        .setLabel('メモ（任意）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('体調や食事についてのメモ...')
        .setRequired(false)
        .setMaxLength(100);

    const firstRow = new ActionRowBuilder().addComponents(weightInput);
    const secondRow = new ActionRowBuilder().addComponents(memoInput);

    modal.addComponents(firstRow, secondRow);
    
    await interaction.showModal(modal);
}

// 週次目標保存（新規追加）
async function saveWeeklyGoal(interaction) {
    const goalContent = interaction.fields.getTextInputValue('weekly_goal');
    const userId = interaction.user.id;
    const weekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
    
    try {
        // 入力をサニタイズ
        const sanitizedGoal = validation ? validation.sanitizeInput(goalContent) : goalContent.trim();
        
        // 週次目標をシートに保存（sheetsUtils.js に実装が必要）
        try {
            await sheetsUtils.saveWeeklyGoalToSheet(userId, weekStart, sanitizedGoal);
        } catch (sheetError) {
            console.error('週次目標シート保存エラー:', sheetError);
            console.log('週次目標をログに記録:', { userId, weekStart, goal: sanitizedGoal });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🎯 今週の目標を設定しました')
            .setDescription(`**期間**: ${moment().startOf('isoWeek').format('MM/DD')} - ${moment().endOf('isoWeek').format('MM/DD')}`)
            .addFields(
                { name: '目標', value: sanitizedGoal, inline: false }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('週次目標保存エラー:', error);
        await interaction.reply({ content: '目標の保存中にエラーが発生しました。', flags: 64 });
    }
}

// 体重記録保存（新規追加）
async function saveWeightRecord(interaction) {
    const weightValue = interaction.fields.getTextInputValue('weight_value');
    const memo = interaction.fields.getTextInputValue('weight_memo') || '';
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    try {
        // バリデーション
        const weight = parseFloat(weightValue);
        if (isNaN(weight) || weight <= 0 || weight > 300) {
            await interaction.reply({ 
                content: '❌ 有効な体重を入力してください（0-300kg）。', 
                flags: 64 
            });
            return;
        }
        
        // 入力をサニタイズ
        const sanitizedMemo = validation ? validation.sanitizeInput(memo) : memo.trim();
        
        // 前回の記録を取得
        let previousEntry = null;
        try {
            previousEntry = await sheetsUtils.getLatestWeightEntry(userId);
        } catch (entryError) {
            console.error('前回記録取得エラー:', entryError);
        }
        
        // 体重記録を保存
        await sheetsUtils.saveWeightToSheet(userId, today, weight, sanitizedMemo);
        
        // 前回比計算
        let comparisonText = '';
        if (previousEntry && previousEntry.weight) {
            const previousWeight = parseFloat(previousEntry.weight);
            const change = weight - previousWeight;
            if (change > 0) {
                comparisonText = `前回比: +${change.toFixed(1)}kg`;
            } else if (change < 0) {
                comparisonText = `前回比: ${change.toFixed(1)}kg`;
            } else {
                comparisonText = '前回比: 変化なし';
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle('⚖️ 体重を記録しました')
            .setDescription(`**${weight}kg** ${comparisonText}`)
            .addFields(
                { name: '日付', value: today, inline: true },
                { name: 'メモ', value: sanitizedMemo || 'なし', inline: true }
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('体重記録保存エラー:', error);
        await interaction.reply({ content: '体重の記録中にエラーが発生しました。', flags: 64 });
    }
}

// 🌅 朝の通知専用のヘルパー関数 - 新追加

// 起床時の朝の通知セットを送信
async function sendMorningNotifications(channel, userId) {
    console.log(`🌅 朝の通知セット送信: ${userId}`);
    
    try {
        // 1. Who Am I リマインダー
        const whoAmIEmbed = new EmbedBuilder()
            .setTitle('🌟 おはようございます！')
            .setDescription(`<@${userId}> 新しい一日の始まりです！`)
            .addFields(
                { name: '💭 今日の自分', value: 'Who Am I で今日の気持ちや目標を確認しましょう', inline: false }
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

        await channel.send({ embeds: [whoAmIEmbed], components: [whoAmIRow] });
        
        // 少し間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 2. 体重記録リマインダー
        const weightEmbed = new EmbedBuilder()
            .setTitle('⚖️ 朝の体重測定')
            .setDescription(`<@${userId}> 今日の体重を記録しましょう！`)
            .addFields(
                { name: '📊 継続の力', value: '毎日の記録が変化を可視化します', inline: true },
                { name: '💡 ヒント', value: '起床後の測定がおすすめです', inline: true }
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
        
        console.log(`✅ 朝の通知セット送信完了: ${userId}`);
        
    } catch (error) {
        console.error('朝の通知送信エラー:', error);
    }
}

module.exports = {
    handleInteraction,
    showMoodSelector,
    showDiaryModalWithMood,
    saveDiaryEntry,
    showHabitAddModal,
    saveNewHabit,
    showQuickDoneMenu,
    handleQuickDone,
    handleWeeklyGoalSetting,  // 新規追加
    handleWeightRecord,       // 新規追加
    saveWeeklyGoal,          // 新規追加
    saveWeightRecord,        // 新規追加
    sendMorningNotifications, // 🌅 新規追加
    getDifficultyEmoji       // ヘルパー関数
};
