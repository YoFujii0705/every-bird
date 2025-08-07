// commands/whoami.js - Who Am I 機能

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment');
const sheetsUtils = require('../utils/sheets');

// コマンド定義
function createCommand() {
    return new SlashCommandBuilder()
        .setName('whoami')
        .setDescription('自分の現在の状況と目標を確認')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Who Am I セッションを開始')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Who Am I の内容を編集')
                .addStringOption(option =>
                    option.setName('section')
                        .setDescription('編集するセクション')
                        .setRequired(true)
                        .addChoices(
                            { name: '自分について', value: 'identity' },
                            { name: '大きな目標', value: 'big_goal' },
                            { name: '小さな目標', value: 'small_goal' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('現在設定されている内容を確認')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('朝の通知をテスト送信')
        );
}

// コマンド処理
async function handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
        case 'start':
            await handleWhoAmIStart(interaction);
            break;
        case 'edit':
            await handleWhoAmIEdit(interaction);
            break;
        case 'view':
            await handleWhoAmIView(interaction);
            break;
        case 'test':
            await handleWhoAmITest(interaction);
            break;
        default:
            await interaction.reply({ 
                content: 'この機能は開発中です。', 
                ephemeral: true 
            });
    }
}

// Who Am I セッション開始
async function handleWhoAmIStart(interaction) {
    const userId = interaction.user.id;
    
    try {
        // ユーザーのWho Am Iデータを取得
        const whoamiData = await sheetsUtils.getWhoAmIData(userId);
        
        if (!whoamiData || !whoamiData.identity) {
            await interaction.reply({
                content: '❌ Who Am I の内容が設定されていません。\n`/whoami edit` で内容を設定してください。',
                ephemeral: true
            });
            return;
        }
        
        // セッションを開始
        await showIdentityStep(interaction, whoamiData);
        
    } catch (error) {
        console.error('Who Am I セッション開始エラー:', error);
        await interaction.reply({
            content: '❌ セッションの開始中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// ステップ1: 自分について表示
async function showIdentityStep(interaction, whoamiData) {
    const embed = new EmbedBuilder()
        .setTitle('🌟 Who Am I - あなたについて')
        .setDescription(whoamiData.identity)
        .setColor(0x3498DB)
        .addFields(
            { name: '📅 日付', value: moment().format('YYYY年MM月DD日'), inline: true },
            { name: '⏰ 時刻', value: moment().format('HH:mm'), inline: true }
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('whoami_next_big_goal')
                .setLabel('次へ：大きな目標')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎯')
        );

    // 最初の表示かどうかで判定
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } else {
        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }
}

// ステップ2: 大きな目標表示
async function showBigGoalStep(interaction, whoamiData) {
    const embed = new EmbedBuilder()
        .setTitle('🎯 Who Am I - 大きな目標')
        .setDescription(whoamiData.big_goal)
        .setColor(0xE74C3C)
        .addFields(
            { name: '💡 これがあなたの向かう先', value: '大きな夢に向かって一歩ずつ前進しましょう', inline: false }
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('whoami_back_identity')
                .setLabel('戻る')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️'),
            new ButtonBuilder()
                .setCustomId('whoami_next_small_goal')
                .setLabel('次へ：今やるべきこと')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔥')
        );

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// ステップ3: 小さな目標表示
async function showSmallGoalStep(interaction, whoamiData) {
    const embed = new EmbedBuilder()
        .setTitle('🔥 Who Am I - 今やるべきこと')
        .setDescription(whoamiData.small_goal)
        .setColor(0xF39C12)
        .addFields(
            { name: '⚡ 今日から実行', value: '小さな行動の積み重ねが大きな成果を生みます', inline: false }
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('whoami_back_big_goal')
                .setLabel('戻る')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️'),
            new ButtonBuilder()
                .setCustomId('whoami_complete')
                .setLabel('完了：頑張ろう！')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✨')
        );

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// ステップ4: 完了メッセージ
async function showCompletionStep(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('✨ Who Am I - セッション完了')
        .setDescription('**今日も素晴らしい一日にしましょう！**')
        .addFields(
            { name: '💪 今日のあなたへ', value: '• あなたは自分の目標を明確に持っている\n• 一歩ずつ確実に前進している\n• 今日という日を大切に過ごそう', inline: false },
            { name: '🌅 新しい一日', value: 'この確認を胸に、今日という日を最高の一日にしてください！', inline: false }
        )
        .setColor(0x27AE60)
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('whoami_restart')
                .setLabel('もう一度確認')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('whoami_done')
                .setLabel('今日も頑張ろう！')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀')
        );

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// Who Am I 編集
async function handleWhoAmIEdit(interaction) {
    const section = interaction.options.getString('section');
    const userId = interaction.user.id;
    
    const sectionNames = {
        'identity': '自分について',
        'big_goal': '大きな目標',
        'small_goal': '小さな目標'
    };
    
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId(`whoami_edit_${section}`)
        .setTitle(`${sectionNames[section]}を編集`);

    const textInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel(sectionNames[section])
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    // 現在の内容を取得してプレースホルダーに設定
    try {
        const currentData = await sheetsUtils.getWhoAmIData(userId);
        if (currentData && currentData[section]) {
            textInput.setValue(currentData[section]);
        } else {
            // デフォルトのプレースホルダー
            const placeholders = {
                'identity': '例: 私は○○を目指すプログラマーです。毎日成長し続け、価値のあるサービスを作ることが私の使命です。',
                'big_goal': '例: 3年以内に自分のサービスで月収100万円を達成し、多くの人に価値を提供する起業家になる。',
                'small_goal': '例: 毎日3時間のプログラミング学習、週1回の新技術習得、月1回のアウトプット作成を継続する。'
            };
            textInput.setPlaceholder(placeholders[section]);
        }
    } catch (error) {
        console.error('現在の内容取得エラー:', error);
    }

    const row = new ActionRowBuilder().addComponents(textInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
}

// Who Am I 内容表示
async function handleWhoAmIView(interaction) {
    const userId = interaction.user.id;
    
    try {
        const whoamiData = await sheetsUtils.getWhoAmIData(userId);
        
        if (!whoamiData) {
            await interaction.reply({
                content: '❌ Who Am I の内容が設定されていません。\n`/whoami edit` で内容を設定してください。',
                ephemeral: true
            });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📋 Who Am I - 現在の設定内容')
            .setColor(0x9B59B6)
            .setTimestamp();

        if (whoamiData.identity) {
            embed.addFields({ name: '🌟 自分について', value: whoamiData.identity, inline: false });
        }
        
        if (whoamiData.big_goal) {
            embed.addFields({ name: '🎯 大きな目標', value: whoamiData.big_goal, inline: false });
        }
        
        if (whoamiData.small_goal) {
            embed.addFields({ name: '🔥 小さな目標', value: whoamiData.small_goal, inline: false });
        }
        
        if (whoamiData.updated_at) {
            embed.addFields({ name: '📅 最終更新', value: moment(whoamiData.updated_at).format('YYYY-MM-DD HH:mm'), inline: true });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('whoami_start_from_view')
                    .setLabel('セッションを開始')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚀'),
                new ButtonBuilder()
                    .setCustomId('whoami_edit_menu')
                    .setLabel('編集する')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✏️')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Who Am I 表示エラー:', error);
        await interaction.reply({
            content: '❌ 内容の取得中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// テスト通知送信
async function handleWhoAmITest(interaction) {
    try {
        // 朝の通知をテスト送信
        const NotificationManager = require('../handlers/notifications');
        
        // テスト用の通知送信
        await sendMorningWhoAmI(interaction.client, interaction.user.id, interaction.channelId);
        
        await interaction.reply({
            content: '✅ テスト通知を送信しました。',
            ephemeral: true
        });
        
    } catch (error) {
        console.error('テスト通知エラー:', error);
        await interaction.reply({
            content: '❌ テスト通知の送信中にエラーが発生しました。',
            ephemeral: true
        });
    }
}

// 朝の通知送信関数
async function sendMorningWhoAmI(client, userId = null, channelId = null) {
    try {
        // 通知を送信するチャンネルを決定
        let targetChannelId = channelId || process.env.REMINDER_CHANNEL_ID;
        
        if (!targetChannelId) {
            console.error('Who Am I 通知: チャンネルIDが設定されていません');
            return;
        }
        
        const channel = await client.channels.fetch(targetChannelId);
        
        // 特定のユーザーまたは設定されたユーザーを対象
        const targetUserId = userId || process.env.WHOAMI_TARGET_USER_ID;
        
        if (!targetUserId) {
            console.log('Who Am I 通知: 対象ユーザーが設定されていません');
            return;
        }
        
        // ユーザーのWho Am Iデータを確認
        const whoamiData = await sheetsUtils.getWhoAmIData(targetUserId);
        
        if (!whoamiData || !whoamiData.identity) {
            console.log('Who Am I 通知: ユーザーのデータが設定されていません');
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🌅 おはよう！Who Am I の時間です')
            .setDescription('新しい一日が始まりました。\n自分を見つめ直し、目標を確認しましょう。')
            .addFields(
                { name: '✨ 今日のスタート', value: '自分は何者で、何を目指しているのかを再確認しましょう', inline: false },
                { name: '💪 一日の始まり', value: 'Who Am I セッションで心を整えて、素晴らしい一日にしましょう！', inline: false }
            )
            .setColor(0xF39C12)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('whoami_morning_start')
                    .setLabel('Who Am I を始める')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🌟')
            );

        await channel.send({
            content: `<@${targetUserId}>`,
            embeds: [embed],
            components: [row]
        });
        
        console.log('✅ Who Am I 朝の通知を送信しました');
        
    } catch (error) {
        console.error('❌ Who Am I 朝の通知エラー:', error);
    }
}

// ボタンインタラクション処理
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    try {
        // ユーザーのデータを取得
        const whoamiData = await sheetsUtils.getWhoAmIData(userId);
        
        if (!whoamiData && !customId.includes('edit')) {
            await interaction.update({
                content: '❌ Who Am I の内容が設定されていません。`/whoami edit` で設定してください。',
                embeds: [],
                components: []
            });
            return;
        }
        
        switch (customId) {
            case 'whoami_morning_start':
            case 'whoami_setup_start':  // 朝の通知用
            case 'whoami_start_from_view':
            case 'whoami_restart':
                await showIdentityStep(interaction, whoamiData);
                break;
                
            case 'whoami_next_big_goal':
                await showBigGoalStep(interaction, whoamiData);
                break;
                
            case 'whoami_back_identity':
                await showIdentityStep(interaction, whoamiData);
                break;
                
            case 'whoami_next_small_goal':
                await showSmallGoalStep(interaction, whoamiData);
                break;
                
            case 'whoami_back_big_goal':
                await showBigGoalStep(interaction, whoamiData);
                break;
                
            case 'whoami_complete':
                await showCompletionStep(interaction);
                break;
                
            case 'whoami_done':
                await interaction.update({
                    content: '🚀 今日も素晴らしい一日を！頑張ってください！',
                    embeds: [],
                    components: []
                });
                break;
                
            case 'whoami_edit_menu':
                await showEditMenu(interaction);
                break;
                
            default:
                await interaction.reply({
                    content: '❌ 不明なボタンです。',
                    ephemeral: true
                });
        }
        
    } catch (error) {
        console.error('Who Am I ボタン処理エラー:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ 処理中にエラーが発生しました。',
                ephemeral: true
            });
        }
    }
}

// 編集メニュー表示
async function showEditMenu(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('✏️ Who Am I - 編集メニュー')
        .setDescription('編集したい項目を選択してください')
        .setColor(0x9B59B6);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('whoami_edit_identity_btn')
                .setLabel('自分について')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🌟'),
            new ButtonBuilder()
                .setCustomId('whoami_edit_big_goal_btn')
                .setLabel('大きな目標')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎯'),
            new ButtonBuilder()
                .setCustomId('whoami_edit_small_goal_btn')
                .setLabel('小さな目標')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔥')
        );

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// モーダル処理
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    if (!customId.startsWith('whoami_edit_')) {
        return false; // 他のモーダルの場合は処理しない
    }
    
    const section = customId.replace('whoami_edit_', '');
    const content = interaction.fields.getTextInputValue('content');
    
    try {
        await sheetsUtils.saveWhoAmIData(userId, section, content);
        
        const sectionNames = {
            'identity': '自分について',
            'big_goal': '大きな目標',
            'small_goal': '小さな目標'
        };
        
        const embed = new EmbedBuilder()
            .setTitle('✅ 保存完了')
            .setDescription(`**${sectionNames[section]}** を更新しました`)
            .addFields({ name: '更新内容', value: content.substring(0, 500) + (content.length > 500 ? '...' : ''), inline: false })
            .setColor(0x27AE60)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
        return true; // 処理完了を示す
        
    } catch (error) {
        console.error('Who Am I データ保存エラー:', error);
        await interaction.reply({
            content: '❌ 保存中にエラーが発生しました。',
            ephemeral: true
        });
        return true;
    }
}

module.exports = {
    createCommand,
    handleCommand,
    handleButtonInteraction,
    handleModalSubmit,
    sendMorningWhoAmI
};
