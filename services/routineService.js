const sheetsUtils = require('../utils/sheets');

/**
 * ルーティン実行セッション管理クラス
 */
class RoutineSession {
    constructor(userId, routineId, routineInfo, steps, executionId) {
        this.userId = userId;
        this.routineId = routineId;
        this.routineName = routineInfo.name;
        this.steps = steps;
        this.executionId = executionId;
        this.currentStepIndex = 0;
        this.startTime = new Date();
        this.status = 'running'; // running, paused, completed, aborted
        this.completedSteps = 0;
    }

    /**
     * 現在のステップを取得
     */
    getCurrentStep() {
        if (this.currentStepIndex >= this.steps.length) {
            return null;
        }
        return this.steps[this.currentStepIndex];
    }

    /**
     * 次のステップに進む
     */
    async next(notes = '') {
        if (this.status !== 'running') {
            throw new Error('ルーティンが実行中ではありません');
        }

        const currentStep = this.getCurrentStep();
        if (!currentStep) {
            return await this.complete();
        }

        this.completedSteps++;
        this.currentStepIndex++;

        // 全ステップ完了チェック
        if (this.currentStepIndex >= this.steps.length) {
            return await this.complete();
        }

        return { completed: false };
    }

    /**
     * 現在のステップをスキップ
     */
    async skip(reason = '') {
        if (this.status !== 'running') {
            throw new Error('ルーティンが実行中ではありません');
        }

        const currentStep = this.getCurrentStep();
        if (!currentStep) {
            return await this.complete();
        }

        this.currentStepIndex++;

        // 全ステップ完了チェック
        if (this.currentStepIndex >= this.steps.length) {
            return await this.complete();
        }

        return { completed: false };
    }

    /**
     * ルーティンを一時停止
     */
    pause() {
        if (this.status === 'running') {
            this.status = 'paused';
        }
    }

    /**
     * ルーティンを再開
     */
    resume() {
        if (this.status === 'paused') {
            this.status = 'running';
        }
    }

    /**
     * ルーティンを完了
     */
    async complete() {
        const endTime = new Date();
        this.status = 'completed';

        // 実行記録を更新
        try {
            if (sheetsUtils.updateRoutineExecution) {
                await sheetsUtils.updateRoutineExecution(this.executionId, {
                    endTime: endTime.toISOString().slice(11, 16),
                    status: 'completed',
                    completedSteps: this.completedSteps
                });
            }
            
            // ★新しく追加：実行回数を更新
            if (sheetsUtils.updateRoutineTotalExecutions) {
                await sheetsUtils.updateRoutineTotalExecutions(this.routineId);
                console.log('📊 ルーティン実行回数を更新しました:', this.routineId);
            }
            
        } catch (error) {
            console.error('ルーティン完了記録エラー:', error);
        }

        return { completed: true, endTime };
    }

    /**
     * ルーティンを中断
     */
    async abort(reason = '') {
        const endTime = new Date();
        this.status = 'aborted';

        // 実行記録を更新
        try {
            if (sheetsUtils.updateRoutineExecution) {
                await sheetsUtils.updateRoutineExecution(this.executionId, {
                    endTime: endTime.toISOString().slice(11, 16),
                    status: 'aborted',
                    completedSteps: this.completedSteps
                });
            }
        } catch (error) {
            console.error('ルーティン中断記録エラー:', error);
        }

        return { completed: true, endTime, aborted: true };
    }

    /**
     * 進捗情報を取得
     */
    getProgress() {
        return {
            currentStep: this.currentStepIndex + 1,
            totalSteps: this.steps.length,
            completedSteps: this.completedSteps,
            progress: Math.round((this.currentStepIndex / this.steps.length) * 100),
            status: this.status,
            startTime: this.startTime,
            duration: Math.round((new Date() - this.startTime) / (1000 * 60)) // 分
        };
    }
}

/**
 * GoogleSheetsServiceのラッパークラス
 * 既存のsheetsUtilsとnotificationサービスのインターフェースを橋渡し
 */
class GoogleSheetsServiceWrapper {
    constructor() {
        this.sheetsUtils = sheetsUtils;
    }

    /**
     * データを取得（NotificationServiceで使用）
     */
    async getData(range) {
        try {
            const [sheetName, cellRange] = range.split('!');
            
            console.log(`📊 ${sheetName} シートからデータを取得中...`);
            
            // saveToSheetと同じAPI方式を使用
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const fullRange = `${sheetName}!${cellRange}`;
            
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            
            const sheets = google.sheets({ version: 'v4', auth });
            
            const request = {
                spreadsheetId,
                range: fullRange,
            };
            
            const response = await sheets.spreadsheets.values.get(request);
            const rows = response.data.values || [];
            
            if (rows.length === 0) {
                console.log(`📋 ${sheetName} シートにデータがありません`);
                // ヘッダーのみを返す
                if (sheetName === 'routine_notifications') {
                    return [['notification_id', 'user_id', 'routine_id', 'notification_type', 'is_enabled', 'notification_time', 'days_of_week', 'channel_id', 'threshold_days', 'threshold_count', 'last_sent', 'created_at']];
                }
                return [[]];
            }
            
            console.log(`✅ ${sheetName} から ${rows.length - 1}行のデータを取得しました`);
            console.log('🔍 取得したデータサンプル:', rows.length > 1 ? rows[1] : 'データなし');
            
            return rows;
            
        } catch (error) {
            console.error('getData エラー:', error);
            
            // エラー時はヘッダーのみ返す
            if (range.includes('routine_notifications')) {
                return [['notification_id', 'user_id', 'routine_id', 'notification_type', 'is_enabled', 'notification_time', 'days_of_week', 'channel_id', 'threshold_days', 'threshold_count', 'last_sent', 'created_at']];
            }
            return [[]];
        }
    }

    /**
     * データを追加（NotificationServiceで使用）
     */
    async appendData(range, values) {
        try {
            const [sheetName, cellRange] = range.split('!');
            
            // デバッグ情報を追加
            console.log('🔍 appendData デバッグ:', {
                sheetName,
                hasSaveToSheet: typeof this.sheetsUtils.saveToSheet === 'function',
                availableMethods: Object.keys(this.sheetsUtils).filter(key => typeof this.sheetsUtils[key] === 'function')
            });
            
            if (sheetName === 'routine_notifications') {
                if (this.sheetsUtils.saveToSheet) {
                    console.log('📝 実際の保存を実行中...');
                    const success = await this.sheetsUtils.saveToSheet(sheetName, values);
                    console.log(`💾 ${sheetName} への保存結果:`, success ? '成功' : '失敗');
                    return success;
                } else {
                    console.log('💾 通知データ保存（模擬）:', values);
                    return true;
                }
            }
            
            console.log(`⚠️ 未対応のデータ追加: ${sheetName}`, values);
            return true;
            
        } catch (error) {
            console.error('appendData エラー:', error);
            return false;
        }
    }

    /**
     * 次のIDを取得（NotificationServiceで使用）
     */
    async getNextId(sheetName) {
        try {
            // 現在は簡易的なID生成
            // TODO: 実際のシートから最大IDを取得する処理を実装
            return Date.now();
        } catch (error) {
            console.error('getNextId エラー:', error);
            return Date.now();
        }
    }
}

/**
 * ルーティンサービスクラス
 */
class RoutineService {
    constructor() {
        // アクティブセッションを管理
        this.activeSessions = new Map(); // userId -> RoutineSession
        
        // GoogleSheetsServiceラッパーを作成
        this.googleSheetsService = new GoogleSheetsServiceWrapper();
        
        console.log('🔍 RoutineService内のGoogleSheetsService初期化完了:', {
            hasGoogleSheetsService: !!this.googleSheetsService,
            hasGetData: typeof this.googleSheetsService.getData === 'function',
            hasAppendData: typeof this.googleSheetsService.appendData === 'function',
            hasGetNextId: typeof this.googleSheetsService.getNextId === 'function'
        });
    }

    // === ルーティン管理 ===

    async createRoutine(userId, name, description = '', category = 'general') {
        try {
            if (sheetsUtils.saveRoutineToSheet) {
                return await sheetsUtils.saveRoutineToSheet(userId, name, description, category);
            } else {
                console.warn('saveRoutineToSheet メソッドが見つかりません');
                return 'mock_routine_' + Date.now();
            }
        } catch (error) {
            console.error('ルーティン作成エラー:', error);
            throw error;
        }
    }

    // ✅ getUserRoutines メソッドを追加（エラー修正）
    async getUserRoutines(userId) {
        try {
            console.log('🔍 ユーザールーティン取得開始:', { userId });
            
            // 直接Google Sheets API v4を使用
            const { google } = require('googleapis');
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            
            const sheets = google.sheets({ version: 'v4', auth });
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const range = 'routines_master!A:I';
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            
            const rows = response.data.values || [];
            console.log('📊 ルーティンデータ取得:', { totalRows: rows.length });
            
            if (rows.length <= 1) {
                console.log('📋 ルーティンデータがありません');
                return [];
            }
            
            const routines = [];
            // ヘッダー行をスキップ（インデックス0）
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                
                // 🔧 ユーザーIDのフィルタリングを修正
                // routines_masterシートの構造に応じて調整
                // A列: routine_id, B列: created_at, C列: name, D列: description, E列: category, F列: is_active, G列: estimated_duration, H列: last_executed, I列: total_executions
                // ユーザーIDは別のシートまたは列にある可能性があります
                
                // is_active列（F列、インデックス5）をチェック
                const isActive = row[5] === 'TRUE' || row[5] === true;
                
                if (isActive) {
                    const routine = {
                        id: parseInt(row[0]) || row[0],           // routine_id (A列)
                        userId: userId,                           // 🔧 userIdを直接設定（別途取得が必要な場合は修正）
                        createdAt: row[1],                        // created_at (B列)
                        name: row[2],                             // name (C列)
                        description: row[3] || '',                // description (D列)
                        category: row[4] || 'general',            // category (E列)
                        isActive: isActive,                       // is_active (F列)
                        estimatedDuration: parseInt(row[6]) || 0, // estimated_duration (G列)
                        lastExecuted: row[7],                     // last_executed (H列)
                        totalExecutions: parseInt(row[8]) || 0    // total_executions (I列)
                    };
                    
                    // 🔧 特定のキーワードでフィルタリング（朝/夜のルーティン用）
                    // または全てのルーティンを返して、呼び出し側でフィルタリング
                    routines.push(routine);
                }
            }
            
            console.log('✅ ルーティン取得完了:', { count: routines.length });
            return routines;
            
        } catch (error) {
            console.error('ユーザールーティン取得エラー:', error);
            return [];
        }
    }

    async getRoutines(userId) {
        try {
            // getUserRoutinesと同じ実装を使用
            return await this.getUserRoutines(userId);
        } catch (error) {
            console.error('ルーティン一覧取得エラー:', error);
            return [];
        }
    }

    async getRoutineInfo(routineId) {
        try {
            if (sheetsUtils.getRoutineById) {
                return await sheetsUtils.getRoutineById(routineId);
            } else {
                console.warn('getRoutineById メソッドが見つかりません');
                return {
                    id: routineId,
                    name: 'テストルーティン',
                    description: 'テスト用のルーティンです',
                    category: 'general',
                    totalExecutions: 0
                };
            }
        } catch (error) {
            console.error('ルーティン情報取得エラー:', error);
            return null;
        }
    }

    async updateRoutine(routineId, updates) {
        try {
            if (sheetsUtils.updateRoutine) {
                return await sheetsUtils.updateRoutine(routineId, updates);
            } else {
                console.warn('updateRoutine メソッドが見つかりません');
                return true;
            }
        } catch (error) {
            console.error('ルーティン更新エラー:', error);
            return false;
        }
    }

    async deleteRoutine(routineId) {
        try {
            if (sheetsUtils.updateRoutine) {
                return await sheetsUtils.updateRoutine(routineId, { status: 'deleted' });
            } else {
                console.warn('updateRoutine メソッドが見つかりません');
                return true;
            }
        } catch (error) {
            console.error('ルーティン削除エラー:', error);
            return false;
        }
    }

    // === ルーティンステップ管理 ===

    async addRoutineStep(routineId, stepName, description = '', estimatedMinutes = 0, isRequired = true) {
        try {
            if (sheetsUtils.saveRoutineStep) {
                return await sheetsUtils.saveRoutineStep(routineId, stepName, description, estimatedMinutes, isRequired);
            } else {
                console.warn('saveRoutineStep メソッドが見つかりません');
                return 'mock_step_' + Date.now();
            }
        } catch (error) {
            console.error('ルーティンステップ追加エラー:', error);
            throw error;
        }
    }

    async getRoutineSteps(routineId) {
        try {
            if (sheetsUtils.getRoutineSteps) {
                return await sheetsUtils.getRoutineSteps(routineId);
            } else {
                console.warn('getRoutineSteps メソッドが見つかりません');
                return [
                    {
                        stepId: 1,
                        routineId: routineId,
                        order: 1,
                        name: 'テストステップ1',
                        description: 'テスト用のステップです',
                        estimatedMinutes: 5,
                        isRequired: true
                    },
                    {
                        stepId: 2,
                        routineId: routineId,
                        order: 2,
                        name: 'テストステップ2',
                        description: 'テスト用のステップです',
                        estimatedMinutes: 10,
                        isRequired: true
                    }
                ];
            }
        } catch (error) {
            console.error('ルーティンステップ取得エラー:', error);
            return [];
        }
    }

    async updateRoutineStep(stepId, updates) {
        try {
            if (sheetsUtils.updateRoutineStep) {
                return await sheetsUtils.updateRoutineStep(stepId, updates);
            } else {
                console.warn('updateRoutineStep メソッドが見つかりません');
                return true;
            }
        } catch (error) {
            console.error('ルーティンステップ更新エラー:', error);
            return false;
        }
    }

    async deleteRoutineStep(stepId) {
        try {
            if (sheetsUtils.deleteRoutineStep) {
                return await sheetsUtils.deleteRoutineStep(stepId);
            } else {
                console.warn('deleteRoutineStep メソッドが見つかりません');
                return true;
            }
        } catch (error) {
            console.error('ルーティンステップ削除エラー:', error);
            return false;
        }
    }

    // === ルーティン実行管理 ===

    async startRoutineSession(userId, routineId, routineInfo, steps) {
        try {
            // 既存セッションがあれば削除
            if (this.activeSessions.has(userId)) {
                this.activeSessions.delete(userId);
            }

            // 実行記録を作成
            let executionId;
            if (sheetsUtils.saveRoutineExecution) {
                executionId = await sheetsUtils.saveRoutineExecution(userId, routineId);
            } else {
                console.warn('saveRoutineExecution メソッドが見つかりません');
                executionId = 'mock_execution_' + Date.now();
            }
            
            // セッションオブジェクトを作成
            const session = new RoutineSession(userId, routineId, routineInfo, steps, executionId);
            this.activeSessions.set(userId, session);
            
            return session;
        } catch (error) {
            console.error('ルーティンセッション開始エラー:', error);
            throw error;
        }
    }

    getActiveSession(userId) {
        return this.activeSessions.get(userId) || null;
    }

    removeSession(userId) {
        this.activeSessions.delete(userId);
    }

    // === 履歴・統計 ===

    async getTodayRoutineExecutions(userId) {
        try {
            if (sheetsUtils.getTodayRoutineExecutions) {
                return await sheetsUtils.getTodayRoutineExecutions(userId);
            } else {
                console.warn('getTodayRoutineExecutions メソッドが見つかりません');
                return [];
            }
        } catch (error) {
            console.error('今日のルーティン実行取得エラー:', error);
            return [];
        }
    }

    async getRoutineExecutionHistory(routineId, days = 30) {
        try {
            if (sheetsUtils.getRoutineExecutionHistory) {
                return await sheetsUtils.getRoutineExecutionHistory(routineId, days);
            } else {
                console.warn('getRoutineExecutionHistory メソッドが見つかりません');
                return [];
            }
        } catch (error) {
            console.error('ルーティン履歴取得エラー:', error);
            return [];
        }
    }

    async getRoutineStats(routineId, days = 30) {
        try {
            if (sheetsUtils.getRoutineStats) {
                return await sheetsUtils.getRoutineStats(routineId, days);
            } else {
                console.warn('getRoutineStats メソッドが見つかりません');
                return {
                    totalExecutions: 0,
                    completedExecutions: 0,
                    completionRate: 0,
                    avgDuration: 0,
                    avgCompletionRate: 0
                };
            }
        } catch (error) {
            console.error('ルーティン統計取得エラー:', error);
            return {
                totalExecutions: 0,
                completedExecutions: 0,
                completionRate: 0,
                avgDuration: 0,
                avgCompletionRate: 0
            };
        }
    }

    // === ユーティリティ ===

    async searchRoutines(userId, keyword) {
        try {
            if (sheetsUtils.searchRoutines) {
                return await sheetsUtils.searchRoutines(userId, keyword);
            } else {
                console.warn('searchRoutines メソッドが見つかりません');
                return [];
            }
        } catch (error) {
            console.error('ルーティン検索エラー:', error);
            return [];
        }
    }

    // === テンプレート ===

    getRoutineTemplate(type) {
        const templates = {
            morning_basic: {
                name: '基本的な朝ルーティン',
                description: '健康的な朝の習慣',
                category: 'morning',
                steps: [
                    { name: '起床', description: '決まった時間に起きる', minutes: 0, required: true },
                    { name: '水分補給', description: 'コップ1杯の水を飲む', minutes: 2, required: true },
                    { name: '軽いストレッチ', description: '体をほぐす', minutes: 10, required: false },
                    { name: '朝食', description: 'バランスの良い朝食', minutes: 20, required: true },
                    { name: '身支度', description: '歯磨き・洗顔・着替え', minutes: 15, required: true }
                ]
            },
            evening_basic: {
                name: '基本的な夜ルーティン',
                description: '良質な睡眠のための夜の習慣',
                category: 'evening',
                steps: [
                    { name: 'デジタルデトックス', description: 'スマホ・PCの使用を停止', minutes: 0, required: true },
                    { name: '入浴', description: 'リラックスできるお風呂時間', minutes: 30, required: true },
                    { name: '読書', description: '本を読んでリラックス', minutes: 20, required: false },
                    { name: '明日の準備', description: '翌日の予定確認と準備', minutes: 10, required: true },
                    { name: '就寝', description: '決まった時間に寝る', minutes: 0, required: true }
                ]
            },
            exercise_basic: {
                name: '基本的な運動ルーティン',
                description: '日常的な運動習慣',
                category: 'exercise',
                steps: [
                    { name: 'ウォームアップ', description: '軽いストレッチ', minutes: 5, required: true },
                    { name: '有酸素運動', description: 'ジョギングや自転車', minutes: 30, required: true },
                    { name: '筋力トレーニング', description: '基本的な筋トレ', minutes: 20, required: false },
                    { name: 'クールダウン', description: '整理体操', minutes: 5, required: true },
                    { name: '水分補給', description: '失った水分を補給', minutes: 5, required: true }
                ]
            },
            work_start: {
                name: '在宅ワーク開始ルーティン',
                description: '効率的な在宅ワーク開始の習慣',
                category: 'work',
                steps: [
                    { name: 'ワークスペース整理', description: 'デスク周りを片付ける', minutes: 5, required: true },
                    { name: 'PCセットアップ', description: '必要なアプリを起動', minutes: 3, required: true },
                    { name: 'メールチェック', description: '緊急メールを確認', minutes: 10, required: true },
                    { name: '今日のタスク確認', description: 'TODOリストを見直し', minutes: 5, required: true },
                    { name: 'カレンダー確認', description: '予定とミーティングを確認', minutes: 3, required: true },
                    { name: '集中モード開始', description: '通知オフ・集中環境作り', minutes: 2, required: true }
                ]
            },
            study_basic: {
                name: '基本的な学習ルーティン',
                description: '効果的な学習習慣',
                category: 'general',
                steps: [
                    { name: '学習環境準備', description: '机を片付け、教材を準備', minutes: 5, required: true },
                    { name: '目標設定', description: '今日の学習目標を決める', minutes: 3, required: true },
                    { name: '復習', description: '前回の内容を振り返る', minutes: 10, required: true },
                    { name: '新しい内容学習', description: 'メインの学習時間', minutes: 45, required: true },
                    { name: '理解度チェック', description: '学んだ内容を確認', minutes: 10, required: true },
                    { name: '学習記録', description: '進捗と感想を記録', minutes: 5, required: false }
                ]
            }
        };

        return templates[type] || null;
    }

    async createFromTemplate(templateType, userId) {
        try {
            const template = this.getRoutineTemplate(templateType);
            if (!template) {
                throw new Error('指定されたテンプレートが見つかりません');
            }

            // ルーティンを作成
            const routineId = await this.createRoutine(userId, template.name, template.description, template.category);

            // ステップを追加
            for (const step of template.steps) {
                await this.addRoutineStep(
                    routineId,
                    step.name,
                    step.description,
                    step.minutes,
                    step.required
                );
            }

            return routineId;
        } catch (error) {
            console.error('テンプレートからの作成エラー:', error);
            throw error;
        }
    }
}

module.exports = RoutineService;
