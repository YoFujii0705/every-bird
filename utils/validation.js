const config = require('../config.json');

// 習慣データのバリデーション（カテゴリなし）
function validateHabitData(habitData) {
    const errors = [];
    
    if (!habitData.name || habitData.name.trim().length === 0) {
        errors.push('習慣名は必須です。');
    } else if (habitData.name.length > 50) {
        errors.push('習慣名は50文字以内で入力してください。');
    }
    
    if (!config.habit_frequencies[habitData.frequency]) {
        errors.push('無効な頻度です。daily, weekly, custom から選択してください。');
    }
    
    if (!config.habit_difficulties[habitData.difficulty]) {
        errors.push('無効な難易度です。easy, normal, hard から選択してください。');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// 習慣名の重複チェック
function validateUniqueHabitName(habitName, existingHabits) {
    return !existingHabits.some(habit => 
        habit.name.toLowerCase() === habitName.toLowerCase()
    );
}

// 日記データのバリデーション
function validateDiaryData(diaryData) {
    const errors = [];
    
    if (!diaryData.content || diaryData.content.trim().length === 0) {
        errors.push('日記内容は必須です。');
    } else if (diaryData.content.length > 2000) {
        errors.push('日記内容は2000文字以内で入力してください。');
    }
    
    if (!config.mood_emojis || !config.mood_emojis[diaryData.mood]) {
        errors.push('無効な気分絵文字です。');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// 入力サニタイゼーション
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // HTMLタグの除去
    let sanitized = input.replace(/<[^>]*>/g, '');
    
    // 先頭・末尾の空白を除去
    return sanitized.trim();
}

module.exports = {
    validateHabitData,
    validateUniqueHabitName,
    validateDiaryData,
    sanitizeInput
};
