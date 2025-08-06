const { google } = require('googleapis');
const moment = require('moment');
const config = require('../config.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const calculations = require('./calculations');

// Google Sheets API初期化
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

// ===== 日記関連 =====

async function saveDiaryToSheet(userId, date, content, mood) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${config.google_sheets.diary_sheet_name}!A:E`;
    
    const values = [[
        date,
        userId,
        content,
        mood,
        moment().format('YYYY-MM-DD HH:mm:ss')
    ]];
    
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values }
    });
}

async function getDiaryEntry(userId, date) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${config.google_sheets.diary_sheet_name}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const entry = rows.find(row => row[0] === date && row[1] === userId);
        
        if (entry) {
            return {
                date: entry[0],
                content: entry[2],
                mood: entry[3]
            };
        }
        return null;
    } catch (error) {
        console.error('日記取得エラー:', error);
        return null;
    }
}

async function getDiaryEntriesInRange(userId, startDate, endDate) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${config.google_sheets.diary_sheet_name}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        return rows.filter(row => {
            const entryDate = row[0];
            const entryUserId = row[1];
            return entryUserId === userId && 
                   moment(entryDate).isBetween(startDate, endDate, 'day', '[]');
        }).map(row => ({
            date: row[0],
            content: row[2],
            mood: row[3]
        }));
    } catch (error) {
        console.error('日記取得エラー:', error);
        return [];
    }
}

// ===== 日記目標関連 =====

async function saveDiaryGoal(userId, goalType, goalContent) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals_data';
    
    try {
        // 既存の同種目標を無効化（削除）
        await removeExistingDiaryGoal(userId, goalType);
        
        // 新しい目標を追加
        const goalId = `diary_goal_${goalType}_${Date.now()}`;
        const range = `${sheetName}!A:E`;
        const values = [[
            goalId,
            userId,
            'diary',
            goalContent,
            moment().format('YYYY-MM-DD HH:mm:ss')
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('📝 日記目標保存:', { userId: userId.substring(0, 4) + '...', goalType });
        return Promise.resolve();
    } catch (error) {
        console.error('日記目標保存エラー:', error);
        throw error;
    }
}

async function removeExistingDiaryGoal(userId, goalType) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals-data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // 削除すべき行を特定（逆順で削除）
        const rowsToDelete = [];
        rows.forEach((row, index) => {
            if (row[1] === userId && row[2] === 'diary') {
                try {
                    const goalData = JSON.parse(row[3]);
                    if (goalData.type === goalType) {
                        rowsToDelete.push(index);
                    }
                } catch (parseError) {
                    // JSON解析エラーは無視
                }
            }
        });
        
        // 行を削除（後ろから削除して番号がずれないようにする）
        for (let i = rowsToDelete.length - 1; i >= 0; i--) {
            const rowIndex = rowsToDelete[i];
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // メインシートのID（通常0）
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                }
            });
        }
    } catch (error) {
        console.error('既存日記目標削除エラー:', error);
        // エラーが発生しても続行（新規追加は可能）
    }
}

async function getDiaryGoals(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const diaryGoals = rows.filter(row => 
            row[1] === userId && row[2] === 'diary'
        ).map(row => ({
            goalId: row[0],
            userId: row[1],
            type: row[2],
            content: row[3],
            createdAt: row[4]
        })).sort((a, b) => moment(b.createdAt).diff(moment(a.createdAt)));
        
        console.log('📝 日記目標取得:', { userId: userId.substring(0, 4) + '...', count: diaryGoals.length });
        return diaryGoals;
        
    } catch (error) {
        console.error('日記目標取得エラー:', error);
        return [];
    }
}

async function getDiaryGoalsByType(userId, goalType) {
    const allGoals = await getDiaryGoals(userId);
    return allGoals.filter(goal => {
        try {
            const goalData = JSON.parse(goal.content);
            return goalData.type === goalType;
        } catch (error) {
            return false;
        }
    });
}

// 日記の統計データ取得（拡張版）
async function getDiaryStatsInRange(userId, startDate, endDate) {
    const entries = await getDiaryEntriesInRange(userId, startDate, endDate);
    
    if (entries.length === 0) {
        return {
            totalEntries: 0,
            recordingRate: 0,
            averageLength: 0,
            moodStats: {},
            positiveRate: 0
        };
    }
    
    // 基本統計
    const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
    const totalEntries = entries.length;
    const recordingRate = ((totalEntries / totalDays) * 100).toFixed(1);
    
    // 文字数統計
    const contentLengths = entries.map(e => e.content ? e.content.length : 0);
    const averageLength = contentLengths.length > 0 ? 
        Math.round(contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length) : 0;
    
    // 気分統計
    const moodCounts = {};
    const positiveMoods = ['😊', '🙂'];
    let positiveCount = 0;
    
    entries.forEach(entry => {
        if (entry.mood) {
            moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
            if (positiveMoods.includes(entry.mood)) {
                positiveCount++;
            }
        }
    });
    
    const positiveRate = totalEntries > 0 ? ((positiveCount / totalEntries) * 100).toFixed(1) : 0;
    
    return {
        totalEntries,
        recordingRate: parseFloat(recordingRate),
        averageLength,
        moodStats: moodCounts,
        positiveRate: parseFloat(positiveRate),
        entries: entries
    };
}

// 日記目標の進捗計算
async function calculateDiaryGoalProgress(userId, goalData) {
    const now = moment();
    let startDate, endDate;
    
    // 期間の設定
    switch (goalData.period) {
        case 'weekly':
            startDate = now.clone().startOf('isoWeek').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
            break;
        case 'monthly':
            startDate = now.clone().startOf('month').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
            break;
        default:
            // デフォルトは今月
            startDate = now.clone().startOf('month').format('YYYY-MM-DD');
            endDate = now.format('YYYY-MM-DD');
    }
    
    const stats = await getDiaryStatsInRange(userId, startDate, endDate);
    
    let current = 0;
    let target = goalData.target;
    
    switch (goalData.type) {
        case 'frequency':
            current = stats.totalEntries;
            break;
        case 'mood':
            current = stats.positiveRate;
            break;
        case 'review':
            // 振り返り目標の進捗は別途実装
            current = 0;
            target = 1;
            break;
    }
    
    const percentage = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    
    return {
        current,
        target,
        percentage: percentage.toFixed(1),
        period: goalData.period,
        startDate,
        endDate
    };
}

// ===== 体重関連（モック版・完全機能） =====

// インメモリストレージ（モック用）
let mockWeightEntries = [];
let mockWeightGoals = [];

async function saveWeightToSheet(userId, date, weight, memo) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    
    try {
        // 既存エントリーをチェック
        const existingEntry = await getWeightEntry(userId, date);
        
        if (existingEntry) {
            // 既存エントリーを更新
            await updateWeightEntry(userId, date, weight, memo);
            console.log('⚖️ 体重更新:', { userId: userId.substring(0, 4) + '...', date, weight });
        } else {
            // 新規エントリーを追加
            const range = `${sheetName}!A:E`;
            const values = [[
                date,
                userId,
                weight.toString(),
                memo || '',
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource: { values }
            });
            
            console.log('⚖️ 体重保存:', { userId: userId.substring(0, 4) + '...', date, weight });
        }
        
        return Promise.resolve();
    } catch (error) {
        console.error('体重保存エラー:', error);
        throw error;
    }
}

async function updateWeightEntry(userId, date, weight, memo) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    const range = `${sheetName}!A:E`;
    
    try {
        // 全データを取得
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // 該当行を見つける
        const rowIndex = rows.findIndex(row => row[0] === date && row[1] === userId);
        
        if (rowIndex >= 0) {
            // 該当行を更新（ヘッダー行+1でGoogle Sheetsの行番号）
            const updateRange = `${sheetName}!A${rowIndex + 1}:E${rowIndex + 1}`;
            const values = [[
                date,
                userId,
                weight.toString(),
                memo || '',
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values }
            });
        }
    } catch (error) {
        console.error('体重更新エラー:', error);
        throw error;
    }
}

async function getWeightEntry(userId, date) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const entry = rows.find(row => row[0] === date && row[1] === userId);
        
        if (entry) {
            return {
                date: entry[0],
                userId: entry[1],
                weight: entry[2],
                memo: entry[3] || '',
                timestamp: entry[4]
            };
        }
        return null;
    } catch (error) {
        console.error('体重取得エラー:', error);
        return null;
    }
}

async function getWeightEntriesInRange(userId, startDate, endDate) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        return rows.filter(row => {
            const entryDate = row[0];
            const entryUserId = row[1];
            return entryUserId === userId && 
                   moment(entryDate).isBetween(startDate, endDate, 'day', '[]');
        }).map(row => ({
            date: row[0],
            userId: row[1],
            weight: row[2],
            memo: row[3] || '',
            timestamp: row[4]
        })).sort((a, b) => moment(a.date).diff(moment(b.date)));
    } catch (error) {
        console.error('体重範囲取得エラー:', error);
        return [];
    }
}

async function getLastWeightEntry(userId, excludeDate) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const userEntries = rows.filter(row => 
            row[1] === userId && row[0] !== excludeDate
        ).map(row => ({
            date: row[0],
            userId: row[1],
            weight: row[2],
            memo: row[3] || '',
            timestamp: row[4]
        })).sort((a, b) => moment(b.date).diff(moment(a.date)));
        
        return userEntries[0] || null;
    } catch (error) {
        console.error('前回体重取得エラー:', error);
        return null;
    }
}

async function getLatestWeightEntry(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const userEntries = rows.filter(row => row[1] === userId)
            .map(row => ({
                date: row[0],
                userId: row[1],
                weight: row[2],
                memo: row[3] || '',
                timestamp: row[4]
            }))
            .sort((a, b) => moment(b.date).diff(moment(a.date)));
        
        return userEntries[0] || null;
    } catch (error) {
        console.error('最新体重取得エラー:', error);
        return null;
    }
}

async function saveWeightGoal(userId, target, deadline) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals_data';
    
    try {
        // 既存の体重目標を無効化（削除）
        await removeExistingWeightGoal(userId);
        
        // 新しい目標を追加
        const goalId = `weight_goal_${Date.now()}`;
        const range = `${sheetName}!A:E`;
        const values = [[
            goalId,
            userId,
            'weight',
            JSON.stringify({ target, deadline }),
            moment().format('YYYY-MM-DD HH:mm:ss')
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('🎯 体重目標保存:', { userId: userId.substring(0, 4) + '...', target, deadline });
        return Promise.resolve();
    } catch (error) {
        console.error('体重目標保存エラー:', error);
        throw error;
    }
}

async function removeExistingWeightGoal(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // 削除すべき行を特定（逆順で削除）
        const rowsToDelete = [];
        rows.forEach((row, index) => {
            if (row[1] === userId && row[2] === 'weight') {
                rowsToDelete.push(index);
            }
        });
        
        // 行を削除（後ろから削除して番号がずれないようにする）
        for (let i = rowsToDelete.length - 1; i >= 0; i--) {
            const rowIndex = rowsToDelete[i];
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // メインシートのID（通常0）
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                }
            });
        }
    } catch (error) {
        console.error('既存目標削除エラー:', error);
        // エラーが発生しても続行（新規追加は可能）
    }
}

async function getWeightGoal(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.goals_sheet_name || 'goals_data';
    const range = `${sheetName}!A:E`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const goalEntries = rows.filter(row => 
            row[1] === userId && row[2] === 'weight'
        ).sort((a, b) => moment(b[4]).diff(moment(a[4])));
        
        if (goalEntries.length > 0) {
            const goalData = JSON.parse(goalEntries[0][3]);
            return {
                target: goalData.target,
                deadline: goalData.deadline
            };
        }
        
        return null;
    } catch (error) {
        console.error('体重目標取得エラー:', error);
        return null;
    }
}

// 指定期間のルーティン実行記録を取得
async function getRoutineExecutionsInRange(userId, startDate, endDate) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = 'routine_executions'; // ルーティン実行記録シート名
        const range = `${sheetName}!A:H`; // execution_id〜notesまでの全列
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        if (rows.length <= 1) {
            return []; // ヘッダー行のみまたはデータなし
        }
        
        // ルーティンマスターシートからルーティン名を取得（キャッシュ用）
        const routineNamesCache = await getRoutineNamesCache();
        
        const executions = [];
        
        // ヘッダー行をスキップして処理
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            const executionDate = row[2]; // execution_date列
            const executionUserId = row[1]; // user_id列（もしあれば）
            
            // 日付範囲チェック
            if (executionDate && 
                moment(executionDate).isBetween(startDate, endDate, 'day', '[]')) {
                
                // ユーザーIDチェック（ユーザーID列があれば）
                const routineId = row[1]; // routine_id列
                const routineName = routineNamesCache[routineId] || `ルーティン${routineId}`;
                
                executions.push({
                    executionId: row[0],
                    routineId: routineId,
                    routineName: routineName,
                    executionDate: executionDate,
                    startTime: row[3],
                    endTime: row[4],
                    status: row[5] || 'unknown',
                    completedSteps: parseInt(row[6]) || 0,
                    notes: row[7] || ''
                });
            }
        }
        
        console.log(`📊 ルーティン実行データ取得: ${executions.length}件 (${startDate} - ${endDate})`);
        return executions;
        
    } catch (error) {
        console.error('ルーティン実行データ取得エラー:', error);
        return [];
    }
}

// ルーティン名キャッシュを取得（パフォーマンス向上用）
async function getRoutineNamesCache() {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = 'routines_master';
        const range = `${sheetName}!A:C`; // routine_id, created_at, name
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const cache = {};
        
        // ヘッダー行をスキップ
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const routineId = row[0];
            const routineName = row[2];
            
            if (routineId && routineName) {
                cache[routineId] = routineName;
            }
        }
        
        return cache;
        
    } catch (error) {
        console.error('ルーティン名キャッシュ取得エラー:', error);
        return {};
    }
}

// utils/sheets.js に追加するユーザープロフィール関連関数

// ===== ユーザープロフィール関連 =====

async function saveUserProfile(userId, height, age) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.user_profile_sheet_name || 'user_profile';
    
    try {
        // 既存プロフィールをチェック
        const existingProfile = await getUserProfile(userId);
        
        if (existingProfile) {
            // 既存プロフィールを更新
            await updateUserProfile(userId, height, age);
            console.log('👤 プロフィール更新:', { userId: userId.substring(0, 4) + '...', height, age });
        } else {
            // 新規プロフィールを追加
            const range = `${sheetName}!A:D`;
            const values = [[
                userId,
                height.toString(),
                age.toString(),
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource: { values }
            });
            
            console.log('👤 プロフィール保存:', { userId: userId.substring(0, 4) + '...', height, age });
        }
        
        return Promise.resolve();
    } catch (error) {
        console.error('プロフィール保存エラー:', error);
        throw error;
    }
}

async function updateUserProfile(userId, height, age) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.user_profile_sheet_name || 'user_profile';
    const range = `${sheetName}!A:D`;
    
    try {
        // 全データを取得
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // 該当行を見つける
        const rowIndex = rows.findIndex(row => row[0] === userId);
        
        if (rowIndex >= 0) {
            // 該当行を更新（ヘッダー行+1でGoogle Sheetsの行番号）
            const updateRange = `${sheetName}!A${rowIndex + 1}:D${rowIndex + 1}`;
            const values = [[
                userId,
                height.toString(),
                age.toString(),
                moment().format('YYYY-MM-DD HH:mm:ss')
            ]];
            
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values }
            });
        }
    } catch (error) {
        console.error('プロフィール更新エラー:', error);
        throw error;
    }
}

async function getUserProfile(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.user_profile_sheet_name || 'user_profile';
    const range = `${sheetName}!A:D`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const profileRow = rows.find(row => row[0] === userId);
        
        if (profileRow) {
            return {
                userId: profileRow[0],
                height: profileRow[1] ? parseFloat(profileRow[1]) : null,
                age: profileRow[2] ? parseInt(profileRow[2]) : null,
                updatedAt: profileRow[3]
            };
        }
        return null;
    } catch (error) {
        console.error('プロフィール取得エラー:', error);
        return null;
    }
}

// ===== 習慣関連（完全版・Google Sheets連携） =====

async function saveHabitToSheet(userId, name, frequency, difficulty) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    
    try {
        const habitId = `habit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const range = `${sheetName}!A:G`;
        
        const values = [[
            habitId,     // A列: 習慣ID
            userId,      // B列: ユーザーID
            name,        // C列: 習慣名
            frequency,   // D列: 頻度
            difficulty,  // E列: 難易度
            0,           // F列: 現在ストリーク
            'active'     // G列: ステータス
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('🏃 習慣保存 (Google Sheets):', { habitId, name, frequency, difficulty });
        return habitId;
    } catch (error) {
        console.error('習慣保存エラー:', error);
        throw error;
    }
}

async function getUserHabits(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    const range = `${sheetName}!A:G`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const userHabits = rows.filter(row => 
            row[1] === userId && row[6] === 'active' // ユーザーIDとアクティブ状態
        ).map(row => ({
            id: row[0],           // A列: 習慣ID
            userId: row[1],       // B列: ユーザーID
            name: row[2],         // C列: 習慣名
            frequency: row[3],    // D列: 頻度
            difficulty: row[4],   // E列: 難易度
            currentStreak: parseInt(row[5]) || 0, // F列: 現在ストリーク
            status: row[6]        // G列: ステータス
        }));
        
        console.log('📋 習慣一覧取得 (Google Sheets):', { userId: userId.substring(0, 4) + '...', count: userHabits.length });
        return userHabits;
    } catch (error) {
        console.error('習慣一覧取得エラー:', error);
        return [];
    }
}

async function getHabitById(habitId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    const range = `${sheetName}!A:G`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const habitRow = rows.find(row => row[0] === habitId);
        
        if (habitRow) {
            return {
                id: habitRow[0],           // A列: 習慣ID
                userId: habitRow[1],       // B列: ユーザーID
                name: habitRow[2],         // C列: 習慣名
                frequency: habitRow[3],    // D列: 頻度
                difficulty: habitRow[4],   // E列: 難易度
                currentStreak: parseInt(habitRow[5]) || 0, // F列: 現在ストリーク
                status: habitRow[6]        // G列: ステータス
            };
        }
        
        console.log('🔍 習慣ID取得 (Google Sheets):', { habitId, found: false });
        return null;
    } catch (error) {
        console.error('習慣ID取得エラー:', error);
        return null;
    }
}

async function getHabitByName(userId, habitName) {
    const habits = await getUserHabits(userId);
    return habits.find(h => h.name === habitName) || null;
}

async function saveHabitLog(userId, habitId, date) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
    
    try {
        // 既に同じ日に記録があるかチェック
        const existingLog = await getHabitLogForDate(userId, habitId, date);
        if (existingLog) {
            console.log('✅ 習慣ログ既存 (Google Sheets):', { userId: userId.substring(0, 4) + '...', habitId: habitId.substring(0, 10) + '...', date });
            return; // 既に記録済み
        }
        
        const range = `${sheetName}!A:D`;
        const values = [[
            moment().format('YYYY-MM-DD HH:mm:ss'), // 記録日時
            userId,
            habitId,
            date // 実行日
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('✅ 習慣ログ保存 (Google Sheets):', { userId: userId.substring(0, 4) + '...', habitId: habitId.substring(0, 10) + '...', date });
        return Promise.resolve();
    } catch (error) {
        console.error('習慣ログ保存エラー:', error);
        throw error;
    }
}

async function getHabitLogForDate(userId, habitId, date) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
    const range = `${sheetName}!A:D`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const log = rows.find(row => 
            row[1] === userId && row[2] === habitId && row[3] === date
        );
        
        return log ? {
            timestamp: row[0],
            userId: row[1],
            habitId: row[2],
            date: row[3]
        } : null;
    } catch (error) {
        console.error('習慣ログ取得エラー:', error);
        return null;
    }
}

async function updateHabit(habitId, name, frequency, difficulty) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    const range = `${sheetName}!A:G`;
    
    try {
        // 全データを取得
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === habitId);
        
        if (rowIndex >= 0) {
            // 該当行を更新（現在のストリークは保持）
            const currentStreak = rows[rowIndex][5] || 0; // F列: 現在ストリーク
            const updateRange = `${sheetName}!A${rowIndex + 1}:G${rowIndex + 1}`;
            const values = [[
                habitId,     // A列: 習慣ID
                rows[rowIndex][1], // B列: ユーザーID（変更なし）
                name,        // C列: 習慣名（更新）
                frequency,   // D列: 頻度（更新）
                difficulty,  // E列: 難易度（更新）
                currentStreak, // F列: 現在ストリーク（保持）
                'active'     // G列: ステータス（保持）
            ]];
            
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values }
            });
            
            console.log('✏️ 習慣更新 (Google Sheets):', { habitId: habitId.substring(0, 10) + '...', name, frequency, difficulty });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('習慣更新エラー:', error);
        return false;
    }
}

async function getHabitLogsInRange(userId, startDate, endDate) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
    const range = `${sheetName}!A:D`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const logs = rows.filter(row => {
            const logUserId = row[1];
            const logDate = row[3];
            return logUserId === userId && 
                   moment(logDate).isBetween(startDate, endDate, 'day', '[]');
        }).map(row => ({
            timestamp: row[0],
            userId: row[1],
            habitId: row[2],
            date: row[3]
        }));
        
        console.log('📊 習慣ログ範囲取得 (Google Sheets):', { userId: userId.substring(0, 4) + '...', startDate, endDate, count: logs.length });
        return logs;
    } catch (error) {
        console.error('習慣ログ範囲取得エラー:', error);
        return [];
    }
}

async function getHabitLogs(userId, habitId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
    const range = `${sheetName}!A:D`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const logs = rows.filter(row => 
            row[1] === userId && row[2] === habitId
        ).map(row => ({
            timestamp: row[0],
            userId: row[1],
            habitId: row[2],
            date: row[3]
        })).sort((a, b) => moment(a.date).diff(moment(b.date)));
        
        return logs;
    } catch (error) {
        console.error('習慣ログ取得エラー:', error);
        return [];
    }
}

async function updateHabitStreak(userId, habitId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    const range = `${sheetName}!A:G`;
    
    try {
        // 現在のストリークを計算
        const currentStreak = await calculations.calculateCurrentStreak(userId, habitId);
        
        // Google Sheetsの該当行を更新
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === habitId);
        
        if (rowIndex >= 0) {
            const updateRange = `${sheetName}!F${rowIndex + 1}:F${rowIndex + 1}`; // F列: 現在ストリーク
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [[currentStreak.toString()]] }
            });
            
            console.log('🔥 ストリーク更新 (Google Sheets):', { habitId: habitId.substring(0, 10) + '...', newStreak: currentStreak });
            return currentStreak;
        }
        
        return 0;
    } catch (error) {
        console.error('ストリーク更新エラー:', error);
        return 0;
    }
}

async function deleteHabit(habitId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
    const range = `${sheetName}!A:G`;
    
    try {
        // ソフトデリート（ステータスを'deleted'に変更）
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === habitId);
        
        if (rowIndex >= 0) {
            const updateRange = `${sheetName}!G${rowIndex + 1}:G${rowIndex + 1}`; // G列: ステータス
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [['deleted']] }
            });
            
            console.log('🗑️ 習慣削除 (Google Sheets):', { habitId: habitId.substring(0, 10) + '...' });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('習慣削除エラー:', error);
        return false;
    }
}

// 今日の習慣ログを取得（通知システム用）
async function getHabitLogsForDate(userId, date) {
    return await getHabitLogsInRange(userId, date, date);
}

/**
 * 次のシンプルなIDを取得する関数
 */
async function getNextSimpleId(sheetName, idColumn = 'A') {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${sheetName}!${idColumn}:${idColumn}`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // ヘッダー行を除外して、数値IDのみを抽出
        const numericIds = rows.slice(1)
            .map(row => parseInt(row[0]))
            .filter(id => !isNaN(id))
            .sort((a, b) => b - a); // 降順ソート
        
        // 最大ID + 1を返す（データがない場合は1から開始）
        return numericIds.length > 0 ? numericIds[0] + 1 : 1;
    } catch (error) {
        console.error('次のID取得エラー:', error);
        return 1; // エラーの場合は1を返す
    }
}

// ===== ルーティン管理 =====

async function saveRoutineToSheet(userId, name, description = '', category = 'general') {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routines_master';
    
    try {
        const routineId = await getNextSimpleId(sheetName);
        const range = `${sheetName}!A:I`;
        
        console.log('💾 ルーティン保存開始:', { routineId, name, category });
        
        const values = [[
            routineId,                              // A列: routine_id（数値）
            moment().format('YYYY-MM-DD HH:mm:ss'), // B列: created_at
            name,                                   // C列: name
            description,                            // D列: description
            category,                               // E列: category
            'TRUE',                                 // F列: is_active（文字列で保存）
            0,                                      // G列: estimated_duration
            null,                                   // H列: last_executed
            0                                       // I列: total_executions
        ]];
        
        console.log('📝 保存データ:', values[0]);
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('✅ ルーティン保存完了:', { routineId, name, category });
        
        // 保存後に確認
        const saved = await getRoutineById(routineId);
        console.log('🔍 保存確認:', saved);
        
        return routineId; // 数値を返す
    } catch (error) {
        console.error('ルーティン保存エラー:', error);
        throw error;
    }
}

async function getUserRoutines(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routines_master';
    const range = `${sheetName}!A:I`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const userRoutines = rows.slice(1).filter(row => 
            row[5] === true || row[5] === 'true'
        ).map(row => ({
            id: parseInt(row[0]) || row[0],
            createdAt: row[1],
            name: row[2],
            description: row[3] || '',
            category: row[4],
            isActive: row[5],
            estimatedDuration: parseInt(row[6]) || 0,
            lastExecuted: row[7] || null,
            totalExecutions: parseInt(row[8]) || 0
        }));
        
        console.log('📋 ルーティン一覧取得:', { count: userRoutines.length });
        return userRoutines;
    } catch (error) {
        console.error('ルーティン一覧取得エラー:', error);
        return [];
    }
}

async function getRoutineById(routineId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routines_master';
    const range = `${sheetName}!A:I`;
    
    try {
        console.log('🔍 ルーティン検索開始:', { routineId, type: typeof routineId });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        console.log('📊 シートデータ行数:', rows.length);
        
        // 全ての行をログ出力（デバッグ用）
        rows.forEach((row, index) => {
            if (index === 0) {
                console.log('📋 ヘッダー行:', row);
            } else if (index <= 5) { // 最初の5行だけ表示
                console.log(`📝 データ行${index}:`, {
                    id: row[0], 
                    idType: typeof row[0],
                    name: row[2],
                    isActive: row[5]
                });
            }
        });
        
        // 検索対象のIDを複数形式で試行
        const searchId = routineId;
        const searchIdNum = parseInt(routineId);
        const searchIdStr = routineId.toString();
        
        console.log('🔍 検索ID情報:', { 
            searchId, 
            searchIdNum, 
            searchIdStr,
            isNaN: isNaN(searchIdNum)
        });
        
        const routineRow = rows.find((row, index) => {
            if (index === 0) return false; // ヘッダー行をスキップ
            
            const rowId = row[0];
            const rowIdNum = parseInt(rowId);
            const isActive = row[5] === true || row[5] === 'true' || row[5] === 'TRUE';
            
            // より詳細な比較ログ
            const idMatch = (
                rowId == searchId ||
                rowId === searchId ||
                rowIdNum === searchIdNum ||
                rowId === searchIdStr
            );
            
            if (rowId == searchId || rowIdNum === searchIdNum) {
                console.log('🎯 ID一致チェック:', {
                    rowId,
                    rowIdType: typeof rowId,
                    rowIdNum,
                    searchId,
                    searchIdNum,
                    idMatch,
                    isActive,
                    row5value: row[5],
                    row5type: typeof row[5]
                });
            }
            
            return idMatch && isActive;
        });
        
        if (routineRow) {
            console.log('✅ ルーティン見つかりました:', {
                id: routineRow[0],
                name: routineRow[2],
                isActive: routineRow[5]
            });
            
            return {
                id: parseInt(routineRow[0]) || routineRow[0],
                createdAt: routineRow[1],
                name: routineRow[2],
                description: routineRow[3] || '',
                category: routineRow[4],
                isActive: routineRow[5],
                estimatedDuration: parseInt(routineRow[6]) || 0,
                lastExecuted: routineRow[7] || null,
                totalExecutions: parseInt(routineRow[8]) || 0
            };
        } else {
            console.log('❌ ルーティンが見つかりませんでした');
            // アクティブな全ルーティンを表示（デバッグ用）
            const activeRoutines = rows.slice(1).filter(row => 
                row[5] === true || row[5] === 'true' || row[5] === 'TRUE'
            );
            console.log('📋 アクティブなルーティン一覧:', activeRoutines.map(row => ({
                id: row[0],
                name: row[2],
                isActive: row[5]
            })));
        }
        
        return null;
    } catch (error) {
        console.error('ルーティン取得エラー:', error);
        return null;
    }
}

async function updateRoutine(routineId, updates) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routines_master';
    const range = `${sheetName}!A:I`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => 
            parseInt(row[0]) === parseInt(routineId) || row[0] === routineId.toString()
        );
        
        if (rowIndex >= 0) {
            const currentRow = rows[rowIndex];
            const updatedRow = [...currentRow];
            
            // 更新可能なフィールド
            if (updates.name !== undefined) updatedRow[2] = updates.name;
            if (updates.description !== undefined) updatedRow[3] = updates.description;
            if (updates.category !== undefined) updatedRow[4] = updates.category;
            if (updates.isActive !== undefined) updatedRow[5] = updates.isActive;
            if (updates.estimatedDuration !== undefined) updatedRow[6] = updates.estimatedDuration;
            if (updates.lastExecuted !== undefined) updatedRow[7] = updates.lastExecuted;
            if (updates.totalExecutions !== undefined) updatedRow[8] = updates.totalExecutions;
            
            // 削除の場合
            if (updates.status === 'deleted') updatedRow[5] = false;
            
            const updateRange = `${sheetName}!A${rowIndex + 1}:I${rowIndex + 1}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [updatedRow] }
            });
            
            console.log('✏️ ルーティン更新:', { routineId: routineId.toString(), updates });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('ルーティン更新エラー:', error);
        return false;
    }
}

/**
 * ルーティンの実行回数を更新
 */
async function updateRoutineTotalExecutions(routineId) {
    try {
        console.log('📊 ルーティン実行回数更新開始:', { routineId });
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        
        // 1. routine_executionsから完了した実行回数を取得
        const executionsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'routine_executions!A:G',
        });
        
        const executionsRows = executionsResponse.data.values || [];
        let completedCount = 0;
        
        // ヘッダー行をスキップして、該当ルーティンの完了回数をカウント
        for (let i = 1; i < executionsRows.length; i++) {
            const row = executionsRows[i];
            const execRoutineId = parseInt(row[1]); // routine_id列（B列）
            const status = row[5]; // status列（F列）
            
            if (execRoutineId === routineId && status === 'completed') {
                completedCount++;
            }
        }
        
        console.log('📊 完了回数カウント:', { routineId, completedCount });
        
        // 2. routines_masterシートから該当行を見つけて更新
        const masterResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'routines_master!A:I',
        });
        
        const masterRows = masterResponse.data.values || [];
        let targetRowIndex = -1;
        
        // 該当ルーティンの行を見つける
        for (let i = 1; i < masterRows.length; i++) {
            const row = masterRows[i];
            const masterRoutineId = parseInt(row[0]); // routine_id列（A列）
            
            if (masterRoutineId === routineId) {
                targetRowIndex = i + 1; // Sheetsは1ベースなので+1
                break;
            }
        }
        
        if (targetRowIndex === -1) {
            console.error('❌ 該当ルーティンが見つかりません:', routineId);
            return false;
        }
        
        // 3. total_executions列（I列）を更新
        const updateRange = `routines_master!I${targetRowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: updateRange,
            valueInputOption: 'RAW',
            resource: {
                values: [[completedCount]]
            }
        });
        
        // 4. last_executed列（H列）も更新
        const now = moment().format('YYYY-MM-DD HH:mm:ss');
        const lastExecutedRange = `routines_master!H${targetRowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: lastExecutedRange,
            valueInputOption: 'RAW',
            resource: {
                values: [[now]]
            }
        });
        
        console.log('✅ ルーティン実行回数更新完了:', { 
            routineId, 
            completedCount, 
            lastExecuted: now 
        });
        
        return true;
        
    } catch (error) {
        console.error('ルーティン実行回数更新エラー:', error);
        return false;
    }
}

// ===== ルーティンステップ管理 =====

async function saveRoutineStep(routineId, stepName, description = '', estimatedMinutes = 0, isRequired = true) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_steps';
    
    try {
        const stepId = await getNextSimpleId(sheetName);
        
        // 次の順番を取得
        const existingSteps = await getRoutineSteps(routineId);
        const nextOrder = existingSteps.length + 1;
        
        const range = `${sheetName}!A:H`;
        const values = [[
            stepId,                // A列: step_id（数値）
            routineId,             // B列: routine_id（数値）
            nextOrder,             // C列: step_order
            stepName,              // D列: step_name
            description,           // E列: description
            estimatedMinutes,      // F列: estimated_minutes
            isRequired,            // G列: is_required
            false                  // H列: skip_reason_allowed
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('➕ ルーティンステップ保存:', { stepId, stepName, order: nextOrder });
        return stepId; // 数値を返す
    } catch (error) {
        console.error('ルーティンステップ保存エラー:', error);
        throw error;
    }
}

async function getRoutineSteps(routineId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_steps';
    const range = `${sheetName}!A:H`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const steps = rows.slice(1).filter(row => 
            parseInt(row[1]) === parseInt(routineId) || row[1] === routineId.toString()
        ).map(row => ({
            stepId: parseInt(row[0]) || row[0],
            routineId: parseInt(row[1]) || row[1],
            order: parseInt(row[2]) || 0,
            name: row[3],
            description: row[4] || '',
            estimatedMinutes: parseInt(row[5]) || 0,
            isRequired: row[6] !== 'false' && row[6] !== false,
            skipReasonAllowed: row[7] === 'true' || row[7] === true
        })).sort((a, b) => a.order - b.order);
        
        console.log('📝 ルーティンステップ取得:', { routineId, count: steps.length });
        return steps;
    } catch (error) {
        console.error('ルーティンステップ取得エラー:', error);
        return [];
    }
}

async function updateRoutineStep(stepId, updates) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_steps';
    const range = `${sheetName}!A:H`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => 
            parseInt(row[0]) === parseInt(stepId) || row[0] === stepId.toString()
        );
        
        if (rowIndex >= 0) {
            const currentRow = rows[rowIndex];
            const updatedRow = [...currentRow];
            
            // 更新可能なフィールド
            if (updates.name !== undefined) updatedRow[3] = updates.name;
            if (updates.description !== undefined) updatedRow[4] = updates.description;
            if (updates.estimatedMinutes !== undefined) updatedRow[5] = updates.estimatedMinutes;
            if (updates.isRequired !== undefined) updatedRow[6] = updates.isRequired;
            if (updates.skipReasonAllowed !== undefined) updatedRow[7] = updates.skipReasonAllowed;
            
            const updateRange = `${sheetName}!A${rowIndex + 1}:H${rowIndex + 1}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [updatedRow] }
            });
            
            console.log('✏️ ルーティンステップ更新:', { stepId: stepId.toString(), updates });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('ルーティンステップ更新エラー:', error);
        return false;
    }
}

async function deleteRoutineStep(stepId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_steps';
    const range = `${sheetName}!A:H`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => 
            parseInt(row[0]) === parseInt(stepId) || row[0] === stepId.toString()
        );
        
        if (rowIndex >= 0) {
            // 行を削除
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // 適切なシートIDを設定
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                }
            });
            
            console.log('🗑️ ルーティンステップ削除:', { stepId: stepId.toString() });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('ルーティンステップ削除エラー:', error);
        return false;
    }
}

// ===== ルーティン実行管理 =====

async function saveRoutineExecution(userId, routineId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_executions';
    
    try {
        const executionId = await getNextSimpleId(sheetName);
        const now = moment();
        const steps = await getRoutineSteps(routineId);
        
        const range = `${sheetName}!A:H`;
        const values = [[
            executionId,                    // A列: execution_id（数値）
            routineId,                      // B列: routine_id（数値）
            now.format('YYYY-MM-DD'),       // C列: execution_date
            now.format('HH:mm:ss'),         // D列: start_time
            null,                           // E列: end_time
            'running',                      // F列: status
            0,                              // G列: completed_steps
            steps.length                    // H列: total_steps
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('▶️ ルーティン実行開始:', { executionId, routineId });
        return executionId; // 数値を返す
    } catch (error) {
        console.error('ルーティン実行保存エラー:', error);
        throw error;
    }
}

async function updateRoutineExecution(executionId, updates) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_executions';
    const range = `${sheetName}!A:H`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => 
            parseInt(row[0]) === parseInt(executionId) || row[0] === executionId.toString()
        );
        
        if (rowIndex >= 0) {
            const currentRow = rows[rowIndex];
            const updatedRow = [...currentRow];
            
            // 更新可能なフィールド
            if (updates.endTime !== undefined) updatedRow[4] = updates.endTime; // E列
            if (updates.status !== undefined) updatedRow[5] = updates.status;   // F列
            if (updates.completedSteps !== undefined) updatedRow[6] = updates.completedSteps; // G列
            
            const updateRange = `${sheetName}!A${rowIndex + 1}:H${rowIndex + 1}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [updatedRow] }
            });
            
            console.log('📊 ルーティン実行更新:', { executionId: executionId.toString(), updates });
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('ルーティン実行更新エラー:', error);
        return false;
    }
}

async function getActiveRoutineExecution(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_executions';
    const range = `${sheetName}!A:H`;
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const activeExecution = rows.slice(1).find(row => 
            row[5] === 'running' || row[5] === 'paused' // F列: status
        );
        
        if (activeExecution) {
            return {
                executionId: parseInt(activeExecution[0]) || activeExecution[0],
                routineId: parseInt(activeExecution[1]) || activeExecution[1],
                executionDate: activeExecution[2],
                startTime: activeExecution[3],
                endTime: activeExecution[4],
                status: activeExecution[5],
                completedSteps: parseInt(activeExecution[6]) || 0,
                totalSteps: parseInt(activeExecution[7]) || 0
            };
        }
        
        return null;
    } catch (error) {
        console.error('アクティブルーティン実行取得エラー:', error);
        return null;
    }
}

async function getRoutineExecutionHistory(routineId, days = 30) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_executions';
    const range = `${sheetName}!A:H`;
    
    try {
        const cutoffDate = moment().subtract(days, 'days').format('YYYY-MM-DD');
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const executions = rows.slice(1).filter(row => 
            (parseInt(row[1]) === parseInt(routineId) || row[1] === routineId.toString()) && 
            row[2] >= cutoffDate
        ).map(row => ({
            executionId: parseInt(row[0]) || row[0],
            routineId: parseInt(row[1]) || row[1],
            executionDate: row[2],
            startTime: row[3],
            endTime: row[4],
            status: row[5],
            completedSteps: parseInt(row[6]) || 0,
            totalSteps: parseInt(row[7]) || 0
        })).sort((a, b) => moment(b.executionDate).diff(moment(a.executionDate)));
        
        console.log('📜 ルーティン実行履歴取得:', { routineId, days, count: executions.length });
        return executions;
    } catch (error) {
        console.error('ルーティン実行履歴取得エラー:', error);
        return [];
    }
}

async function getTodayRoutineExecutions(userId) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routine_executions';
    const range = `${sheetName}!A:H`;
    
    try {
        const today = moment().format('YYYY-MM-DD');
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const todayExecutions = rows.slice(1).filter(row => 
            row[2] === today // C列: execution_date
        ).map(row => ({
            executionId: parseInt(row[0]) || row[0],
            routineId: parseInt(row[1]) || row[1],
            executionDate: row[2],
            startTime: row[3],
            endTime: row[4],
            status: row[5],
            completedSteps: parseInt(row[6]) || 0,
            totalSteps: parseInt(row[7]) || 0
        }));
        
        console.log('📅 今日のルーティン実行取得:', { count: todayExecutions.length });
        return todayExecutions;
    } catch (error) {
        console.error('今日のルーティン実行取得エラー:', error);
        return [];
    }
}

// ===== ルーティン統計 =====

async function getRoutineStats(routineId, days = 30) {
    try {
        const history = await getRoutineExecutionHistory(routineId, days);
        
        if (history.length === 0) {
            return {
                totalExecutions: 0,
                completedExecutions: 0,
                completionRate: 0,
                avgDuration: 0,
                avgCompletionRate: 0
            };
        }
        
        const completedExecutions = history.filter(ex => ex.status === 'completed').length;
        const completionRate = Math.round((completedExecutions / history.length) * 100);
        
        // 平均所要時間計算（完了したもののみ）
        const completedWithTime = history.filter(ex => 
            ex.status === 'completed' && ex.startTime && ex.endTime
        );
        
        let avgDuration = 0;
        if (completedWithTime.length > 0) {
            const totalMinutes = completedWithTime.reduce((sum, ex) => {
                const start = moment(`1970-01-01 ${ex.startTime}`);
                const end = moment(`1970-01-01 ${ex.endTime}`);
                return sum + end.diff(start, 'minutes');
            }, 0);
            avgDuration = Math.round(totalMinutes / completedWithTime.length);
        }
        
        // 平均ステップ完了率
        const avgCompletionRate = history.length > 0
            ? Math.round(history.reduce((sum, ex) => {
                return sum + (ex.totalSteps > 0 ? (ex.completedSteps / ex.totalSteps) * 100 : 0);
            }, 0) / history.length)
            : 0;
        
        return {
            totalExecutions: history.length,
            completedExecutions,
            completionRate,
            avgDuration,
            avgCompletionRate
        };
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

// ===== ルーティン検索 =====

async function searchRoutines(userId, keyword) {
    try {
        const routines = await getUserRoutines(userId);
        
        const results = routines.filter(routine => {
            const searchText = `${routine.name} ${routine.description} ${routine.category}`.toLowerCase();
            return searchText.includes(keyword.toLowerCase());
        });
        
        console.log('🔍 ルーティン検索:', { userId: userId.substring(0, 4) + '...', keyword, count: results.length });
        return results;
    } catch (error) {
        console.error('ルーティン検索エラー:', error);
        return [];
    }
}

async function debugRoutineSheet() {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'routines_master';
    const range = `${sheetName}!A:I`;
    
    try {
        console.log('🔍 シートデバッグ開始');
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        console.log('📊 シート情報:', {
            sheetName,
            totalRows: rows.length,
            range
        });
        
        if (rows.length > 0) {
            console.log('📋 ヘッダー行:', rows[0]);
            
            rows.forEach((row, index) => {
                if (index > 0 && index <= 5) { // データ行の最初の5行
                    console.log(`📝 行${index}:`, {
                        A_id: `"${row[0]}" (${typeof row[0]})`,
                        B_created: `"${row[1]}"`,
                        C_name: `"${row[2]}"`,
                        D_desc: `"${row[3]}"`,
                        E_category: `"${row[4]}"`,
                        F_isActive: `"${row[5]}" (${typeof row[5]})`,
                        G_duration: `"${row[6]}"`,
                        H_lastExec: `"${row[7]}"`,
                        I_totalExec: `"${row[8]}"`
                    });
                }
            });
        }
        
        return rows;
    } catch (error) {
        console.error('シートデバッグエラー:', error);
        return [];
    }
}

/**
 * 指定したシートのデータを取得
 */
async function getSheetData(sheetName, range = 'A:Z') {
    try {
        console.log(`📊 ${sheetName} シートからデータを取得中...`);
        
        // 既存の認証方法を使用
        const creds = require('../google-credentials.json');
        const { GoogleSpreadsheet } = require('google-spreadsheet');
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
        await doc.useServiceAccountAuth(creds);
        await doc.loadInfo();
        
        const worksheet = doc.sheetsByTitle[sheetName];
        
        if (!worksheet) {
            console.log(`⚠️ シート "${sheetName}" が見つかりません`);
            console.log('📋 現在利用可能なシート:');
            Object.keys(doc.sheetsByTitle).forEach(title => {
                console.log(`  - ${title}`);
            });
            
            // ヘッダーのみを返す
            if (sheetName === 'routine_notifications') {
                return [['notification_id', 'user_id', 'routine_id', 'notification_type', 'is_enabled', 'notification_time', 'days_of_week', 'channel_id', 'threshold_days', 'threshold_count', 'last_sent', 'created_at']];
            }
            return [[]];
        }
        
        const rows = await worksheet.getRows();
        
        // ヘッダー行を取得
        await worksheet.loadHeaderRow();
        const headerValues = worksheet.headerValues;
        
        // データを2次元配列に変換
        const result = [headerValues];
        
        rows.forEach(row => {
            const rowData = [];
            headerValues.forEach(header => {
                rowData.push(row.get(header) || '');
            });
            result.push(rowData);
        });
        
        console.log(`✅ ${sheetName} から ${rows.length}行のデータを取得しました`);
        return result;
        
    } catch (error) {
        console.error(`シートデータ取得エラー (${sheetName}):`, error);
        return [[]];
    }
}


/**
 * 指定したシートにデータを保存（Google Sheets API v4使用）
 */
async function saveToSheet(sheetName, values) {
    try {
        console.log(`💾 ${sheetName} にデータを保存中...`);
        
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = `${sheetName}!A:L`;
        
        // 既存の認証を使用
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        // データを2次元配列として準備
        const requestBody = {
            values: [values]
        };
        
        const request = {
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: requestBody
        };
        
        const response = await sheets.spreadsheets.values.append(request);
        console.log(`✅ ${sheetName} にデータを保存しました: ID ${values[0]}`);
        return true;
        
    } catch (error) {
        console.error(`シートデータ保存エラー (${sheetName}):`, error);
        return false;
    }
}

/**
 * 指定したシートのデータを取得（Google Sheets API v4使用）
 */
async function getSheetData(sheetName, range = 'A:Z') {
    try {
        console.log(`📊 ${sheetName} シートからデータを取得中...`);
        
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const fullRange = `${sheetName}!${range}`;
        
        // 既存の認証を使用
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
        return rows;
        
    } catch (error) {
        console.error(`シートデータ取得エラー (${sheetName}):`, error);
        
        // シートが存在しない場合はヘッダーのみ返す
        if (sheetName === 'routine_notifications') {
            return [['notification_id', 'user_id', 'routine_id', 'notification_type', 'is_enabled', 'notification_time', 'days_of_week', 'channel_id', 'threshold_days', 'threshold_count', 'last_sent', 'created_at']];
        }
        return [[]];
    }
}

/**
 * 次のIDを取得（Google Sheets API v4使用）
 */
async function getNextId(sheetName) {
    try {
        const data = await getSheetData(sheetName, 'A:A');
        
        if (data.length <= 1) {
            return 1; // 最初のID
        }
        
        // 最大IDを取得
        let maxId = 0;
        for (let i = 1; i < data.length; i++) {
            const id = parseInt(data[i][0]);
            if (!isNaN(id) && id > maxId) {
                maxId = id;
            }
        }
        
        return maxId + 1;
        
    } catch (error) {
        console.error(`次ID取得エラー (${sheetName}):`, error);
        return Date.now(); // フォールバック
    }
}

/**
 * スプレッドシートの情報を強制リロード
 */
async function forceReloadSpreadsheet() {
    try {
        console.log('🔄 スプレッドシートを強制リロード中...');
        
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
        
        // 強制的にスプレッドシートの情報を再取得
        await doc.loadInfo();
        console.log('📋 利用可能なシート一覧:');
        Object.keys(doc.sheetsByTitle).forEach(title => {
            console.log(`  - ${title}`);
        });
        
        return doc;
    } catch (error) {
        console.error('スプレッドシート強制リロードエラー:', error);
        throw error;
    }
}

// 最初の体重記録を取得
async function getFirstWeightEntry(userId) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
        const range = `${sheetName}!A:E`;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // ヘッダー行をスキップして、指定ユーザーの記録を日付順でソート
        const userEntries = rows.slice(1)
            .filter(row => row[1] === userId && row[0] && row[2]) // userId, date, weightが存在
            .map(row => ({
                date: row[0],
                userId: row[1],
                weight: row[2],
                memo: row[3] || ''
            }))
            .sort((a, b) => moment(a.date).diff(moment(b.date))); // 日付の昇順
        
        return userEntries.length > 0 ? userEntries[0] : null;
        
    } catch (error) {
        console.error('最初の体重記録取得エラー:', error);
        return null;
    }
}

// 最新の体重記録を取得
async function getLatestWeightEntry(userId) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = config.google_sheets.weight_sheet_name || 'weight_data';
        const range = `${sheetName}!A:E`;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        // ヘッダー行をスキップして、指定ユーザーの記録を日付順でソート
        const userEntries = rows.slice(1)
            .filter(row => row[1] === userId && row[0] && row[2]) // userId, date, weightが存在
            .map(row => ({
                date: row[0],
                userId: row[1],
                weight: row[2],
                memo: row[3] || ''
            }))
            .sort((a, b) => moment(b.date).diff(moment(a.date))); // 日付の降順（新しい方が先）
        
        return userEntries.length > 0 ? userEntries[0] : null;
        
    } catch (error) {
        console.error('最新の体重記録取得エラー:', error);
        return null;
    }
}

// 食事記録を保存
async function saveMealRecord(userId, date, mealType, content, memo = '') {
    try {
        // スプレッドシートIDを取得（優先順位順）
        let spreadsheetId;
        
        // 1. 環境変数から取得（最優先）
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        }
        // 2. config.google_sheets.spreadsheet_id から取得
        else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        }
        // 3. 古い形式のconfig.sheets.spreadsheetId から取得
        else if (config && config.sheets && config.sheets.spreadsheetId) {
            spreadsheetId = config.sheets.spreadsheetId;
        }
        
        if (!spreadsheetId) {
            console.error('❌ スプレッドシートID設定エラー');
            console.error('環境変数:', process.env.GOOGLE_SHEET_ID ? '設定済み' : '未設定');
            console.error('Config構造:', JSON.stringify(config.google_sheets || {}, null, 2));
            throw new Error('スプレッドシートIDが設定されていません。.envファイルのGOOGLE_SHEET_IDまたはconfig.json の google_sheets.spreadsheet_id を設定してください。');
        }
        
        console.log('📊 食事記録保存中... SpreadsheetID:', spreadsheetId.substring(0, 10) + '...');
        
        const range = 'mealslogs!A:F';
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        
        // Google Sheets APIクライアントを初期化
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // 既存の記録をチェック（同じ日の同じ食事タイプ）
        const existingRange = 'mealslogs!A:F';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: existingRange,
        });
        
        const rows = response.data.values || [];
        let updateRow = -1;
        
        // 既存の記録を探す
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i][0] === userId && rows[i][1] === date && rows[i][2] === mealType) {
                updateRow = i + 1; // 1-indexed
                break;
            }
        }
        
        const values = [[userId, date, mealType, content, memo, timestamp]];
        
        if (updateRow > 0) {
            // 既存の記録を更新
            console.log('🔄 既存の食事記録を更新中...');
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `mealslogs!A${updateRow}:F${updateRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values }
            });
        } else {
            // 新しい記録を追加
            console.log('➕ 新しい食事記録を追加中...');
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values }
            });
        }
        
        console.log('✅ 食事記録保存完了');
        return true;
    } catch (error) {
        console.error('❌ 食事記録保存エラー:', error);
        throw error;
    }
}

// 特定日の食事記録を取得
async function getMealRecordsForDate(userId, date) {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        } else if (config && config.sheets && config.sheets.spreadsheetId) {
            spreadsheetId = config.sheets.spreadsheetId;
        }
        
        if (!spreadsheetId) {
            console.error('❌ 食事記録取得: スプレッドシートIDが設定されていません');
            return [];
        }
        
        const range = 'mealslogs!A:F';
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        
        const rows = response.data.values || [];
        if (rows.length <= 1) return [];
        
        return rows.slice(1)
            .filter(row => row && row[0] === userId && row[1] === date)
            .map(row => ({
                userId: row[0],
                date: row[1],
                type: row[2],
                content: row[3],
                memo: row[4] || '',
                timestamp: row[5] || ''
            }))
            .sort((a, b) => {
                // 食事の順序でソート
                const order = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };
                return order[a.type] - order[b.type];
            });
    } catch (error) {
        console.error('❌ 特定日食事記録取得エラー:', error);
        return [];
    }
}

// 期間内の食事記録を取得
async function getMealRecordsInRange(userId, startDate, endDate) {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        } else if (config && config.sheets && config.sheets.spreadsheetId) {
            spreadsheetId = config.sheets.spreadsheetId;
        }
        
        if (!spreadsheetId) {
            console.error('❌ 期間内食事記録取得: スプレッドシートIDが設定されていません');
            return [];
        }
        
        const range = 'mealslogs!A:F';
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SHEET_ID || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        
        const rows = response.data.values || [];
        if (rows.length <= 1) return [];
        
        return rows.slice(1)
            .filter(row => {
                if (!row || row[0] !== userId || !row[1]) return false;
                const entryDate = moment(row[1]);
                return entryDate.isBetween(moment(startDate), moment(endDate), 'day', '[]');
            })
            .map(row => ({
                userId: row[0],
                date: row[1],
                type: row[2],
                content: row[3],
                memo: row[4] || '',
                timestamp: row[5] || ''
            }))
            .sort((a, b) => moment(b.date).diff(moment(a.date)));
    } catch (error) {
        console.error('❌ 期間内食事記録取得エラー:', error);
        return [];
    }
}

// Google Sheets の設定確認/初期化
async function initializeMealLogsSheet() {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
            console.log('📊 環境変数からスプレッドシートIDを取得');
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
            console.log('📊 config.jsonからスプレッドシートIDを取得');
        } else if (config && config.sheets && config.sheets.spreadsheetId) {
            spreadsheetId = config.sheets.spreadsheetId;
            console.log('📊 config.sheets からスプレッドシートIDを取得');
        }
        
        if (!spreadsheetId) {
            console.error('❌ スプレッドシートIDが設定されていません');
            console.error('設定方法:');
            console.error('1. .envファイルに GOOGLE_SHEET_ID=your_id を追加');
            console.error('2. または config.json の google_sheets に "spreadsheet_id": "your_id" を追加');
            return false;
        }
        
        console.log('📊 mealslogsシート初期化中...', spreadsheetId.substring(0, 15) + '...');
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // MealLogsシートが存在するかチェック
        const sheetsInfo = await sheets.spreadsheets.get({
            spreadsheetId
        });
        
        const mealLogsSheet = sheetsInfo.data.sheets.find(
            sheet => sheet.properties.title === 'mealslogs'
        );
        
        if (!mealLogsSheet) {
            console.log('📝 mealslogsシートが存在しないため作成中...');
            // MealLogsシートを作成
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'mealslogs'
                            }
                        }
                    }]
                }
            });
            
            // ヘッダーを追加
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'mealslogs!A1:F1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['UserID', 'Date', 'MealType', 'Content', 'Memo', 'Timestamp']]
                }
            });
            
            console.log('✅ mealslogsシートを作成しました');
        } else {
            console.log('✅ mealslogsシートは既に存在します');
        }
        
        return true;
    } catch (error) {
        console.error('❌ mealslogsシート初期化エラー:', error);
        console.error('エラー詳細:', error.message);
        return false;
    }
}

// Who Am I データを取得
async function getWhoAmIData(userId) {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        }
        
        if (!spreadsheetId) {
            console.error('Who Am I データ取得: スプレッドシートIDが設定されていません');
            return null;
        }
        
        const range = 'WhoAmI!A:F';
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        
        const rows = response.data.values || [];
        if (rows.length <= 1) return null;
        
        // ユーザーのデータを検索
        const userRow = rows.slice(1).find(row => row && row[0] === userId);
        
        if (!userRow) return null;
        
        return {
            userId: userRow[0],
            identity: userRow[1] || '',
            big_goal: userRow[2] || '',
            small_goal: userRow[3] || '',
            created_at: userRow[4] || '',
            updated_at: userRow[5] || ''
        };
        
    } catch (error) {
        console.error('Who Am I データ取得エラー:', error);
        return null;
    }
}

// Who Am I データを保存
async function saveWhoAmIData(userId, section, content) {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        }
        
        if (!spreadsheetId) {
            throw new Error('スプレッドシートIDが設定されていません');
        }
        
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // 既存のデータを確認
        const existingRange = 'WhoAmI!A:F';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: existingRange,
        });
        
        const rows = response.data.values || [];
        let updateRow = -1;
        let currentData = { identity: '', big_goal: '', small_goal: '', created_at: '', updated_at: '' };
        
        // 既存の行を探す
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i][0] === userId) {
                updateRow = i + 1; // 1-indexed
                currentData = {
                    identity: rows[i][1] || '',
                    big_goal: rows[i][2] || '',
                    small_goal: rows[i][3] || '',
                    created_at: rows[i][4] || timestamp,
                    updated_at: rows[i][5] || ''
                };
                break;
            }
        }
        
        // 更新するデータを準備
        const newData = { ...currentData };
        newData[section] = content;
        newData.updated_at = timestamp;
        
        // created_atが空の場合は現在時刻を設定
        if (!newData.created_at) {
            newData.created_at = timestamp;
        }
        
        const values = [[
            userId,
            newData.identity,
            newData.big_goal,
            newData.small_goal,
            newData.created_at,
            newData.updated_at
        ]];
        
        if (updateRow > 0) {
            // 既存の行を更新
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `WhoAmI!A${updateRow}:F${updateRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values }
            });
        } else {
            // 新しい行を追加
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'WhoAmI!A:F',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values }
            });
        }
        
        console.log('✅ Who Am I データ保存完了:', section);
        return true;
        
    } catch (error) {
        console.error('Who Am I データ保存エラー:', error);
        throw error;
    }
}

// WhoAmIシートの初期化
async function initializeWhoAmISheet() {
    try {
        // スプレッドシートIDを取得
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        }
        
        if (!spreadsheetId) {
            console.error('❌ WhoAmIシート初期化: スプレッドシートIDが設定されていません');
            return false;
        }
        
        console.log('📊 WhoAmIシート初期化中...');
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // WhoAmIシートが存在するかチェック
        const sheetsInfo = await sheets.spreadsheets.get({
            spreadsheetId
        });
        
        const whoAmISheet = sheetsInfo.data.sheets.find(
            sheet => sheet.properties.title === 'WhoAmI'
        );
        
        if (!whoAmISheet) {
            console.log('📝 WhoAmIシートが存在しないため作成中...');
            // WhoAmIシートを作成
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'WhoAmI'
                            }
                        }
                    }]
                }
            });
            
            // ヘッダーを追加
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'WhoAmI!A1:F1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['UserID', 'Identity', 'BigGoal', 'SmallGoal', 'CreatedAt', 'UpdatedAt']]
                }
            });
            
            console.log('✅ WhoAmIシートを作成しました');
        } else {
            console.log('✅ WhoAmIシートは既に存在します');
        }
        
        return true;
    } catch (error) {
        console.error('❌ WhoAmIシート初期化エラー:', error);
        return false;
    }
}

// Who Am I データの全削除（管理用）
async function deleteWhoAmIData(userId) {
    try {
        let spreadsheetId;
        if (process.env.GOOGLE_SHEET_ID) {
            spreadsheetId = process.env.GOOGLE_SHEET_ID;
        } else if (config && config.google_sheets && config.google_sheets.spreadsheet_id) {
            spreadsheetId = config.google_sheets.spreadsheet_id;
        }
        
        if (!spreadsheetId) {
            throw new Error('スプレッドシートIDが設定されていません');
        }
        
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // 該当ユーザーの行を検索
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'WhoAmI!A:F',
        });
        
        const rows = response.data.values || [];
        let deleteRowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i][0] === userId) {
                deleteRowIndex = i;
                break;
            }
        }
        
        if (deleteRowIndex > 0) {
            // 行を削除
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // WhoAmIシートのID（通常0）
                                dimension: 'ROWS',
                                startIndex: deleteRowIndex,
                                endIndex: deleteRowIndex + 1
                            }
                        }
                    }]
                }
            });
            
            console.log('✅ Who Am I データを削除しました:', userId);
            return true;
        } else {
            console.log('⚠️ 削除対象のデータが見つかりませんでした:', userId);
            return false;
        }
        
    } catch (error) {
        console.error('Who Am I データ削除エラー:', error);
        throw error;
    }
}

// ===== 連携機能用メソッド =====

/**
 * 習慣名で習慣を取得
 * @param {string} userId - ユーザーID
 * @param {string} habitName - 習慣名
 * @returns {Object|null} 習慣情報
 */
async function getHabitByName(userId, habitName) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = config.google_sheets.habit_sheet_name || 'habit_data';
        const range = `${sheetName}!A:G`;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[1] === userId && row[2] === habitName && row[6] === 'active') { // user_id, name, status
                return {
                    id: row[0],
                    userId: row[1],
                    name: row[2],
                    frequency: row[3],
                    difficulty: row[4],
                    currentStreak: parseInt(row[5]) || 0,
                    status: row[6]
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('習慣名検索エラー:', error);
        return null;
    }
}

/**
 * 指定日の習慣ログを取得（オーバーロード対応）
 * @param {string} userId - ユーザーID
 * @param {string} date - 日付 (YYYY-MM-DD)
 * @returns {Array} 習慣ログ配列
 */
async function getHabitLogsForDate(userId, date) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
        const range = `${sheetName}!A:D`;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const logs = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[1] === userId && row[3] === date) { // user_id, date
                logs.push({
                    timestamp: row[0],
                    userId: row[1],
                    habitId: row[2],
                    date: row[3]
                });
            }
        }
        
        return logs;
        
    } catch (error) {
        console.error('習慣ログ取得エラー:', error);
        return [];
    }
}

/**
 * 習慣ログを保存（オーバーロード対応）
 * @param {string} userId - ユーザーID
 * @param {string} habitId - 習慣ID
 * @param {string} date - 日付 (YYYY-MM-DD)
 * @param {string} notes - メモ（オプション）
 */
async function saveHabitLog(userId, habitId, date, notes = '') {
    try {
        // 既存の saveHabitLog 関数があるので、それを利用
        // 既に同じ日に記録があるかチェック
        const existingLog = await getHabitLogForDate(userId, habitId, date);
        if (existingLog) {
            console.log('✅ 習慣ログ既存:', { userId: userId.substring(0, 4) + '...', habitId: habitId.substring(0, 10) + '...', date });
            return;
        }
        
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const sheetName = config.google_sheets.habit_log_sheet_name || 'habit_logs';
        const range = `${sheetName}!A:D`;
        
        const values = [[
            moment().format('YYYY-MM-DD HH:mm:ss'), // 記録日時
            userId,
            habitId,
            date // 実行日
        ]];
        
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        
        console.log('✅ 習慣ログ保存 (連携):', { userId: userId.substring(0, 4) + '...', habitId: habitId.substring(0, 10) + '...', date });
        return Promise.resolve();
    } catch (error) {
        console.error('習慣ログ保存エラー (連携):', error);
        throw error;
    }
}

// module.exports の更新
module.exports = {
    // 日記関連
    saveDiaryToSheet,
    getDiaryEntry,
    getDiaryEntriesInRange,
    
    // 体重関連（完全版）
    saveWeightToSheet,
    getWeightEntry,
    getWeightEntriesInRange,
    getLastWeightEntry,
    getLatestWeightEntry,
    saveWeightGoal,
    getWeightGoal,
    getRoutineExecutionsInRange,
    getRoutineNamesCache,
    
    // ユーザープロフィール関連
    saveUserProfile,
    getUserProfile,
    
    // 習慣関連（完全版）
    saveHabitToSheet,
    getUserHabits,
    getHabitById,
    getHabitByName,
    saveHabitLog,
    getHabitLogForDate,
    getHabitLogsForDate,  // ← この行を追加
    getHabitLogsInRange,
    getHabitLogs,
    updateHabit,
    updateHabitStreak,
    deleteHabit,
// 日記目標関連（新規追加）
    saveDiaryGoal,
    getDiaryGoals,
    getDiaryGoalsByType,
    getDiaryStatsInRange,
    calculateDiaryGoalProgress,
 // ルーティン関連（新規追加）
    saveRoutineToSheet,
    getUserRoutines,
    getRoutineById,
    updateRoutine,
    saveRoutineStep,
    getRoutineSteps,
    updateRoutineStep,
    deleteRoutineStep,
    saveRoutineExecution,
    updateRoutineExecution,
    getActiveRoutineExecution,
    getRoutineExecutionHistory,
    getTodayRoutineExecutions,
    getRoutineStats,
    searchRoutines,
    getNextSimpleId,
    debugRoutineSheet,
    getSheetData,
    saveToSheet,
    getNextId,
    updateRoutineTotalExecutions,

// 新しい関数
    getFirstWeightEntry,
    getLatestWeightEntry,
    saveMealRecord,
    getMealRecordsForDate,
    getMealRecordsInRange,
    initializeMealLogsSheet,

// 🌟 Who Am I 関数（新規追加）
    getWhoAmIData,
    saveWhoAmIData,
    initializeWhoAmISheet,
    deleteWhoAmIData,
// リンク用
getHabitByName,
getHabitLogsForDate,
saveHabitLog, 
   // テスト用
    testConnection: async () => ({ success: true })
};
