// commands/test.js - 新しいファイルを作成してください

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('各種通知のテスト')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('テストする通知の種類')
                .setRequired(true)
                .addChoices(
                    { name: '体重リマインダー', value: 'weight' },
                    { name: '日記リマインダー', value: 'diary' },
                    { name: '習慣サマリー', value: 'habit' },
                    { name: '週次レポート', value: 'weekly' },
                    { name: 'Who Am I リマインダー', value: 'whoami' },
                    { name: 'すべての通知', value: 'all' }
                )),

    async execute(interaction) {
        const testType = interaction.options.getString('type');
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // NotificationManagerのインスタンスを取得
            const notificationManager = interaction.client.notificationManager;
            
            if (!notificationManager) {
                await interaction.editReply('通知システムが初期化されていません。');
                return;
            }

            switch (testType) {
                case 'weight':
                    await notificationManager.testNotification('weight');
                    await interaction.editReply('✅ 体重リマインダーのテストを実行しました');
                    break;
                    
                case 'diary':
                    await notificationManager.testNotification('diary');
                    await interaction.editReply('✅ 日記リマインダーのテストを実行しました');
                    break;
                    
                case 'habit':
                    await notificationManager.testNotification('habit');
                    await interaction.editReply('✅ 習慣サマリーのテストを実行しました');
                    break;
                    
                case 'weekly':
                    await notificationManager.testNotification('weekly');
                    await interaction.editReply('✅ 週次レポートのテストを実行しました');
                    break;
                    
                case 'whoami':
                    await notificationManager.testNotification('whoami');
                    await interaction.editReply('✅ Who Am I リマインダーのテストを実行しました');
                    break;
                    
                case 'all':
                    await interaction.editReply('🔄 すべての通知テストを実行中...');
                    
                    await notificationManager.testNotification('weight');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
                    
                    await notificationManager.testNotification('diary');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    await notificationManager.testNotification('habit');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    await notificationManager.testNotification('weekly');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    await notificationManager.testNotification('whoami');
                    
                    await interaction.editReply('✅ すべての通知テストが完了しました');
                    break;
                    
                default:
                    await interaction.editReply('❌ 無効な通知タイプです');
            }
            
        } catch (error) {
            console.error('通知テストエラー:', error);
            await interaction.editReply('❌ 通知テスト中にエラーが発生しました');
        }
    },
};
