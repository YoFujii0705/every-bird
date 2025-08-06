const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');
const calculations = require('../utils/calculations');
const validation = require('../utils/validation');
const config = require('../config.json');

function createCommand() {
    return new SlashCommandBuilder()
        .setName('habit')
        .setDescription('習慣管理機能')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('新しい習慣を追加')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('習慣一覧を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('done')
                .setDescription('習慣を完了としてマーク')
                .addStringOption(option =>
                    option.setName('habit_name')
                        .setDescription('完了する習慣名（省略時は選択メニュー表示）')
                        .setRequired(false)
                        .setMaxLength(50)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('習慣の統計を表示')
                .addStringOption(option =>
                    option.setName('habit_name')
                        .setDescription('特定の習慣名（省略時は全習慣の統計）')
                        .setRequired(false)
                        .setMaxLength(50)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('calendar')
                .setDescription('習慣の達成状況をカレンダーで表示')
                .addStringOption(option =>
                    option.setName('habit_name')
                        .setDescription('特定の習慣名（省略時は全習慣）')
                        .setRequired(false)
                        .setMaxLength(50)
                )
                .addIntegerOption(option =>
                    option.setName('month')
                        .setDescription('月（1-12、省略時は今月）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('年（省略時は今年）')
                        .setRequired(false)
                        .setMinValue(2020)
                        .setMaxValue(new Date().getFullYear() + 10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('習慣を編集')
                .addStringOption(option =>
                    option.setName('habit_name')
                        .setDescription('編集する習慣名（省略時は選択メニュー表示）')
                        .setRequired(false)
                        .setMaxLength(50)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('習慣を削除')
                .addStringOption(option =>
                    option.setName('habit_name')
                        .setDescription('削除する習慣名（省略時は選択メニュー表示）')
                        .setRequired(false)
                        .setMaxLength(50)
                )
        )
        
        // 🔔 通知機能のサブコマンドグループを追加
        .addSubcommandGroup(group =>
            group
                .setName('notify')
                .setDescription('🔔 習慣の通知設定')
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('reminder')
                        .setDescription('⏰ 習慣の実行リマインダーを設定')
                        .addStringOption(option =>
                            option
                                .setName('time')
                                .setDescription('通知時刻（例: 07:00）')
                                .setRequired(true))
                        .addStringOption(option =>
                            option
                                .setName('habit_name')
                                .setDescription('習慣名（省略時は全習慣）')
                                .setRequired(false))
                        .addStringOption(option =>
                            option
                                .setName('days')
                                .setDescription('曜日（例: 1,2,3,4,5 = 月-金）')
                                .setRequired(false))
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('通知先チャンネル（未指定の場合は現在のチャンネル）')
                                .setRequired(false)))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('monthly')
                        .setDescription('📅 月末カレンダーサマリーを設定')
                        .addBooleanOption(option =>
                            option
                                .setName('enabled')
                                .setDescription('有効/無効（デフォルト: true）')
                                .setRequired(false))
                        .addStringOption(option =>
                            option
                                .setName('time')
                                .setDescription('通知時刻（例: 21:00）')
                                .setRequired(false))
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('通知先チャンネル')
                                .setRequired(false)))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('milestone')
                        .setDescription('🏆 ストリーク達成時の通知を設定')
                        .addStringOption(option =>
                            option
                                .setName('habit_name')
                                .setDescription('習慣名')
                                .setRequired(true))
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('通知先チャンネル')
                                .setRequired(false)))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('alert')
                        .setDescription('⚠️ 継続率低下アラートを設定')
                        .addStringOption(option =>
                            option
                                .setName('habit_name')
                                .setDescription('習慣名')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option
                                .setName('threshold_days')
                                .setDescription('チェック期間（日数）')
                                .setRequired(false))
                        .addIntegerOption(option =>
                            option
                                .setName('threshold_count')
                                .setDescription('最低実行回数')
                                .setRequired(false))
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('通知先チャンネル')
                                .setRequired(false)))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('📋 設定済みの通知一覧'))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('disable')
                        .setDescription('🔕 通知を無効化')
                        .addIntegerOption(option =>
                            option
                                .setName('notification_id')
                                .setDescription('通知ID')
                                .setRequired(true)))
                
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('test')
                        .setDescription('🧪 通知をテスト送信')
                        .addIntegerOption(option =>
                            option
                                .setName('notification_id')
                                .setDescription('通知ID')
                                .setRequired(true)))
        );
}


async function handleCommand(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();
    
    // 通知グループの処理を追加
    if (group === 'notify') {
        // グローバルに設定されたhabitNotificationsHandlerを使用
        if (global.habitNotificationsHandler) {
            return await global.habitNotificationsHandler.handleHabitNotifyCommand(interaction);
        } else {
            return await interaction.reply({
                content: '❌ 習慣通知機能が初期化されていません。管理者に問い合わせてください。',
                ephemeral: true
            });
        }
    }
    
    // 既存のサブコマンド処理
    switch (subcommand) {
        case 'add':
            await handleHabitAdd(interaction);
            break;
        case 'list':
            await handleHabitList(interaction);
            break;
        case 'done':
            await handleHabitDone(interaction);
            break;
        case 'stats':
            await handleHabitStats(interaction);
            break;
        case 'calendar':
            await handleHabitCalendar(interaction);
            break;
        case 'edit':
            await handleHabitEdit(interaction);
            break;
        case 'delete':
            await handleHabitDelete(interaction);
            break;
        default:
            await interaction.reply({ content: 'この機能は開発中です。', ephemeral: true });
    }
}

// 習慣追加処理
async function handleHabitAdd(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('➕ 新しい習慣を追加')
        .setDescription('追加したい習慣の情報を入力してください')
        .addFields(
            { name: '📝 習慣名', value: '例: 朝の散歩、読書、筋トレ', inline: false },
            { name: '📅 頻度', value: '• daily (毎日)\n• weekly (週に数回)\n• custom (カスタム)', inline: true },
            { name: '⚡ 難易度', value: '• easy (簡単) 🟢\n• normal (普通) 🟡\n• hard (難しい) 🔴', inline: true }
        )
        .setColor(0x00AE86);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('add_habit')
                .setLabel('習慣を追加')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕')
        );

    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣一覧表示
async function handleHabitList(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    
    if (habits.length === 0) {
        await interaction.reply({ 
            content: '登録された習慣がありません。`/habit add` で習慣を追加してください。', 
            ephemeral: true 
        });
        return;
    }
    
    const today = moment().format('YYYY-MM-DD');
    const todayLogs = await sheetsUtils.getHabitLogsForDate(userId, today);
    
    const embed = new EmbedBuilder()
        .setTitle('📋 あなたの習慣一覧')
        .setDescription(`${today} の状況`)
        .setColor(0x00AE86);
    
    habits.forEach(habit => {
        const isDone = todayLogs.some(log => log.habitId === habit.id);
        const statusEmoji = isDone ? '✅' : '⭕';
        const streakInfo = `${habit.currentStreak || 0}日連続`;
        
        embed.addFields({
            name: `${statusEmoji} ${habit.name}`,
            value: `頻度: ${config.habit_frequencies[habit.frequency]} | 難易度: ${config.habit_difficulties[habit.difficulty]?.emoji || '❓'} | ${streakInfo}`,
            inline: false
        });
    });
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('quick_done')
                .setLabel('クイック完了')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣完了処理（完全版）
async function handleHabitDone(interaction) {
    const habitName = interaction.options.getString('habit_name');
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    try {
        if (habitName) {
            // 特定の習慣を完了
            const habit = await sheetsUtils.getHabitByName(userId, habitName);
            if (!habit) {
                await interaction.reply({ 
                    content: `習慣「${habitName}」が見つかりません。`, 
                    ephemeral: true 
                });
                return;
            }
            
            // 既に今日完了しているかチェック
            const todayLogs = await sheetsUtils.getHabitLogsForDate(userId, today);
            const alreadyDone = todayLogs.some(log => log.habitId === habit.id);
            
            if (alreadyDone) {
                await interaction.reply({ 
                    content: `「${habit.name}」は今日既に完了済みです！`, 
                    ephemeral: true 
                });
                return;
            }
            
            // 習慣を完了
            await sheetsUtils.saveHabitLog(userId, habit.id, today);
            const newStreak = await sheetsUtils.updateHabitStreak(userId, habit.id);
            
            // 獲得ポイント計算
            const points = config.habit_difficulties[habit.difficulty]?.points || 1;
            
            const embed = new EmbedBuilder()
                .setTitle('✅ 習慣完了！')
                .setDescription(`**${habit.name}** を完了しました！`)
                .addFields(
                    { name: '🔥 現在のストリーク', value: `${newStreak}日連続`, inline: true },
                    { name: '🎯 獲得ポイント', value: `${points}pts`, inline: true },
                    { name: '📅 実行日', value: today, inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();
            
            // ストリークに応じたメッセージ
            let celebrationMessage = '';
            if (newStreak === 1) celebrationMessage = '素晴らしいスタートです！';
            else if (newStreak === 7) celebrationMessage = '🎉 1週間達成！継続力が身についてきました！';
            else if (newStreak === 30) celebrationMessage = '🏆 1ヶ月達成！素晴らしい習慣が身につきました！';
            else if (newStreak === 100) celebrationMessage = '🌟 100日達成！驚異的な継続力です！';
            else if (newStreak % 10 === 0) celebrationMessage = `🎊 ${newStreak}日達成！継続は力なりです！`;
            
            if (celebrationMessage) {
                embed.addFields({ name: '🎉 お祝い', value: celebrationMessage, inline: false });
            }
            
            await interaction.reply({ embeds: [embed] });
            
        } else {
            // 習慣選択のためのセレクトメニューを表示
            await showHabitDoneSelector(interaction);
        }
        
    } catch (error) {
        console.error('習慣完了エラー:', error);
        await interaction.reply({ 
            content: '習慣の完了中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 習慣完了選択メニューの表示
async function showHabitDoneSelector(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    const today = moment().format('YYYY-MM-DD');
    const todayLogs = await sheetsUtils.getHabitLogsForDate(userId, today);
    
    // 未完了の習慣のみ表示
    const pendingHabits = habits.filter(habit => 
        !todayLogs.some(log => log.habitId === habit.id)
    );
    
    if (pendingHabits.length === 0) {
        await interaction.reply({ 
            content: '🎉 今日の習慣は全て完了しています！お疲れさまでした。', 
            ephemeral: true 
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('✅ 完了する習慣を選択')
        .setDescription('今日完了した習慣を選んでください')
        .setColor(0x00AE86);
    
    // 未完了の習慣一覧を表示
    pendingHabits.forEach(habit => {
        const difficultyEmoji = config.habit_difficulties[habit.difficulty]?.emoji || '❓';
        const points = config.habit_difficulties[habit.difficulty]?.points || 1;
        
        embed.addFields({
            name: `${difficultyEmoji} ${habit.name}`,
            value: `難易度: ${config.habit_difficulties[habit.difficulty]?.name || '不明'} (${points}pts)`,
            inline: true
        });
    });
    
    // セレクトメニューを作成（最大25個まで）
    const options = pendingHabits.slice(0, 25).map(habit => ({
        label: habit.name,
        description: `${config.habit_difficulties[habit.difficulty]?.name || '不明'} - ${config.habit_difficulties[habit.difficulty]?.points || 1}pts`,
        value: habit.id,
        emoji: config.habit_difficulties[habit.difficulty]?.emoji || '❓'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('habit_done_select')
        .setPlaceholder('完了した習慣を選択...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣統計表示（完全版）
async function handleHabitStats(interaction) {
    const userId = interaction.user.id;
    const habitName = interaction.options.getString('habit_name');
    
    try {
        let habits;
        if (habitName) {
            const habit = await sheetsUtils.getHabitByName(userId, habitName);
            habits = habit ? [habit] : [];
        } else {
            habits = await sheetsUtils.getUserHabits(userId);
        }
        
        if (habits.length === 0) {
            await interaction.reply({ 
                content: habitName ? 
                    `習慣「${habitName}」が見つかりません。` : 
                    '登録された習慣がありません。まず `/habit add` で習慣を追加してください。',
                ephemeral: true 
            });
            return;
        }
        
        // 統計期間（過去30日）
        const endDate = moment().format('YYYY-MM-DD');
        const startDate = moment().subtract(29, 'days').format('YYYY-MM-DD');
        
        // 習慣ログを取得
        const habitLogs = await sheetsUtils.getHabitLogsInRange(userId, startDate, endDate);
        
        if (habitName) {
            // 特定習慣の詳細統計
            await showSingleHabitStats(interaction, habits[0], habitLogs, startDate, endDate);
        } else {
            // 全習慣の統計サマリー
            await showAllHabitsStats(interaction, habits, habitLogs, startDate, endDate);
        }
        
    } catch (error) {
        console.error('習慣統計エラー:', error);
        await interaction.reply({ content: '統計の取得中にエラーが発生しました。', ephemeral: true });
    }
}

// handleHabitCalendar 関数の完全修正版
async function handleHabitCalendar(interaction) {
    const userId = interaction.user.id;
    
    try {
        await interaction.deferReply();
        
        // 🔍 年月の取得とデフォルト値設定
        let year = interaction.options.getInteger('year');
        let month = interaction.options.getInteger('month');
        const habitName = interaction.options.getString('habit');
        
        // 現在の日付をデフォルトとして使用
        const now = new Date();
        if (!year) {
            year = now.getFullYear();
        }
        if (!month) {
            month = now.getMonth() + 1; // getMonth()は0ベースなので+1
        }
        
        console.log('📅 カレンダー生成パラメータ:', { userId: userId.substring(0, 6) + '...', year, month, habitName });
        
        // 入力値検証
       const currentYear = new Date().getFullYear();
const minYear = 2020;
const maxYear = currentYear + 10;

if (year < minYear || year > maxYear) {
    return await interaction.editReply({
        content: `❌ 年は${minYear}〜${maxYear}の間で指定してください。\n現在は${currentYear}年です。`
    });
}
        
        if (month < 1 || month > 12) {
            return await interaction.editReply({
                content: '❌ 月は1〜12の間で指定してください。'
            });
        }
        
        // 🔍 sheetsUtils を正しく取得
        const sheetsUtils = require('../utils/sheets');
        const calculations = require('../utils/calculations');
        
        console.log('🔍 依存関係確認:', {
            sheetsUtils: !!sheetsUtils,
            calculations: !!calculations,
            getUserHabits: typeof sheetsUtils.getUserHabits
        });
        
        // カレンダー生成
        const calendar = await calculations.generateHabitCalendar(
            userId, 
            year, 
            month, 
            sheetsUtils,
            habitName
        );
        
        // カレンダー表示
        const embed = new EmbedBuilder()
            .setTitle(`📅 ${year}年${month}月の習慣カレンダー`)
            .setDescription(calendar.description)
            .addFields({
                name: 'カレンダー',
                value: calendar.display,
                inline: false
            })
            .addFields({
                name: '凡例',
                value: '✅ 完了　🔶 一部完了　📝 日記のみ　⭕ 未完了',
                inline: false
            })
            .setColor('#4CAF50')
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('カレンダー表示エラー:', error);
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ カレンダーの表示中にエラーが発生しました。'
                });
            } else {
                await interaction.reply({
                    content: '❌ カレンダーの表示中にエラーが発生しました。',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            console.error('エラー応答送信失敗:', replyError);
        }
    }
}

// 習慣編集処理（完全版）
async function handleHabitEdit(interaction) {
    const habitName = interaction.options.getString('habit_name');
    const userId = interaction.user.id;
    
    try {
        if (habitName) {
            // 特定の習慣を編集
            const habit = await sheetsUtils.getHabitByName(userId, habitName);
            if (!habit) {
                await interaction.reply({ 
                    content: `習慣「${habitName}」が見つかりません。`, 
                    ephemeral: true 
                });
                return;
            }
            
            await showHabitEditModal(interaction, habit);
            
        } else {
            // 編集する習慣を選択
            await showHabitEditSelector(interaction);
        }
        
    } catch (error) {
        console.error('習慣編集エラー:', error);
        await interaction.reply({ 
            content: '習慣の編集中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 習慣削除処理（完全版）
async function handleHabitDelete(interaction) {
    const habitName = interaction.options.getString('habit_name');
    const userId = interaction.user.id;
    
    try {
        if (habitName) {
            // 特定の習慣を削除
            const habit = await sheetsUtils.getHabitByName(userId, habitName);
            if (!habit) {
                await interaction.reply({ 
                    content: `習慣「${habitName}」が見つかりません。`, 
                    ephemeral: true 
                });
                return;
            }
            
            await showHabitDeleteConfirmation(interaction, habit);
            
        } else {
            // 削除する習慣を選択
            await showHabitDeleteSelector(interaction);
        }
        
    } catch (error) {
        console.error('習慣削除エラー:', error);
        await interaction.reply({ 
            content: '習慣の削除中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// ===== セレクトメニュー処理関数 =====

// 習慣完了選択処理
async function handleHabitDoneSelect(interaction) {
    const habitId = interaction.values[0];
    const userId = interaction.user.id;
    const today = moment().format('YYYY-MM-DD');
    
    try {
        const habit = await sheetsUtils.getHabitById(habitId);
        if (!habit) {
            await interaction.update({ 
                content: '習慣が見つかりません。',
                embeds: [],
                components: []
            });
            return;
        }
        
        // 習慣を完了
        await sheetsUtils.saveHabitLog(userId, habit.id, today);
        const newStreak = await sheetsUtils.updateHabitStreak(userId, habit.id);
        
        // 獲得ポイント計算
        const points = config.habit_difficulties[habit.difficulty]?.points || 1;
        
        const embed = new EmbedBuilder()
            .setTitle('✅ 習慣完了！')
            .setDescription(`**${habit.name}** を完了しました！`)
            .addFields(
                { name: '🔥 現在のストリーク', value: `${newStreak}日連続`, inline: true },
                { name: '🎯 獲得ポイント', value: `${points}pts`, inline: true },
                { name: '📅 実行日', value: today, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [] });
        
    } catch (error) {
        console.error('習慣完了選択エラー:', error);
        await interaction.update({ 
            content: '習慣の完了中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// 習慣編集選択処理
async function handleHabitEditSelect(interaction) {
    const habitId = interaction.values[0];
    
    try {
        const habit = await sheetsUtils.getHabitById(habitId);
        if (!habit) {
            await interaction.update({ 
                content: '習慣が見つかりません。',
                embeds: [],
                components: []
            });
            return;
        }
        
        await showHabitEditModal(interaction, habit);
        
    } catch (error) {
        console.error('習慣編集選択エラー:', error);
        await interaction.update({ 
            content: '習慣の編集中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// 習慣削除選択処理
async function handleHabitDeleteSelect(interaction) {
    const habitId = interaction.values[0];
    
    try {
        const habit = await sheetsUtils.getHabitById(habitId);
        if (!habit) {
            await interaction.update({ 
                content: '習慣が見つかりません。',
                embeds: [],
                components: []
            });
            return;
        }
        
        await showHabitDeleteConfirmation(interaction, habit);
        
    } catch (error) {
        console.error('習慣削除選択エラー:', error);
        await interaction.update({ 
            content: '習慣の削除中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// ===== モーダル・UI表示関数 =====

// 習慣編集選択メニューの表示
async function showHabitEditSelector(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    
    if (habits.length === 0) {
        await interaction.reply({ 
            content: '編集できる習慣がありません。', 
            ephemeral: true 
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('✏️ 編集する習慣を選択')
        .setDescription('編集したい習慣を選んでください')
        .setColor(0xFFA500);
    
    // セレクトメニューを作成
    const options = habits.slice(0, 25).map(habit => ({
        label: habit.name,
        description: `${config.habit_frequencies[habit.frequency]} - ${config.habit_difficulties[habit.difficulty]?.name || '不明'}`,
        value: habit.id,
        emoji: config.habit_difficulties[habit.difficulty]?.emoji || '❓'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('habit_edit_select')
        .setPlaceholder('編集する習慣を選択...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣編集モーダルの表示
async function showHabitEditModal(interaction, habit) {
    const modal = new ModalBuilder()
        .setCustomId(`habit_edit_modal_${habit.id}`)
        .setTitle(`「${habit.name}」を編集`);

    const nameInput = new TextInputBuilder()
        .setCustomId('habit_name')
        .setLabel('習慣名')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.name)
        .setRequired(true)
        .setMaxLength(50);

    const frequencyInput = new TextInputBuilder()
        .setCustomId('habit_frequency')
        .setLabel('頻度 (daily, weekly, custom)')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.frequency)
        .setRequired(true)
        .setMaxLength(10);

    const difficultyInput = new TextInputBuilder()
        .setCustomId('habit_difficulty')
        .setLabel('難易度 (easy, normal, hard)')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.difficulty)
        .setRequired(true)
        .setMaxLength(10);

    const nameRow = new ActionRowBuilder().addComponents(nameInput);
    const frequencyRow = new ActionRowBuilder().addComponents(frequencyInput);
    const difficultyRow = new ActionRowBuilder().addComponents(difficultyInput);

    modal.addComponents(nameRow, frequencyRow, difficultyRow);
    
    await interaction.showModal(modal);
}

// 習慣削除選択メニューの表示
async function showHabitDeleteSelector(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    
    if (habits.length === 0) {
        await interaction.reply({ 
            content: '削除できる習慣がありません。', 
            ephemeral: true 
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🗑️ 削除する習慣を選択')
        .setDescription('⚠️ 削除した習慣は復元できません。慎重に選択してください。')
        .setColor(0xFF4444);
    
    // セレクトメニューを作成
    const options = habits.slice(0, 25).map(habit => ({
        label: habit.name,
        description: `ストリーク: ${habit.currentStreak || 0}日 - ${config.habit_difficulties[habit.difficulty]?.name || '不明'}`,
        value: habit.id,
        emoji: '🗑️'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('habit_delete_select')
        .setPlaceholder('削除する習慣を選択...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣削除確認の表示
async function showHabitDeleteConfirmation(interaction, habit) {
    const embed = new EmbedBuilder()
        .setTitle('🗑️ 習慣削除の確認')
        .setDescription(`**${habit.name}** を削除しますか？`)
        .addFields(
            { name: '⚠️ 注意', value: '削除すると以下のデータが失われます：', inline: false },
            { name: '📊 ストリーク', value: `${habit.currentStreak || 0}日連続`, inline: true },
            { name: '📅 頻度', value: config.habit_frequencies[habit.frequency], inline: true },
            { name: '⚡ 難易度', value: config.habit_difficulties[habit.difficulty]?.name || '不明', inline: true },
            { name: '🔄 復元', value: '削除した習慣は復元できません', inline: false }
        )
        .setColor(0xFF4444)
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`habit_delete_confirm_${habit.id}`)
                .setLabel('削除する')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('habit_delete_cancel')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
        );
    
    await interaction.update({ embeds: [embed], components: [row] });
}

// ===== 編集・削除処理関数 =====

// 習慣編集の保存処理
async function saveHabitEdit(interaction, habitId) {
    const name = interaction.fields.getTextInputValue('habit_name');
    const frequency = interaction.fields.getTextInputValue('habit_frequency');
    const difficulty = interaction.fields.getTextInputValue('habit_difficulty');
    const userId = interaction.user.id;
    
    try {
        // バリデーション
        const habitData = { name, frequency, difficulty };
        const validationResult = validation.validateHabitData(habitData);
        
        if (!validationResult.isValid) {
            await interaction.reply({ 
                content: `❌ 入力エラー:\n${validationResult.errors.join('\n')}`, 
                ephemeral: true 
            });
            return;
        }
        
        // 既存習慣との重複チェック（自分自身は除外）
        const existingHabits = await sheetsUtils.getUserHabits(userId);
        const otherHabits = existingHabits.filter(h => h.id !== habitId);
        if (!validation.validateUniqueHabitName(name, otherHabits)) {
            await interaction.reply({ 
                content: '❌ 同じ名前の習慣が既に存在します。', 
                ephemeral: true 
            });
            return;
        }
        
        // 習慣を更新
        const success = await sheetsUtils.updateHabit(habitId, name, frequency, difficulty);
        
        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ 習慣を更新しました')
                .addFields(
                    { name: '習慣名', value: name, inline: true },
                    { name: '頻度', value: config.habit_frequencies[frequency], inline: true },
                    { name: '難易度', value: `${config.habit_difficulties[difficulty]?.emoji || '❓'} ${config.habit_difficulties[difficulty]?.name || '不明'}`, inline: true }
                )
                .setColor(0x00AE86)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ 
                content: '習慣の更新に失敗しました。', 
                ephemeral: true 
            });
        }
        
    } catch (error) {
        console.error('習慣編集保存エラー:', error);
        await interaction.reply({ 
            content: '習慣の更新中にエラーが発生しました。', 
            ephemeral: true 
        });
    }
}

// 習慣削除の実行
async function executeHabitDelete(interaction, habitId) {
    try {
        const habit = await sheetsUtils.getHabitById(habitId);
        if (!habit) {
            await interaction.update({ 
                content: '習慣が見つかりません。',
                embeds: [],
                components: []
            });
            return;
        }
        
        const success = await sheetsUtils.deleteHabit(habitId);
        
        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('🗑️ 習慣を削除しました')
                .setDescription(`「${habit.name}」を削除しました。`)
                .addFields(
                    { name: '削除された習慣', value: habit.name, inline: true },
                    { name: '最終ストリーク', value: `${habit.currentStreak || 0}日`, inline: true }
                )
                .setColor(0xFF4444)
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            await interaction.update({ 
                content: '習慣の削除に失敗しました。',
                embeds: [],
                components: []
            });
        }
        
    } catch (error) {
        console.error('習慣削除実行エラー:', error);
        await interaction.update({ 
            content: '習慣の削除中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// ===== 統計・分析関数 =====

// 特定習慣の詳細統計
async function showSingleHabitStats(interaction, habit, allLogs, startDate, endDate) {
    const habitLogs = allLogs.filter(log => log.habitId === habit.id);
    
    // 基本統計
    const totalDays = 30;
    const completedDays = habitLogs.length;
    const completionRate = ((completedDays / totalDays) * 100).toFixed(1);
    
    // ストリーク計算
    const currentStreak = await calculations.calculateCurrentStreak(interaction.user.id, habit.id);
    const bestStreak = await calculations.calculateBestStreak(interaction.user.id, habit.id);
    
    // 週次統計
    const weeklyStats = calculateWeeklyProgress(habitLogs, startDate, endDate);
    
    // 獲得ポイント計算
    const difficultyPoints = config.habit_difficulties[habit.difficulty]?.points || 1;
    const totalPoints = completedDays * difficultyPoints;
    
    // 最近の実行パターン分析
    const recentPattern = analyzeRecentPattern(habitLogs);
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 ${habit.name} の統計（過去30日間）`)
        .addFields(
            { 
                name: '📈 基本統計', 
                value: `完了日数: ${completedDays}/${totalDays}日\n達成率: ${completionRate}%\n現在のストリーク: ${currentStreak}日 🔥\n最高ストリーク: ${bestStreak}日 ⭐`, 
                inline: false 
            },
            { 
                name: '📅 週次進捗', 
                value: weeklyStats, 
                inline: false 
            },
            { 
                name: '🎯 パフォーマンス', 
                value: `獲得ポイント: ${totalPoints}pts\n平均週間達成: ${(completedDays / 4.3).toFixed(1)}日\n習慣の難易度: ${config.habit_difficulties[habit.difficulty]?.emoji || '❓'} ${config.habit_difficulties[habit.difficulty]?.name || '不明'}`, 
                inline: false 
            }
        )
        .setColor(getStreakColor(currentStreak))
        .setTimestamp();
    
    // パフォーマンス評価
    let performance = '';
    if (completionRate >= 90) performance = '🏆 素晴らしい！継続力が抜群です';
    else if (completionRate >= 75) performance = '🎉 とても良い！安定した習慣になっています';
    else if (completionRate >= 50) performance = '👍 順調です。この調子で続けましょう';
    else if (completionRate >= 25) performance = '💪 改善の余地があります。小さな工夫を試してみましょう';
    else performance = '🔄 新しいアプローチを検討してみませんか？';
    
    embed.addFields({ name: '📝 評価', value: performance, inline: false });
    
    // 最近のパターン分析
    if (recentPattern) {
        embed.addFields({ name: '🔍 最近のパターン', value: recentPattern, inline: false });
    }
    
    // カレンダー表示も追加
    try {
        const calendar = await calculations.generateHabitCalendar(
            interaction.user.id, 
            moment().year(), 
            moment().month() + 1, 
            habit.name
        );
        
        if (calendar.display !== 'データがありません。') {
            embed.addFields({ name: '📅 今月のカレンダー', value: calendar.display, inline: false });
        }
    } catch (calendarError) {
        console.error('カレンダー生成エラー:', calendarError);
        // カレンダーエラーは統計表示を妨げない
    }
    
    await interaction.reply({ embeds: [embed] });
}

// 全習慣の統計サマリー
async function showAllHabitsStats(interaction, habits, habitLogs, startDate, endDate) {
    const totalDays = 30;
    
    // 全体統計
    const activeDays = Array.from(new Set(habitLogs.map(log => log.date))).length;
    const totalCompletions = habitLogs.length;
    const overallRate = habits.length > 0 ? ((totalCompletions / (habits.length * totalDays)) * 100).toFixed(1) : 0;
    
    // 習慣別統計
    const habitStats = habits.map(habit => {
        const logs = habitLogs.filter(log => log.habitId === habit.id);
        const rate = ((logs.length / totalDays) * 100).toFixed(0);
        const points = logs.length * (config.habit_difficulties[habit.difficulty]?.points || 1);
        
        return {
            name: habit.name,
            rate: parseInt(rate),
            points: points,
            logs: logs.length,
            difficulty: habit.difficulty
        };
    }).sort((a, b) => b.rate - a.rate);
    
    // 総獲得ポイント
    const totalPoints = habitStats.reduce((sum, stat) => sum + stat.points, 0);
    
    const embed = new EmbedBuilder()
        .setTitle('📊 全習慣統計（過去30日間）')
        .addFields(
            { 
                name: '🌟 全体サマリー', 
                value: `登録習慣数: ${habits.length}個\n活動日数: ${activeDays}/${totalDays}日\n総完了回数: ${totalCompletions}回\n全体達成率: ${overallRate}%\n総獲得ポイント: ${totalPoints}pts`, 
                inline: false 
            }
        )
        .setColor(0x00AE86)
        .setTimestamp();
    
    // 習慣別詳細（全て表示、ランキングなし）
    if (habitStats.length > 0) {
        const habitDetails = habitStats.map(stat => {
            const difficultyEmoji = config.habit_difficulties[stat.difficulty]?.emoji || '❓';
            return `${difficultyEmoji} **${stat.name}**: ${stat.rate}% (${stat.logs}/${totalDays}日) - ${stat.points}pts`;
        }).join('\n');
        
        embed.addFields({ name: '📋 習慣別達成状況', value: habitDetails, inline: false });
    }
    
    // 週次トレンド
    const weeklyTrend = calculateOverallWeeklyTrend(habitLogs, startDate);
    embed.addFields({ name: '📈 週次トレンド', value: weeklyTrend, inline: false });
    
    // パフォーマンス評価とアドバイス
    let overallPerformance = '';
    let advice = '';
    
    if (overallRate >= 80) {
        overallPerformance = '🏆 優秀！全習慣を安定維持';
        advice = '素晴らしい継続力です。新しい習慣にチャレンジしてみませんか？';
    } else if (overallRate >= 60) {
        overallPerformance = '🎉 良好！継続できています';
        advice = '順調な成長です。達成率の低い習慣に注目してみましょう。';
    } else if (overallRate >= 40) {
        overallPerformance = '👍 順調！もう少し頑張りましょう';
        advice = '習慣の数を減らすか、実行しやすい時間帯を見つけてみましょう。';
    } else if (overallRate >= 20) {
        overallPerformance = '💪 改善の余地あり';
        advice = '小さな習慣から始めて、確実に継続できるパターンを作りましょう。';
    } else {
        overallPerformance = '🔄 新しいスタートを切りましょう';
        advice = '習慣を1つに絞って、まずは1週間の継続を目指してみましょう。';
    }
    
    embed.addFields(
        { name: '📝 総合評価', value: overallPerformance, inline: false },
        { name: '💡 改善アドバイス', value: advice, inline: false }
    );
    
    await interaction.reply({ embeds: [embed] });
}

// ===== カレンダー関数 =====

// 月次統計の計算
async function calculateMonthStats(userId, year, month, habits, specificHabitName) {
    const startDate = moment(`${year}-${month}-01`);
    const endDate = startDate.clone().endOf('month');
    const daysInMonth = endDate.date();
    
    // 該当月の習慣ログを取得
    const habitLogs = await sheetsUtils.getHabitLogsInRange(
        userId, 
        startDate.format('YYYY-MM-DD'), 
        endDate.format('YYYY-MM-DD')
    );
    
    if (specificHabitName) {
        // 特定習慣の統計
        const habit = habits[0];
        const habitSpecificLogs = habitLogs.filter(log => log.habitId === habit.id);
        const completedDays = habitSpecificLogs.length;
        const completionRate = ((completedDays / daysInMonth) * 100).toFixed(1);
        
        // 連続達成記録の計算
        const consecutiveRecord = calculateMonthlyConsecutive(habitSpecificLogs, startDate, endDate);
        
        // ポイント計算
        const points = completedDays * (config.habit_difficulties[habit.difficulty]?.points || 1);
        
        return `**${habit.name}**\n` +
               `完了日数: ${completedDays}/${daysInMonth}日\n` +
               `達成率: ${completionRate}%\n` +
               `最長連続: ${consecutiveRecord}日\n` +
               `獲得ポイント: ${points}pts`;
    } else {
        // 全習慣の統計
        const activeDays = Array.from(new Set(habitLogs.map(log => log.date))).length;
        const totalCompletions = habitLogs.length;
        const averagePerDay = daysInMonth > 0 ? (totalCompletions / daysInMonth).toFixed(1) : 0;
        
        // 習慣別の簡易統計
        const habitSummary = habits.map(habit => {
            const logs = habitLogs.filter(log => log.habitId === habit.id);
            const rate = ((logs.length / daysInMonth) * 100).toFixed(0);
            return `${habit.name}: ${rate}%`;
        }).join('\n');
        
        return `**全習慣サマリー**\n` +
               `活動日数: ${activeDays}/${daysInMonth}日\n` +
               `総実行回数: ${totalCompletions}回\n` +
               `1日平均: ${averagePerDay}回\n\n` +
               `**習慣別達成率**\n${habitSummary}`;
    }
}

// カレンダーナビゲーション処理
async function handleCalendarNavigation(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    
    if (parts[1] === 'nav') {
        // calendar_nav_2025_7_all または calendar_nav_2025_7_朝の散歩
        const year = parseInt(parts[2]);
        const month = parseInt(parts[3]);
        const habitName = parts.slice(4).join('_');
        const realHabitName = habitName === 'all' ? null : habitName;
        
        // 新しいカレンダーを生成
        await showCalendarForMonth(interaction, year, month, realHabitName);
        
    } else if (parts[1] === 'today') {
        // calendar_today_all または calendar_today_朝の散歩
        const habitName = parts.slice(2).join('_');
        const realHabitName = habitName === 'all' ? null : habitName;
        const today = moment();
        
        await showCalendarForMonth(interaction, today.year(), today.month() + 1, realHabitName);
    }
}

// 指定月のカレンダーを表示
async function showCalendarForMonth(interaction, year, month, habitName) {
    const userId = interaction.user.id;
    
    try {
        let habits;
        if (habitName) {
            const habit = await sheetsUtils.getHabitByName(userId, habitName);
            habits = habit ? [habit] : [];
        } else {
            habits = await sheetsUtils.getUserHabits(userId);
        }
        
        if (habits.length === 0) {
            await interaction.update({ 
                content: '習慣が見つかりません。',
                embeds: [],
                components: []
            });
            return;
        }
        
        // カレンダーデータを生成
        const calendar = await calculations.generateHabitCalendar(
            userId, 
            year, 
            month, 
            habitName
        );
        
        // 統計の計算
        const monthStats = await calculateMonthStats(userId, year, month, habits, habitName);
        
        const embed = new EmbedBuilder()
            .setTitle(`📅 ${year}年${month}月のカレンダー`)
            .setDescription(calendar.description)
            .addFields(
                { name: '📊 今月の統計', value: monthStats, inline: false },
                { name: '🗓️ カレンダー', value: calendar.display, inline: false }
            )
            .setColor(getCalendarColor(monthStats))
            .setTimestamp();
        
        // 凡例を追加
        const legend = generateCalendarLegend(habitName);
        embed.addFields({ name: '📖 凡例', value: legend, inline: false });
        
        // ナビゲーションボタンを更新
        const row = createCalendarNavigationButtons(year, month, habitName);
        
        await interaction.update({ embeds: [embed], components: [row] });
        
    } catch (error) {
        console.error('カレンダーナビゲーションエラー:', error);
        await interaction.update({ 
            content: 'カレンダーの表示中にエラーが発生しました。',
            embeds: [],
            components: []
        });
    }
}

// ===== ヘルパー関数群 =====

function calculateWeeklyProgress(logs, startDate, endDate) {
    const weeks = [];
    let currentWeekStart = moment(startDate).startOf('isoWeek');
    
    while (currentWeekStart.isBefore(moment(endDate))) {
        const weekEnd = currentWeekStart.clone().add(6, 'days');
        const weekLogs = logs.filter(log => {
            const logDate = moment(log.date);
            return logDate.isBetween(currentWeekStart, weekEnd, 'day', '[]');
        });
        
        weeks.push({
            week: `${currentWeekStart.format('MM/DD')}-${weekEnd.format('MM/DD')}`,
            count: weekLogs.length
        });
        
        currentWeekStart.add(1, 'week');
    }
    
    return weeks.map(week => `${week.week}: ${week.count}日`).join('\n');
}

function calculateOverallWeeklyTrend(logs, startDate) {
    const weeks = [];
    let currentWeekStart = moment(startDate).startOf('isoWeek');
    
    for (let i = 0; i < 4; i++) {
        const weekEnd = currentWeekStart.clone().add(6, 'days');
        const weekLogs = logs.filter(log => {
            const logDate = moment(log.date);
            return logDate.isBetween(currentWeekStart, weekEnd, 'day', '[]');
        });
        
        weeks.push(weekLogs.length);
        currentWeekStart.add(1, 'week');
    }
    
    let trend = '';
    if (weeks.length >= 2) {
        const recent = weeks[weeks.length - 1];
        const previous = weeks[weeks.length - 2];
        
        if (recent > previous + 1) trend = '📈 大幅上昇';
        else if (recent > previous) trend = '📈 上昇傾向';
        else if (recent < previous - 1) trend = '📉 大幅下降';
        else if (recent < previous) trend = '📉 下降傾向';
        else trend = '➡️ 安定';
    }
    
    const weeklyText = weeks.map((count, index) => `第${index + 1}週: ${count}回`).join('\n');
    return `${weeklyText}\n\n${trend}`;
}

function analyzeRecentPattern(logs) {
    if (logs.length < 7) return null;
    
    const recent7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
        const hasLog = logs.some(log => log.date === date);
        recent7Days.push(hasLog);
    }
    
    const consecutiveDays = getConsecutiveDays(recent7Days);
    const weekdayPattern = analyzeWeekdayPattern(logs);
    
    let pattern = '';
    if (consecutiveDays.current >= 3) {
        pattern += `🔥 ${consecutiveDays.current}日連続実行中！\n`;
    } else if (consecutiveDays.longest >= 3) {
        pattern += `📊 最近の最長連続: ${consecutiveDays.longest}日\n`;
    }
    
    if (weekdayPattern) {
        pattern += weekdayPattern;
    }
    
    return pattern || null;
}

function getConsecutiveDays(pattern) {
    let current = 0;
    let longest = 0;
    let temp = 0;
    
    for (let i = pattern.length - 1; i >= 0; i--) {
        if (pattern[i]) {
            current++;
        } else {
            break;
        }
    }
    
    for (const executed of pattern) {
        if (executed) {
            temp++;
            longest = Math.max(longest, temp);
        } else {
            temp = 0;
        }
    }
    
    return { current, longest };
}

function analyzeWeekdayPattern(logs) {
    if (logs.length < 14) return null;
    
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    
    logs.forEach(log => {
        const weekday = moment(log.date).day();
        weekdayCounts[weekday]++;
    });
    
    const maxCount = Math.max(...weekdayCounts);
    const minCount = Math.min(...weekdayCounts);
    
    if (maxCount - minCount >= 3) {
        const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const bestDay = weekdayNames[weekdayCounts.indexOf(maxCount)];
        return `📅 ${bestDay}曜日の実行率が高い傾向`;
    }
    
    return null;
}

function getStreakColor(streak) {
    if (streak >= 30) return 0xFFD700;
    if (streak >= 14) return 0xFF6B6B;
    if (streak >= 7) return 0x4ECDC4;
    if (streak >= 3) return 0x45B7D1;
    return 0x96CEB4;
}

function calculateMonthlyConsecutive(logs, startDate, endDate) {
    if (logs.length === 0) return 0;
    
    const sortedLogs = logs.sort((a, b) => moment(a.date).diff(moment(b.date)));
    let maxConsecutive = 0;
    let currentConsecutive = 1;
    
    for (let i = 1; i < sortedLogs.length; i++) {
        const prevDate = moment(sortedLogs[i - 1].date);
        const currentDate = moment(sortedLogs[i].date);
        
        if (currentDate.diff(prevDate, 'days') === 1) {
            currentConsecutive++;
        } else {
            maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            currentConsecutive = 1;
        }
    }
    
    return Math.max(maxConsecutive, currentConsecutive);
}

function generateCalendarLegend(specificHabitName) {
    if (specificHabitName) {
        return '✅ 完了\n📝 日記のみ\n⭕ 未完了';
    } else {
        return '✅ 全習慣完了\n🔶 一部完了\n📝 日記のみ\n⭕ 未完了';
    }
}

function createCalendarNavigationButtons(year, month, habitName) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`calendar_nav_${prevYear}_${prevMonth}_${habitName || 'all'}`)
                .setLabel('◀ 前月')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`calendar_today_${habitName || 'all'}`)
                .setLabel('今月')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`calendar_nav_${nextYear}_${nextMonth}_${habitName || 'all'}`)
                .setLabel('次月 ▶')
                .setStyle(ButtonStyle.Secondary)
        );
    
    return row;
}

function getCalendarColor(monthStats) {
    const rateMatch = monthStats.match(/達成率: (\d+(?:\.\d+)?)%/);
    if (rateMatch) {
        const rate = parseFloat(rateMatch[1]);
        if (rate >= 90) return 0xFFD700;
        if (rate >= 75) return 0x00FF00;
        if (rate >= 50) return 0xFFA500;
        if (rate >= 25) return 0xFF6B6B;
        return 0x808080;
    }
    return 0x00AE86;
}

// 習慣編集モーダル表示
async function showHabitEditModal(interaction, habit) {
    const modal = new ModalBuilder()
        .setCustomId(`habit_edit_modal_${habit.id}`)
        .setTitle(`「${habit.name}」を編集`);

    const nameInput = new TextInputBuilder()
        .setCustomId('habit_name')
        .setLabel('習慣名')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.name)
        .setRequired(true)
        .setMaxLength(50);

    const frequencyInput = new TextInputBuilder()
        .setCustomId('habit_frequency')
        .setLabel('頻度 (daily, weekly, custom)')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.frequency)
        .setRequired(true)
        .setMaxLength(10);

    const difficultyInput = new TextInputBuilder()
        .setCustomId('habit_difficulty')
        .setLabel('難易度 (easy, normal, hard)')
        .setStyle(TextInputStyle.Short)
        .setValue(habit.difficulty)
        .setRequired(true)
        .setMaxLength(10);

    const nameRow = new ActionRowBuilder().addComponents(nameInput);
    const frequencyRow = new ActionRowBuilder().addComponents(frequencyInput);
    const difficultyRow = new ActionRowBuilder().addComponents(difficultyInput);

    modal.addComponents(nameRow, frequencyRow, difficultyRow);
    
    await interaction.showModal(modal);
}

// 習慣編集選択メニュー
async function showHabitEditSelector(interaction) {
    const userId = interaction.user.id;
    const habits = await sheetsUtils.getUserHabits(userId);
    
    if (habits.length === 0) {
        await interaction.reply({ 
            content: '編集できる習慣がありません。', 
            ephemeral: true 
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('✏️ 編集する習慣を選択')
        .setDescription('編集したい習慣を選んでください')
        .setColor(0xFFA500);
    
    const options = habits.slice(0, 25).map(habit => ({
        label: habit.name,
        description: `${config.habit_frequencies[habit.frequency]} - ${config.habit_difficulties[habit.difficulty]?.name || '不明'}`,
        value: habit.id,
        emoji: config.habit_difficulties[habit.difficulty]?.emoji || '❓'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('habit_edit_select')
        .setPlaceholder('編集する習慣を選択...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({ embeds: [embed], components: [row] });
}

// 習慣削除確認表示
async function showHabitDeleteConfirmation(interaction, habit) {
    const embed = new EmbedBuilder()
        .setTitle('🗑️ 習慣削除の確認')
        .setDescription(`**${habit.name}** を削除しますか？`)
        .addFields(
            { name: '⚠️ 注意', value: '削除すると以下のデータが失われます：', inline: false },
            { name: '📊 ストリーク', value: `${habit.currentStreak || 0}日連続`, inline: true },
            { name: '📅 頻度', value: config.habit_frequencies[habit.frequency], inline: true },
            { name: '⚡ 難易度', value: config.habit_difficulties[habit.difficulty]?.name || '不明', inline: true },
            { name: '🔄 復元', value: '削除した習慣は復元できません', inline: false }
        )
        .setColor(0xFF4444)
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`habit_delete_confirm_${habit.id}`)
                .setLabel('削除する')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('habit_delete_cancel')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
        );
    
    await interaction.update({ embeds: [embed], components: [row] });
}

module.exports = {
    createCommand,
    handleCommand,
    handleHabitAdd,
    handleHabitList,
    handleCalendarNavigation,
    handleHabitDoneSelect,
    handleHabitEditSelect,
    handleHabitDeleteSelect,
    saveHabitEdit,
    executeHabitDelete
};
