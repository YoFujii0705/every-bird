const moment = require('moment');

class RoutineHabitLinkService {
  constructor(sheetsUtils) {
    this.sheetsUtils = sheetsUtils;
    
    console.log('🔗 RoutineHabitLinkService初期化');
  }

  /**
   * ルーティンステップと習慣を連携
   * @param {string} userId - ユーザーID
   * @param {number} routineId - ルーティンID
   * @param {number} stepId - ステップID
   * @param {string} habitId - 習慣ID
   * @param {string} linkType - 連携タイプ ('completion', 'partial')
   */
  async createLink(userId, routineId, stepId, habitId, linkType = 'completion') {
    try {
      // 既存の連携をチェック
      const existingLink = await this.getLinkByStep(routineId, stepId);
      if (existingLink) {
        throw new Error(`ステップID ${stepId} は既に習慣と連携されています`);
      }

      // 習慣の存在確認
      const habit = await this.sheetsUtils.getHabitById(habitId);
      if (!habit || habit.userId !== userId) {
        throw new Error('指定された習慣が見つからないか、権限がありません');
      }

      // 連携を作成
      const linkId = await this.sheetsUtils.getNextId('routine_habit_links');
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      const values = [
        linkId,           // A列: link_id
        userId,           // B列: user_id
        routineId,        // C列: routine_id
        stepId,           // D列: step_id
        habitId,          // E列: habit_id
        linkType,         // F列: link_type
        'TRUE',           // G列: is_active
        now               // H列: created_at
      ];
      
      await this.sheetsUtils.saveToSheet('routine_habit_links', values);
      
      console.log('🔗 ルーティン-習慣連携作成:', { linkId, routineId, stepId, habitId });
      return linkId;
      
    } catch (error) {
      console.error('ルーティン-習慣連携作成エラー:', error);
      throw error;
    }
  }

  /**
   * 連携を削除
   * @param {string} userId - ユーザーID
   * @param {number} linkId - 連携ID
   */
  async removeLink(userId, linkId) {
    try {
      const link = await this.getLinkById(linkId);
      if (!link || link.userId !== userId) {
        throw new Error('指定された連携が見つからないか、権限がありません');
      }

      // is_activeをFALSEに更新（ソフト削除）
      await this.updateLinkStatus(linkId, false);
      
      console.log('🔗 ルーティン-習慣連携削除:', { linkId });
      return true;
      
    } catch (error) {
      console.error('ルーティン-習慣連携削除エラー:', error);
      throw error;
    }
  }

  /**
   * ステップIDで連携を取得
   * @param {number} routineId - ルーティンID
   * @param {number} stepId - ステップID
   * @returns {Object|null} 連携情報
   */
  async getLinkByStep(routineId, stepId) {
    try {
      const data = await this.sheetsUtils.getSheetData('routine_habit_links', 'A:H');
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (parseInt(row[2]) === routineId && 
            parseInt(row[3]) === stepId && 
            row[6] === 'TRUE') { // is_active
          
          return {
            linkId: parseInt(row[0]),
            userId: row[1],
            routineId: parseInt(row[2]),
            stepId: parseInt(row[3]),
            habitId: row[4],
            linkType: row[5],
            isActive: row[6] === 'TRUE',
            createdAt: row[7]
          };
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('ステップ連携取得エラー:', error);
      return null;
    }
  }

  /**
   * 連携IDで連携を取得
   * @param {number} linkId - 連携ID
   * @returns {Object|null} 連携情報
   */
  async getLinkById(linkId) {
    try {
      const data = await this.sheetsUtils.getSheetData('routine_habit_links', 'A:H');
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (parseInt(row[0]) === linkId) {
          return {
            linkId: parseInt(row[0]),
            userId: row[1],
            routineId: parseInt(row[2]),
            stepId: parseInt(row[3]),
            habitId: row[4],
            linkType: row[5],
            isActive: row[6] === 'TRUE',
            createdAt: row[7]
          };
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('連携ID取得エラー:', error);
      return null;
    }
  }

  /**
   * ユーザーの全連携を取得
   * @param {string} userId - ユーザーID
   * @returns {Array} 連携リスト
   */
  async getUserLinks(userId) {
    try {
      const data = await this.sheetsUtils.getSheetData('routine_habit_links', 'A:H');
      const links = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[1] === userId && row[6] === 'TRUE') { // user_id & is_active
          links.push({
            linkId: parseInt(row[0]),
            userId: row[1],
            routineId: parseInt(row[2]),
            stepId: parseInt(row[3]),
            habitId: row[4],
            linkType: row[5],
            isActive: row[6] === 'TRUE',
            createdAt: row[7]
          });
        }
      }
      
      console.log(`🔗 ユーザー ${userId} の連携: ${links.length}件`);
      return links;
      
    } catch (error) {
      console.error('ユーザー連携取得エラー:', error);
      return [];
    }
  }

  /**
   * ルーティンの全連携を取得
   * @param {number} routineId - ルーティンID
   * @returns {Array} 連携リスト
   */
  async getRoutineLinks(routineId) {
    try {
      const data = await this.sheetsUtils.getSheetData('routine_habit_links', 'A:H');
      const links = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (parseInt(row[2]) === routineId && row[6] === 'TRUE') { // routine_id & is_active
          links.push({
            linkId: parseInt(row[0]),
            userId: row[1],
            routineId: parseInt(row[2]),
            stepId: parseInt(row[3]),
            habitId: row[4],
            linkType: row[5],
            isActive: row[6] === 'TRUE',
            createdAt: row[7]
          });
        }
      }
      
      return links;
      
    } catch (error) {
      console.error('ルーティン連携取得エラー:', error);
      return [];
    }
  }

  /**
   * ステップ完了時の習慣自動記録
   * @param {string} userId - ユーザーID
   * @param {number} routineId - ルーティンID
   * @param {number} stepId - ステップID
   * @param {string} status - ステップ完了状況 ('completed', 'skipped')
   */
  async processStepCompletion(userId, routineId, stepId, status) {
    try {
      // 連携を確認
      const link = await this.getLinkByStep(routineId, stepId);
      if (!link) {
        console.log('🔗 連携なし - 習慣記録をスキップ:', { routineId, stepId });
        return null;
      }

      // ステップが完了した場合のみ習慣を記録
      if (status === 'completed') {
        const today = moment().format('YYYY-MM-DD');
        
        // 既に今日記録済みかチェック
        const todayLogs = await this.sheetsUtils.getHabitLogsForDate(userId, today);
        const alreadyRecorded = todayLogs.some(log => log.habitId === link.habitId);
        
        if (!alreadyRecorded) {
          // 習慣を記録
          await this.sheetsUtils.saveHabitLog(userId, link.habitId, today);
          
          // ストリークを更新
          const newStreak = await this.sheetsUtils.updateHabitStreak(userId, link.habitId);
          
          console.log('🔗 習慣自動記録:', { 
            habitId: link.habitId, 
            newStreak,
            triggeredBy: `routine-${routineId}-step-${stepId}`
          });
          
          return {
            habitId: link.habitId,
            newStreak,
            recordedDate: today
          };
        } else {
          console.log('🔗 習慣既に記録済み:', { habitId: link.habitId, date: today });
          return null;
        }
      } else {
        console.log('🔗 ステップ未完了 - 習慣記録をスキップ:', { status });
        return null;
      }
      
    } catch (error) {
      console.error('ステップ完了処理エラー:', error);
      return null;
    }
  }

  /**
   * 連携ステータスを更新
   * @param {number} linkId - 連携ID
   * @param {boolean} isActive - アクティブ状況
   */
  async updateLinkStatus(linkId, isActive) {
    try {
      // 実際のシート更新処理を実装
      // 現在は簡易版
      console.log(`🔗 連携ステータス更新: ${linkId} - ${isActive ? '有効' : '無効'}`);
      return true;
      
    } catch (error) {
      console.error('連携ステータス更新エラー:', error);
      return false;
    }
  }

  /**
   * 連携統計を取得
   * @param {string} userId - ユーザーID
   * @returns {Object} 連携統計
   */
  async getLinkStats(userId) {
    try {
      const links = await this.getUserLinks(userId);
      const today = moment().format('YYYY-MM-DD');
      const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
      
      // 今日の連携実行状況
      const todayHabitLogs = await this.sheetsUtils.getHabitLogsForDate(userId, today);
      const todayLinkedHabits = links.filter(link => 
        todayHabitLogs.some(log => log.habitId === link.habitId)
      );

      // 今週の連携実行状況
      const weekHabitLogs = await this.sheetsUtils.getHabitLogsInRange(userId, startOfWeek, today);
      const weekLinkedExecutions = weekHabitLogs.filter(log =>
        links.some(link => link.habitId === log.habitId)
      );

      return {
        totalLinks: links.length,
        todayExecutions: todayLinkedHabits.length,
        weekExecutions: weekLinkedExecutions.length,
        completionRate: links.length > 0 ? (todayLinkedHabits.length / links.length * 100).toFixed(1) : 0
      };
      
    } catch (error) {
      console.error('連携統計取得エラー:', error);
      return {
        totalLinks: 0,
        todayExecutions: 0,
        weekExecutions: 0,
        completionRate: 0
      };
    }
  }

  /**
   * 連携の詳細情報を取得（習慣名、ルーティン名等を含む）
   * @param {Array} links - 連携リスト
   * @returns {Array} 詳細連携情報
   */
  async enrichLinks(links) {
    try {
      const enrichedLinks = [];
      
      for (const link of links) {
        // 習慣情報を取得
        const habit = await this.sheetsUtils.getHabitById(link.habitId);
        
        // ルーティン情報を取得
        const routine = await this.sheetsUtils.getRoutineById(link.routineId);
        
        // ステップ情報を取得
        const steps = await this.sheetsUtils.getRoutineSteps(link.routineId);
        const step = steps.find(s => s.stepId === link.stepId);
        
        enrichedLinks.push({
          ...link,
          habitName: habit ? habit.name : '不明な習慣',
          routineName: routine ? routine.name : '不明なルーティン',
          stepName: step ? step.name : '不明なステップ',
          stepOrder: step ? step.order : 0
        });
      }
      
      return enrichedLinks.sort((a, b) => a.routineId - b.routineId || a.stepOrder - b.stepOrder);
      
    } catch (error) {
      console.error('連携詳細取得エラー:', error);
      return links;
    }
  }
}

module.exports = RoutineHabitLinkService;
