const { SlashCommandBuilder } = require('discord.js');

function createCommand() {
    return new SlashCommandBuilder()
        .setName('routine')
        .setDescription('🔄 ルーティンの管理 - 連続したタスクの流れを管理')
        
        // ===============================
        // ルーティン基本管理
        // ===============================
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('🆕 新しいルーティンを作成')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('ルーティン名（例: 朝のルーティン）')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('カテゴリ')
                        .setRequired(false)
                        .addChoices(
                            { name: '🌅 朝', value: 'morning' },
                            { name: '🌙 夜', value: 'evening' },
                            { name: '💼 仕事', value: 'work' },
                            { name: '💪 運動', value: 'exercise' },
                            { name: '🔄 一般', value: 'general' }
                        ))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('説明・詳細（任意）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('📋 登録されているルーティン一覧を表示'))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('📄 特定のルーティンの詳細情報を表示')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('ルーティンID')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('✏️ ルーティンの基本情報を編集')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('新しいルーティン名')
                        .setRequired(false))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('新しい説明')
                        .setRequired(false))
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('新しいカテゴリ')
                        .setRequired(false)
                        .addChoices(
                            { name: '🌅 朝', value: 'morning' },
                            { name: '🌙 夜', value: 'evening' },
                            { name: '💼 仕事', value: 'work' },
                            { name: '💪 運動', value: 'exercise' },
                            { name: '🔄 一般', value: 'general' }
                        )))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('🗑️ ルーティンを削除')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('削除するルーティンID')
                        .setRequired(true)))

.addSubcommandGroup(group =>
    group
        .setName('notify')
        .setDescription('🔔 ルーティンの通知設定')
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('reminder')
                .setDescription('⏰ ルーティンの実行リマインダーを設定')
                .addIntegerOption(option =>
                    option
                        .setName('routine_id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('通知時刻（例: 07:00）')
                        .setRequired(true))
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
                .setName('weekly')
                .setDescription('📊 週次レポートを設定')
                .addIntegerOption(option =>
                    option
                        .setName('routine_id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('曜日（0=日曜, 1=月曜...6=土曜）')
                        .setRequired(false)
                        .addChoices(
                            { name: '日曜日', value: 0 },
                            { name: '月曜日', value: 1 },
                            { name: '火曜日', value: 2 },
                            { name: '水曜日', value: 3 },
                            { name: '木曜日', value: 4 },
                            { name: '金曜日', value: 5 },
                            { name: '土曜日', value: 6 }
                        ))
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('通知時刻（例: 20:00）')
                        .setRequired(false))
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('通知先チャンネル')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('alert')
                .setDescription('⚠️ 継続率アラートを設定')
                .addIntegerOption(option =>
                    option
                        .setName('routine_id')
                        .setDescription('ルーティンID')
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
                        .setRequired(true))))
        
        // ===============================
        // ステップ管理
        // ===============================
        .addSubcommand(subcommand =>
            subcommand
                .setName('steps')
                .setDescription('📝 ルーティンのステップ一覧を表示')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('ルーティンID')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-step')
                .setDescription('➕ ルーティンにステップを追加')
                .addIntegerOption(option =>
                    option
                        .setName('routine_id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('ステップ名（例: バナナを食べる）')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('ステップの詳細説明（任意）')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option
                        .setName('minutes')
                        .setDescription('予想所要時間（分）')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option
                        .setName('required')
                        .setDescription('必須ステップかどうか（デフォルト: true）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit-step')
                .setDescription('✏️ ステップを編集')
                .addIntegerOption(option =>
                    option
                        .setName('step_id')
                        .setDescription('ステップID')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('新しいステップ名')
                        .setRequired(false))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('新しい説明')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option
                        .setName('minutes')
                        .setDescription('新しい予想時間（分）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete-step')
                .setDescription('🗑️ ステップを削除')
                .addIntegerOption(option =>
                    option
                        .setName('step_id')
                        .setDescription('削除するステップID')
                        .setRequired(true)))
        
        // ===============================
        // ルーティン実行
        // ===============================
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('▶️ ルーティンを開始')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('開始するルーティンID')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('⏭️ 現在のステップを完了して次へ進む')
                .addStringOption(option =>
                    option
                        .setName('notes')
                        .setDescription('このステップについてのメモ（任意）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('skip')
                .setDescription('⏩ 現在のステップをスキップ')
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('スキップ理由')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('⏸️ ルーティンを一時停止'))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('▶️ 一時停止したルーティンを再開'))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('⏹️ ルーティンを中断・終了')
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('中断理由（任意）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('📊 現在実行中のルーティン状況を表示'))
        
        // ===============================
        // 履歴・統計
        // ===============================
        .addSubcommand(subcommand =>
            subcommand
                .setName('today')
                .setDescription('📅 今日のルーティン実行状況'))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('📜 ルーティンの実行履歴を表示')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('何日分の履歴を表示するか（デフォルト: 7日）')
                        .setRequired(false)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('📊 ルーティンの統計情報を表示')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('統計期間（日数、デフォルト: 30日）')
                        .setRequired(false)))

.addSubcommand(subcommand =>
    subcommand
        .setName('debug-sheets')
        .setDescription('🔧 Google Sheetsの状況をデバッグ'))
        
        // ===============================
        // ユーティリティ
        // ===============================
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('🔍 ルーティンを検索')
                .addStringOption(option =>
                    option
                        .setName('keyword')
                        .setDescription('検索キーワード')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('copy')
                .setDescription('📋 既存のルーティンをコピーして新規作成')
                .addIntegerOption(option =>
                    option
                        .setName('source_id')
                        .setDescription('コピー元のルーティンID')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('new_name')
                        .setDescription('新しいルーティン名')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('template')
                .setDescription('📋 よく使われるルーティンテンプレートを作成')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('テンプレートの種類')
                        .setRequired(true)
                        .addChoices(
                            { name: '🌅 基本的な朝ルーティン', value: 'morning_basic' },
                            { name: '🌙 基本的な夜ルーティン', value: 'evening_basic' },
                            { name: '💪 運動ルーティン', value: 'exercise_basic' },
                            { name: '💼 在宅ワーク開始', value: 'work_start' },
                            { name: '🎯 学習ルーティン', value: 'study_basic' }
                        )))

        // ===============================
        // 🔗 ルーティン-習慣連携機能
        // ===============================
.addSubcommandGroup(group =>
    group
        .setName('link')
        .setDescription('🔗 ルーティン-習慣連携機能')
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('habit')
                .setDescription('🔗 ルーティンのステップと習慣を連携させる')
                .addIntegerOption(option =>
                    option
                        .setName('routine_id')
                        .setDescription('ルーティンID')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('step_order')
                        .setDescription('ステップ番号')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('habit_name')
                        .setDescription('連携させる習慣名')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('🔗 ルーティンと習慣の連携を削除する')
                .addIntegerOption(option =>
                    option
                        .setName('link_id')
                        .setDescription('連携ID')
                        .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('🔗 現在の連携状況を表示する')));
}

async function handleCommand(interaction, routineHandler) {
    try {
        // すべてのコマンド処理を routineHandler に委譲
        await routineHandler.handleRoutineCommand(interaction);
    } catch (error) {
        console.error('ルーティンコマンド処理エラー:', error);
        
        try {
            const errorMessage = '❌ ルーティンコマンドの処理中にエラーが発生しました。';
            
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply({ 
                    content: errorMessage, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } catch (replyError) {
            console.error('エラー応答送信失敗:', replyError);
        }
    }
}

module.exports = {
    createCommand,
    handleCommand
};
