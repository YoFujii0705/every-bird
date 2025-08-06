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
            await sheetsUtils.updateRoutineExecution(this.executionId, {
                endTime: endTime.toISOString().slice(11, 16),
                status: 'completed',
                completedSteps: this.completedSteps
            });
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
            await sheetsUtils.updateRoutineExecution(this.executionId, {
                endTime: endTime.toISOString().slice(11, 16),
                status: 'aborted',
                completedSteps: this.completedSteps
            });
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
 * ルーティンサービスクラス
 */
class RoutineService {
    constructor() {
        // アクティブセッションを管理
        this.activeSessions = new Map(); // userId -> RoutineSession
    }

    // === ルーティン管理 ===

    async createRoutine(name, description = '', category = 'general') {
        try {
            return await sheetsUtils.saveRoutineToSheet('default_user', name, description, category);
        } catch (error) {
            console.error('ルーティン作成エラー:', error);
            throw error;
        }
    }

    async getRoutines(userId = 'default_user') {
        try {
            return await sheetsUtils.getUserRoutines(userId);
        } catch (error) {
            console.error('ルーティン一覧取得エラー:', error);
            return [];
        }
    }

    async getRoutineInfo(routineId) {
        try {
            return await sheetsUtils.getRoutineById(routineId);
        } catch (error) {
            console.error('ルーティン情報取得エラー:', error);
            return null;
        }
    }

    async updateRoutine(routineId, updates) {
        try {
            return await sheetsUtils.updateRoutine(routineId, updates);
        } catch (error) {
            console.error('ルーティン更新エラー:', error);
            return false;
        }
    }

    async deleteRoutine(routineId) {
        try {
            return await sheetsUtils.updateRoutine(routineId, { status: 'deleted' });
        } catch (error) {
            console.error('ルーティン削除エラー:', error);
            return false;
        }
    }

    // === ルーティンステップ管理 ===

    async addRoutineStep(routineId, stepName, description = '', estimatedMinutes = 0, isRequired = true) {
        try {
            return await sheetsUtils.saveRoutineStep(routineId, stepName, description, estimatedMinutes, isRequired);
        } catch (error) {
            console.error('ルーティンステップ追加エラー:', error);
            throw error;
        }
    }

    async getRoutineSteps(routineId) {
        try {
            return await sheetsUtils.getRoutineSteps(routineId);
        } catch (error) {
            console.error('ルーティンステップ取得エラー:', error);
            return [];
        }
    }

    async updateRoutineStep(stepId, updates) {
        try {
            return await sheetsUtils.updateRoutineStep(stepId, updates);
        } catch (error) {
            console.error('ルーティンステップ更新エラー:', error);
            return false;
        }
    }

    async deleteRoutineStep(stepId) {
        try {
            return await sheetsUtils.deleteRoutineStep(stepId);
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
            const executionId = await sheetsUtils.saveRoutineExecution(userId, routineId);
            
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
            return await sheetsUtils.getTodayRoutineExecutions(userId);
        } catch (error) {
            console.error('今日のルーティン実行取得エラー:', error);
            return [];
        }
    }

    async getRoutineExecutionHistory(routineId, days = 30) {
        try {
            return await sheetsUtils.getRoutineExecutionHistory(routineId, days);
        } catch (error) {
            console.error('ルーティン履歴取得エラー:', error);
            return [];
        }
    }

    async getRoutineStats(routineId, days = 30) {
        try {
            return await sheetsUtils.getRoutineStats(routineId, days);
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
            return await sheetsUtils.searchRoutines(userId, keyword);
        } catch (error) {
            console.error('ルーティン検索エラー:', error);
            return [];
        }
    }

    async copyRoutine(sourceId, newName, userId) {
        try {
            // コピー元の情報を取得
            const sourceRoutine = await this.getRoutineInfo(sourceId);
            if (!sourceRoutine) {
                throw new Error('コピー元のルーティンが見つかりません');
            }

            const sourceSteps = await this.getRoutineSteps(sourceId);

            // 新しいルーティンを作成
            const newRoutineId = await sheetsUtils.saveRoutineToSheet(
                userId,
                newName,
                `${sourceRoutine.description} (コピー)`,
                sourceRoutine.category
            );

            // ステップをコピー
            for (const step of sourceSteps) {
                await this.addRoutineStep(
                    newRoutineId,
                    step.name,
                    step.description,
                    step.estimatedMinutes,
                    step.isRequired
                );
            }

            return newRoutineId;
        } catch (error) {
            console.error('ルーティンコピーエラー:', error);
            throw error;
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
            const routineId = await sheetsUtils.saveRoutineToSheet(
                userId,
                template.name,
                template.description,
                template.category
            );

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
