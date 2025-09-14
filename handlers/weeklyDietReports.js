const cron = require('node-cron');
const moment = require('moment');

// 週次レポート送信用のスケジュール設定
let weeklyReportSchedule = null;

// 週次レポート通知システムの初期化（単一ユーザー・指定チャンネル版）
function initializeWeeklyReportSystem(client, targetUserId, targetChannelId) {
    try {
        // 毎週日曜日の夜8時に実行
        weeklyReportSchedule = cron.schedule('0 20 * * 0', async () => {
            console.log('📊 週次ダイエットレポート送信開始...');
            await sendWeeklyReportToUser(client, targetUserId, targetChannelId);
        }, {
            scheduled: false, // 初期は停止状態
            timezone: "Asia/Tokyo"
        });
        
        // スケジュールを開始
        weeklyReportSchedule.start();
        console.log(`✅ 週次ダイエットレポート通知システムを初期化しました（毎週日曜 20:00 → User: ${targetUserId}, Channel: ${targetChannelId}）`);
        
    } catch (error) {
        console.error('❌ 週次レポート通知システム初期化エラー:', error);
    }
}

// 指定ユーザー・チャンネルに週次レポートを送信
async function sendWeeklyReportToUser(client, userId, channelId) {
    try {
        console.log(`📤 ${userId} に週次レポート送信中...`);
        
        // チャンネルを取得
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.log(`⚠️ チャンネル ${channelId} が見つかりません`);
            return;
        }
        
        // 週次レポートを生成
        const dietCommands = require('../commands/diet');
        const reportEmbed = await dietCommands.generateWeeklyReport(userId);
        
        if (!reportEmbed) {
            console.log(`⚠️ ${userId} のレポート生成に失敗しました`);
            return;
        }
        
        // 指定チャンネルに送信
        await channel.send({ 
            content: `<@${userId}> 🌟 今週のダイエットレポートが完成しました！`,
            embeds: [reportEmbed] 
        });
        
        console.log(`✅ ${userId} にレポート送信完了 (チャンネル: ${channelId})`);
        
    } catch (error) {
        console.error(`❌ ${userId} への週次レポート送信エラー:`, error);
    }
}

// 手動テスト用の関数（単一ユーザー版）
async function sendTestWeeklyReport(client, userId, channelId) {
    try {
        console.log(`🧪 ${userId} にテスト週次レポート送信... (チャンネル: ${channelId})`);
        await sendWeeklyReportToUser(client, userId, channelId);
    } catch (error) {
        console.error('テスト週次レポート送信エラー:', error);
    }
}

// 通知システムの停止
function shutdownWeeklyReportSystem() {
    if (weeklyReportSchedule) {
        weeklyReportSchedule.destroy();
        weeklyReportSchedule = null;
        console.log('🔄 週次レポート通知システムを停止しました');
    }
}

// 現在のスケジュール状態を確認
function getScheduleStatus() {
    return {
        isActive: weeklyReportSchedule ? weeklyReportSchedule.running : false,
        nextExecution: weeklyReportSchedule ? '毎週日曜日 20:00 (JST)' : 'スケジュール未設定'
    };
}

// スケジュールの手動開始/停止
function toggleSchedule(enable = null) {
    if (!weeklyReportSchedule) {
        console.log('❌ スケジュールが初期化されていません');
        return false;
    }
    
    if (enable === null) {
        // 現在の状態を切り替え
        enable = !weeklyReportSchedule.running;
    }
    
    if (enable) {
        weeklyReportSchedule.start();
        console.log('▶️ 週次レポートスケジュールを開始しました');
    } else {
        weeklyReportSchedule.stop();
        console.log('⏸️ 週次レポートスケジュールを停止しました');
    }
    
    return enable;
}

module.exports = {
    initializeWeeklyReportSystem,
    sendTestWeeklyReport,
    shutdownWeeklyReportSystem,
    getScheduleStatus,
    toggleSchedule
};
